import { ESTIMACION, REAL_HS, REAL_MARKET, SUPUESTO, VERIFICAR } from "../../provenance";
import { round2 } from "../../money";
import { R } from "../../logistics/types";
import { computeOperation, incotermOf, routeOf, sellerBearsTransitRisk, sellerMustInsure } from "../costs";
import type { DecisionCtx, ExportScenario } from "../types";
import { byAir, leg, opt, ownershipDecision, productName, routeDecisions, sellerClearsExport } from "./shared";
import { byVehicle, damageIncident, delayIncident, lateCollectionIncident } from "./incidents";
import { dangerousBookingDecision } from "./dangerous";

/**
 * CASO A5 (avanzado, fuera de la UE, MERCANCÍA PELIGROSA). Propuesta 4 (04/11/2026), decisión del dueño: las mercancías
 * peligrosas van dentro de las operaciones, no en un modo aparte. Reales: el código HS, que Emiratos no es de la UE y que
 * los perfumes con alcohol se transportan como UN 1266 «productos de perfumería», clase 3 (líquido inflamable). TODO lo
 * demás es SIMULADO (importes, tipos, plazos), y la normativa concreta (grupo de embalaje, cantidades limitadas, límites
 * en avión) se marca «verificar»: depende de la ficha de datos de seguridad del producto y de la edición vigente de cada
 * reglamento. Ediciones consultadas el 04/11/2026: Código IMDG, enmienda 42-24, obligatoria desde el 1/1/2026 (OMI).
 * Idea didáctica: cada tramo tiene su norma (ADR, IMDG, IATA DGR); la reserva se pide como peligrosa ANTES de embarcar;
 * embalaje homologado, etiquetas, declaración y certificado de arrumazón; y el grupaje, más barato, no asegura el plazo
 * porque los consolidadores agrupan la carga peligrosa en menos salidas.
 */
const revenueOf = (ctx: DecisionCtx) => computeOperation(ctx.scenario, ctx.settings).revenue;
const byContainer = (ctx: DecisionCtx) => routeOf(ctx.scenario, ctx.settings.transport).modality === "maritimo_fcl";

export const PERFUMES_DUBAI: ExportScenario = {
  id: "perfumes-dubai",
  title: "Perfumes de Granollers a Dubái (mercancía peligrosa)",
  difficulty: "avanzada",
  summary: "Un fabricante de perfumes envía su primer pedido a un distribuidor de Dubái. Fuera de la UE y con mercancía peligrosa: líquido inflamable de clase 3.",
  learningGoal: "Exportar mercancía peligrosa: identificarla con su ficha de datos de seguridad, aplicar la norma de cada medio (ADR, IMDG, IATA), reservar y embalar como peligrosa, y preparar su documentación específica.",
  instructions: [
    "Avanza etapa por etapa y lee la consecuencia de cada decisión antes de seguir.",
    "Ser mercancía peligrosa cambia la reserva del transporte, el embalaje, las etiquetas y los documentos: no es un detalle del final.",
    "La normativa concreta (grupo de embalaje, cantidades limitadas, límites en avión) depende de la ficha de datos de seguridad y de la edición vigente: en una operación real, consúltala o pide ayuda a un consejero de seguridad.",
  ],
  hs6: "330300",
  destination: "AE",
  company: { name: "Fragancias del Vallès, S.L. (ficticia)", city: "Granollers (Barcelona)", description: "Fabricante de perfumes de marca propia y para terceros; vende en la UE y es su primer envío a Oriente Medio." },
  buyer: { name: "Gulf Scents Trading LLC (ficticia)", city: "Dubái", description: "Distribuidor de perfumería para tiendas de aeropuerto y grandes almacenes de los Emiratos." },
  quantity: { units: 1000, unit: "caja", detail: "1.000 cajas de 12 frascos de 100 ml (12.000 frascos) en 6 palés (≈ 2.400 kg, 9 m³)" },
  exwUnitPrice: 96,
  unitCost: 80,
  targetMarginPct: 12,
  facts: [
    { label: "Producto", value: `${productName("330300")} (HS 330300)`, prov: REAL_HS },
    { label: "Destino", value: "Emiratos Árabes Unidos, fuera de la UE: despacho de exportación y de importación", prov: REAL_MARKET },
    { label: "Mercancía peligrosa", value: "Perfumes con alcohol: UN 1266, «productos de perfumería», clase 3 (líquido inflamable)", prov: { kind: "real", source: "Lista de mercancías peligrosas de las Recomendaciones de la ONU (UN 1266, clase 3)" } },
    { label: "Grupo de embalaje", value: "II en este caso (punto de inflamación por debajo de 23 °C según la ficha de datos de seguridad del fabricante). Depende de cada producto", prov: VERIFICAR },
    { label: "Normas de transporte", value: "ADR por carretera, Código IMDG por mar (enmienda 42-24, obligatoria desde el 1/1/2026) e IATA DGR por avión: comprobar la edición vigente", prov: VERIFICAR },
    { label: "Pedido", value: "1.000 cajas de 12 frascos de 100 ml en 6 palés · ≈ 2.400 kg · 9 m³", prov: SUPUESTO },
    { label: "Precio en origen (EXW)", value: "96,00 € por caja, embalaje estándar incluido", prov: SUPUESTO },
    { label: "Coste de producción", value: "80,00 € por caja", prov: SUPUESTO },
    { label: "Plazo pactado", value: "Llegada a Dubái como máximo 35 días después del pedido; 5 días de preparación", prov: SUPUESTO },
    { label: "Arancel e impuesto del caso", value: "Arancel general 5 % sin acuerdo preferencial; impuesto de importación 5 %: tipos SIMULADOS", prov: ESTIMACION },
  ],
  logistics: {
    origin: "Granollers", destinationPlace: "Dubái (almacén del distribuidor)",
    cargo: { goods: "peligrosa", pallets: 6, grossKg: 2_400, volumeM3: 9, dangerous: { un: "UN 1266", name: "Productos de perfumería", hazardClass: "3", packingGroup: "II" } },
    routes: [
      { id: "fcl", modality: "maritimo_fcl", label: "Contenedor de 20' Barcelona–Jebel Ali", transshipments: [], waitDays: R(2, 5),
        legs: [leg("camion", "Granollers", "puerto de Barcelona", [1, 1], "recogida", { kind: "camion_completo", km: 40 }),
          leg("barco", "Barcelona", "Jebel Ali (Dubái)", [16, 20], "principal", { kind: "fcl", per20: R(1700, 2500), per40: R(2400, 3500) }),
          leg("camion", "terminal de Jebel Ali", "almacén del distribuidor", [1, 1], "ultima_milla")],
        terminal: { kind: "por_contenedor", origin: R(200, 300), destination: R(220, 340) }, destinationCharges: R(150, 260), suitability: [] },
      { id: "lcl", modality: "maritimo_lcl", label: "Grupaje marítimo de mercancía peligrosa (consolidado en Barcelona)", transshipments: ["consolidación en Barcelona", "desconsolidación en Jebel Ali"], waitDays: R(5, 9),
        legs: [leg("camion", "Granollers", "almacén de consolidación (Barcelona)", [1, 1], "recogida"),
          leg("barco", "Barcelona", "Jebel Ali (Dubái)", [18, 24], "principal", { kind: "lcl", perRevenueTon: R(110, 160) }),
          leg("camion", "almacén de desconsolidación", "almacén del distribuidor", [1, 2], "ultima_milla")],
        terminal: { kind: "por_tonelada_volumen", origin: R(35, 50), destination: R(35, 55) }, destinationCharges: R(180, 300),
        suitability: [{ penalty: 15, note: "Pocos consolidadores aceptan carga peligrosa y la agrupan en menos salidas: más espera y más manipulaciones de un líquido inflamable." }] },
      // Con esta cantidad de líquido inflamable se supone avión solo de carga (más caro que la bodega de un avión de pasajeros).
      { id: "aereo", modality: "aereo", label: "Avión de carga Barcelona–Dubái", transshipments: [], waitDays: R(1, 3),
        legs: [leg("camion", "Granollers", "aeropuerto de Barcelona", [1, 1], "recogida"),
          leg("avion", "Barcelona", "Dubái", [1, 2], "principal", { kind: "aereo", perChargeableKg: R(3.6, 5.0) }),
          leg("camion", "aeropuerto de Dubái", "almacén del distribuidor", [1, 1], "ultima_milla")],
        terminal: { kind: "por_kg_tasable", origin: R(0.1, 0.16), destination: R(0.1, 0.18) }, destinationCharges: R(90, 170),
        suitability: [{ penalty: 15, note: "Líquido inflamable en avión: límites por bulto en avión de pasajeros, a veces solo avión de carga, y revisión de aceptación de la aerolínea (verificar en IATA DGR)." }] },
    ],
    infeasible: [
      { modality: "carretera", reason: "Por carretera habría que cruzar varios países fuera de la UE con mercancía peligrosa y regímenes de tránsito distintos: no es razonable para este envío." },
      { modality: "ferroviario", reason: "No hay un servicio ferroviario práctico entre España y los Emiratos." },
    ],
    geographyNote: "Granollers está a unos 40 km del puerto de Barcelona, que tiene servicio regular con Jebel Ali. El tramo por carretera hasta el puerto ya va con normas ADR.",
    decisiveReason: "barata_que_cumple",
  },
  packing: [
    { id: "homologado", label: "Embalajes homologados ONU para líquidos inflamables, con marcado, número UN 1266 y etiqueta de clase 3", cost: 1400, protects: true },
    { id: "cosmetica", label: "Cajas estándar de cosmética, sin marcado ni etiquetas de mercancía peligrosa", cost: 500, protects: false },
  ],
  duty: { generalRatePct: 5, preferentialRatePct: 5, originProofDoc: "certificado_origen" },
  importVatRatePct: 5,
  sellerVatRegisteredAtDestination: false,
  deadlineDays: 35,
  prepDays: 5,
  standard: { transport: "fcl", packing: "homologado" },
  incoterms: ["CIP", "CIF", "FCA", "DAP", "DDP"],
  decisions: [
    {
      id: "verificacion", stage: "ficha", kind: "single", title: "Primera comprobación",
      prompt: "Antes de preparar la oferta, ¿qué compruebas primero?",
      concept: "La ficha de datos de seguridad (FDS) del producto indica en su sección 14 si es mercancía peligrosa para el transporte: número ONU, clase y grupo de embalaje. De ahí depende todo lo demás.",
      options: [
        opt("fds", "Si es mercancía peligrosa para el transporte, con la sección 14 de la ficha de datos de seguridad", "correcta", "Bien: los perfumes con alcohol son líquido inflamable (UN 1266, clase 3). Cambia el transporte, el embalaje, los documentos y el coste."),
        opt("arancel", "El arancel de importación en los Emiratos", "razonable", "Necesario, pero antes tienes que saber si la mercancía es peligrosa: condiciona qué transporte la acepta y cuánto cuesta."),
        opt("nada", "Nada especial: es un cosmético de consumo", "grave", "Un perfume con alcohol es inflamable: enviarlo como carga general es ocultar mercancía peligrosa, con riesgo para el transporte y sanciones."),
      ],
      best: "fds", whyBest: "Lo primero es identificar si la mercancía es peligrosa: decide todo el transporte.",
    },
    {
      id: "requisito", stage: "preparacion", kind: "single", title: "Norma de cada tramo",
      prompt: "La mercancía irá en camión hasta el puerto o el aeropuerto y después por mar o por aire. ¿Qué normas de mercancías peligrosas se aplican?",
      concept: "Cada medio tiene su reglamento: ADR por carretera, RID por ferrocarril, Código IMDG por mar e Instrucciones Técnicas de la OACI / IATA DGR por aire. En un envío multimodal se cumple la de cada tramo.",
      options: [
        opt("cada_tramo", "La de cada tramo: ADR en el camión, IMDG en el barco (o IATA DGR si va en avión)", "correcta", "Correcto: el camión hasta el puerto ya circula con ADR, y la naviera exige el Código IMDG."),
        opt("solo_adr", "Solo el ADR, que es la norma de mercancías peligrosas", "grave", "El ADR solo regula la carretera: el barco se rige por el Código IMDG y el avión por la IATA DGR."),
        opt("exento", "Ninguna: los productos de consumo están siempre exentos", "grave", "Hay excepciones parciales (como las cantidades limitadas), pero dependen de cantidades y embalajes concretos y nunca eximen de todo: hay que comprobarlo."),
      ],
      best: "cada_tramo", whyBest: "En un envío multimodal se cumple la norma de cada medio.",
    },
    {
      id: "incoterm", stage: "contrato", kind: "single", title: "Incoterm del contrato",
      prompt: "El distribuidor quiere el precio con transporte y seguro pagados hasta Dubái. La mercancía irá en contenedor o en grupaje. ¿Qué Incoterm propones?",
      concept: "Para contenedores, la ICC recomienda reglas multimodales (FCA, CPT, CIP) en lugar de FOB, CFR o CIF. Con mercancía peligrosa, quien contrata el transporte es quien gestiona la reserva como peligrosa.",
      options: [
        opt("CIP", "CIP Jebel Ali", "correcta", "Cubre lo que pide (transporte y seguro hasta destino) y encaja con el contenedor. Además controlas tú la reserva de mercancía peligrosa."),
        opt("CIF", "CIF Jebel Ali", "razonable", "Habitual, pero con contenedor el riesgo pasa a bordo cuando ya no controlas la carga, y el seguro mínimo de CIF es de cobertura limitada."),
        opt("FCA", "FCA terminal de Barcelona", "razonable", "Cómodo para ti, pero el distribuidor pidió el transporte pagado; tendría que reservar él un transporte de mercancía peligrosa desde Dubái."),
        opt("DAP", "DAP almacén del distribuidor", "razonable", "Válido, pero asumes el riesgo de todo el viaje de un líquido inflamable sin que el cliente lo pida."),
        opt("DDP", "DDP Dubái", "grave", "Tendrías que importar en los Emiratos y pagar aranceles e impuestos sin estar registrado allí."),
      ],
      best: "CIP", whyBest: "Transporte y seguro pagados hasta destino con contenedor: CIP.",
    },
    ownershipDecision,
    {
      id: "payment", stage: "contrato", kind: "single", title: "Forma de cobro",
      prompt: "Primer pedido de este distribuidor, de casi 100.000 €. En la región es habitual la carta de crédito. ¿Qué forma de cobro propones?",
      options: [
        opt("carta_credito", "Carta de crédito confirmada", "correcta", "Máxima seguridad para un pedido grande con un cliente nuevo, y es habitual en la región. Cuidado: con mercancía peligrosa hay más documentos, y cualquier discrepancia retrasa el cobro."),
        opt("cobro_documentario", "Cobro documentario: documentos contra pago (D/P)", "razonable", "Más barato, pero si el distribuidor no paga te quedas con un contenedor de mercancía peligrosa en Dubái."),
        opt("anticipado", "Pago anticipado del 100 %", "razonable", "Sin riesgo para ti, pero difícil de aceptar para un distribuidor que no te conoce."),
        opt("abierta_60", "Cuenta abierta a 60 días", "grave", "Envías casi 100.000 € a un cliente nuevo fuera de la UE sin ninguna garantía."),
      ],
      best: "carta_credito", whyBest: "Pedido grande, cliente nuevo y práctica habitual en la región: carta de crédito confirmada.",
    },
    ...routeDecisions("6 palés (≈2,4 t, 9 m³) de líquido inflamable de clase 3, 35 días de plazo y 5 de preparación. Compara las alternativas y elige la ruta."),
    dangerousBookingDecision,
    {
      id: "packing", stage: "logistica", kind: "single", title: "Embalaje y etiquetado",
      prompt: "¿Cómo embalas y marcas los frascos para el viaje?",
      concept: "La mercancía peligrosa viaja en embalajes homologados para su clase y grupo de embalaje, marcados con el número ONU y con la etiqueta de peligro (clase 3: llama). Hay excepciones por cantidades limitadas, con condiciones estrictas.",
      options: [
        opt("homologado", "Embalajes homologados ONU, marcados con UN 1266 y etiqueta de clase 3 (1.400 €)", "correcta", "Correcto: es lo que exigen las normas de transporte y lo que revisará la terminal."),
        opt("cosmetica", "Cajas estándar de cosmética, sin marcado ni etiquetas (500 €)", "grave", "La terminal no aceptará un líquido inflamable sin embalaje homologado ni etiquetas: carga rechazada."),
      ],
      best: "homologado", whyBest: "Embalaje homologado, marcado y etiquetado según la clase de peligro.",
    },
    {
      id: "insurance", stage: "logistica", kind: "single", title: "Seguro de transporte",
      prompt: (ctx) => `En ${ctx.settings.incoterm} el riesgo del viaje es tuyo y la regla no te obliga a asegurar. ¿Contratas seguro?`,
      appliesIf: (ctx) => !!ctx.settings.incoterm && sellerBearsTransitRisk(incotermOf(ctx.settings.incoterm)) && !sellerMustInsure(incotermOf(ctx.settings.incoterm)),
      options: [
        opt("si", "Sí, por el 110 % del precio del contrato, declarando que es mercancía peligrosa", "correcta", "Cubres un riesgo que es tuyo; la póliza debe saber qué se transporta."),
        opt("no", "No", "razonable", "Ahorras la prima, pero una pérdida o un derrame en el viaje lo pagarías tú."),
      ],
      best: "si", whyBest: "Quien soporta el riesgo del transporte es quien debe valorar asegurarlo.",
    },
    {
      id: "documents", stage: "documentacion", kind: "multi", title: "Documentación del envío",
      prompt: "Marca los documentos que debes preparar o gestionar como exportador.",
      concept: "Además de los documentos comerciales y de aduana, la mercancía peligrosa lleva su declaración de transporte (la del IMDG por mar; la «Shipper's Declaration for Dangerous Goods» por avión) y, si va en contenedor, el certificado de arrumazón.",
      docs: (ctx) => [
        { id: "factura", label: "Factura comercial", need: "obligatorio", explain: "Base del despacho en los dos países y del cobro." },
        { id: "packing_list", label: "Packing list (lista de bultos)", need: "obligatorio", explain: "La aduana, la terminal y el distribuidor comprueban con ella bultos y pesos." },
        byAir(ctx)
          ? { id: "awb", label: "Conocimiento aéreo (AWB)", need: "obligatorio", explain: "Contrato del transporte aéreo; con mercancía peligrosa la aerolínea revisa además la declaración." }
          : { id: "bl", label: "Conocimiento de embarque (B/L)", need: ctx.settings.incoterm === "FCA" ? "recomendado" : "obligatorio", explain: "Contrato del transporte marítimo y título de la mercancía; con carta de crédito es un documento clave." },
        { id: "dua_exportacion", label: "DUA de exportación", need: sellerClearsExport(ctx) ? "obligatorio" : "innecesario", explain: "Despachas tú la exportación: el DUA con salida prueba además la exención de IVA." },
        byAir(ctx)
          ? { id: "dgd", label: "Declaración del expedidor de mercancías peligrosas (IATA)", need: "obligatorio", explain: "La firma el expedidor y la revisa la aerolínea antes de aceptar la carga." }
          : { id: "dgd", label: "Declaración de mercancías peligrosas (Código IMDG)", need: "obligatorio", explain: "Identifica la mercancía (número ONU, designación, clase, grupo de embalaje, cantidades) ante la naviera." },
        { id: "arrumazon", label: "Certificado de arrumazón del contenedor", need: byContainer(ctx) ? "obligatorio" : "innecesario", explain: byContainer(ctx) ? "Por mar, quien llena el contenedor certifica que la carga peligrosa está estibada, sujeta, marcada y rotulada correctamente." : "Solo se emite cuando llenas tú un contenedor completo." },
        { id: "fds", label: "Ficha de datos de seguridad (FDS)", need: "recomendado", explain: "No sustituye a la declaración, pero navieras, aerolíneas y el distribuidor suelen pedirla." },
        { id: "certificado_origen", label: "Certificado de origen de la Cámara de Comercio", need: "recomendado", explain: "Sin acuerdo preferencial no rebaja el arancel, pero muchos importadores de la región lo piden para despachar (verificar en una operación real)." },
        { id: "eur1", label: "Certificado de circulación EUR.1", need: "incorrecto", explain: "Solo sirve con países con acuerdo preferencial con la UE que lo prevé; no es el caso." },
      ],
    },
    {
      id: "clasificacion", stage: "aduanas", kind: "single", title: "Clasificación arancelaria",
      prompt: "¿Con qué código HS6 declaras los perfumes?",
      concept: "El código HS clasifica la mercancía para la aduana. Es distinto del número ONU, que la identifica como mercancía peligrosa para el transporte: un envío lleva los dos.",
      options: [
        opt("330300", "330300: perfumes y aguas de colonia", "correcta", "Correcto: es el código del catálogo de SmarTrade para perfumes."),
        opt("1266", "El 1266, su número ONU", "grave", "El número ONU identifica el peligro para el transporte; la aduana clasifica con el código HS."),
        opt("220890", "220890: bebidas espirituosas, porque llevan alcohol", "grave", "Llevar alcohol no los convierte en bebidas: una clasificación errónea cambia el arancel y puede suponer sanciones."),
      ],
      best: "330300", whyBest: "Código HS para la aduana y número ONU para el transporte: son cosas distintas.",
    },
    {
      // Aplica con cualquier Incoterm: el marcado, el etiquetado y los datos de la declaración son del expedidor (el vendedor).
      id: "incidencia", variant: "A", stage: "entrega", kind: "single", incident: true, title: "Incidencia: carga peligrosa detenida en la terminal",
      prompt: "La terminal de salida detiene la carga: faltan las etiquetas de clase 3 en dos bultos y la declaración de mercancías peligrosas no indica el grupo de embalaje. La salida prevista se pierde si no se corrige hoy.",
      options: [
        opt("corregir", "Reetiquetar los bultos, corregir la declaración con la ficha de datos de seguridad y pedir embarque en la siguiente salida si no llega a tiempo", "correcta",
          "Se corrige en el día y se embarca en la salida siguiente. Pagas la manipulación y el almacenaje de esos días.",
          () => ({ concept: "incidencia", label: "Reetiquetado, corrección de la declaración y almacenaje", amount: 420, payer: "vendedor", note: "Importes simulados." })),
        opt("embarcar", "Pedir que lo embarquen igualmente y enviar las etiquetas y la declaración corregida después", "grave",
          "Una carga peligrosa mal identificada no se embarca: la terminal la retiene una semana, la naviera cobra la anulación de la reserva y el distribuidor te pide un descuento por el retraso.",
          (ctx) => ({ concept: "incidencia", label: "Retención de una semana, anulación de la reserva y descuento", amount: round2(7 * 90 + 350 + 0.02 * revenueOf(ctx)), payer: "vendedor", note: "7 × 90 € + 350 € + 2 % del pedido (simulados)." })),
        opt("general", "Retirar las etiquetas y enviarla como carga general para no perder la salida", "grave",
          "Es ocultar mercancía peligrosa: la terminal lo detecta, la carga se queda en tierra y la empresa se expone a una sanción grave.",
          (ctx) => ({ concept: "incidencia", label: "Carga retenida y gastos por declaración falsa", amount: round2(1800 + 0.02 * revenueOf(ctx)), payer: "vendedor", note: "Gastos, nueva reserva y descuento (simulados; la sanción administrativa no se calcula)." })),
      ],
      best: "corregir", whyBest: "Una mercancía peligrosa solo se embarca bien identificada, embalada y documentada.",
    },
    damageIncident({ variant: "B", what: "las cajas de frascos (roturas y derrame de líquido inflamable)", damagedPct: 2, reshipCost: 1200 }),
    delayIncident({ variant: "C", days: 6, urgentCost: 3200, cause: byVehicle({ camion: "Un fallo en el transporte retrasa la entrega.", barco: "La congestión en el puerto de Jebel Ali retrasa el atraque del buque.", avion: "La aerolínea deja la carga peligrosa para el siguiente vuelo de carga." }) }),
    lateCollectionIncident({ variant: "D", daysOver: 5, perDay: 120 }),
    {
      id: "cierre", stage: "entrega", kind: "single", title: "Cobro y cierre",
      prompt: "El banco ha pagado la carta de crédito y el distribuidor ha retirado la mercancía. ¿Qué haces para cerrar la operación?",
      options: [
        opt("archivar", "Comparar el margen real con el previsto y archivar factura, B/L o AWB, declaración de mercancías peligrosas y DUA", "correcta", "Así sabes si el precio era adecuado y conservas la documentación de mercancía peligrosa durante el tiempo que exige la norma (verificar plazos)."),
        opt("solo_factura", "Archivar solo la factura", "grave", "La documentación de mercancía peligrosa y el DUA deben conservarse: son la prueba de que el envío se hizo conforme a la norma y de la exportación."),
      ],
      best: "archivar", whyBest: "Cerrar una operación es comprobar el resultado y guardar las pruebas.",
    },
  ],
};
