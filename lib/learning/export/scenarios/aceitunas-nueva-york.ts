import { ESTIMACION, REAL_HS, REAL_MARKET, SUPUESTO, VERIFICAR } from "../../provenance";
import { round2 } from "../../money";
import { R } from "../../logistics/types";
import { computeOperation, incotermOf, sellerBearsTransitRisk, sellerMustInsure } from "../costs";
import type { DecisionCtx, ExportScenario } from "../types";
import { byAir, leg, opt, ownershipDecision, productName, routeDecisions, sellerClearsExport } from "./shared";

/**
 * CASO A4 (avanzado, fuera de la UE, sin acuerdo comercial). Reales: el código HS y que EE. UU. no es de la UE. TODO
 * lo demás es SIMULADO, incluido el arancel (8 %, igual con o sin certificado de origen porque en el caso no hay
 * acuerdo preferencial UE–EE. UU.). Los trámites de la FDA se marcan «verificar».
 * Idea didáctica: el puerto de Sevilla no tiene servicio transatlántico directo en el caso, así que el contenedor va en
 * camión a Algeciras; 20 m³ aprovechan bien un contenedor de 20'; sin acuerdo comercial, acreditar el origen no
 * rebaja el arancel; y un dato que falta en el aviso previo a la FDA retiene el contenedor.
 */
const revenueOf = (ctx: DecisionCtx) => computeOperation(ctx.scenario, ctx.settings).revenue;

export const ACEITUNAS_NUEVA_YORK: ExportScenario = {
  id: "aceitunas-nueva-york",
  title: "Aceitunas de mesa de Sevilla a Nueva York",
  difficulty: "avanzada",
  summary: "Una envasadora sevillana envía su primer contenedor a un importador de Nueva Jersey. Fuera de la UE, sin acuerdo comercial y con requisitos de la FDA.",
  learningGoal: "Gestionar una exportación transatlántica en contenedor: ruta con tramo por carretera hasta el puerto, Incoterm para contenedor, cobro con conocimiento de embarque, arancel sin preferencias y requisitos sanitarios del importador.",
  instructions: [
    "Avanza etapa por etapa y lee la consecuencia de cada decisión antes de seguir.",
    "Fíjate en lo que cambia cuando no hay acuerdo comercial: la prueba de origen ya no rebaja el arancel.",
    "Los tipos de arancel son simulados y los trámites de la FDA deben comprobarse en una operación real.",
  ],
  hs6: "200570",
  destination: "US",
  company: { name: "Aceitunas del Aljarafe, S.A. (ficticia)", city: "Sevilla", description: "Envasadora de aceitunas de mesa con ventas en Europa; primera operación en Estados Unidos." },
  buyer: { name: "Garden State Fine Foods LLC (ficticia)", city: "Newark (Nueva Jersey)", description: "Importador y distribuidor de alimentación mediterránea para supermercados de la costa este." },
  quantity: { units: 1200, unit: "caja", detail: "1.200 cajas de 12 tarros de vidrio en 14 palés (≈ 11 t, 20 m³)" },
  exwUnitPrice: 30,
  unitCost: 23.4,
  targetMarginPct: 16,
  facts: [
    { label: "Producto", value: `${productName("200570")} (HS 200570)`, prov: REAL_HS },
    { label: "Destino", value: "Estados Unidos, fuera de la UE: despacho de exportación y de importación", prov: REAL_MARKET },
    { label: "Acuerdo comercial", value: "En el caso no hay acuerdo preferencial UE–EE. UU.: se paga el arancel general (compruébalo en Access2Markets)", prov: VERIFICAR },
    { label: "Requisitos de la FDA", value: "Registro de la instalación alimentaria y aviso previo (Prior Notice) antes de la llegada: comprobar en la web de la FDA", prov: VERIFICAR },
    { label: "Pedido", value: "1.200 cajas de 12 tarros en 14 palés · ≈ 11.000 kg · 20 m³", prov: SUPUESTO },
    { label: "Precio en origen (EXW)", value: "30,00 € por caja, embalaje estándar incluido", prov: SUPUESTO },
    { label: "Coste de producción", value: "23,40 € por caja", prov: SUPUESTO },
    { label: "Plazo pactado", value: "Llegada al almacén del importador como máximo 45 días después del pedido; 5 días de preparación", prov: SUPUESTO },
    { label: "Arancel del caso", value: "8 % sobre el valor en aduana, con o sin certificado de origen: tipo SIMULADO", prov: ESTIMACION },
  ],
  logistics: {
    origin: "Sevilla", destinationPlace: "Newark (almacén del importador)",
    cargo: { goods: "fragil", pallets: 14, grossKg: 11_000, volumeM3: 20 },
    routes: [
      { id: "fcl", modality: "maritimo_fcl", label: "Contenedor de 20' vía Algeciras (camión + buque + camión)", transshipments: [], waitDays: R(2, 5),
        legs: [leg("camion", "Sevilla", "puerto de Algeciras", [1, 1], "recogida", { kind: "camion_completo", km: 190 }),
          leg("barco", "Algeciras", "Nueva York/Nueva Jersey", [10, 14], "principal", { kind: "fcl", per20: R(1500, 2300), per40: R(2100, 3200) }),
          leg("camion", "terminal de Nueva Jersey", "almacén del importador", [1, 2], "ultima_milla")],
        terminal: { kind: "por_contenedor", origin: R(200, 300), destination: R(200, 300) }, destinationCharges: R(120, 220), suitability: [] },
      { id: "lcl", modality: "maritimo_lcl", label: "Grupaje marítimo (consolidado en Algeciras)", transshipments: ["consolidación en Algeciras", "desconsolidación en Nueva York"], waitDays: R(4, 8),
        legs: [leg("camion", "Sevilla", "almacén de consolidación", [1, 1], "recogida"),
          leg("barco", "Algeciras", "Nueva York/Nueva Jersey", [12, 16], "principal", { kind: "lcl", perRevenueTon: R(85, 120) }),
          leg("camion", "almacén de desconsolidación", "almacén del importador", [1, 2], "ultima_milla")],
        terminal: { kind: "por_tonelada_volumen", origin: R(32, 50), destination: R(32, 50) }, destinationCharges: R(150, 260),
        suitability: [{ penalty: 20, note: "Tarros de vidrio en grupaje: consolidar y desconsolidar añade manipulaciones y riesgo de roturas." }] },
      { id: "aereo", modality: "aereo", label: "Avión Sevilla–Nueva York con escala en Madrid", transshipments: ["Madrid-Barajas"], waitDays: R(1, 2),
        legs: [leg("camion", "Sevilla", "aeropuerto de Sevilla", [0, 1], "recogida"),
          leg("avion", "Sevilla", "Nueva York JFK (escala en Madrid)", [1, 2], "principal", { kind: "aereo", perChargeableKg: R(2.4, 3.6) }),
          leg("camion", "aeropuerto JFK", "almacén del importador", [1, 1], "ultima_milla")],
        terminal: { kind: "por_kg_tasable", origin: R(0.08, 0.14), destination: R(0.1, 0.16) }, destinationCharges: R(80, 150), suitability: [] },
    ],
    infeasible: [
      { modality: "carretera", reason: "No hay ruta terrestre: hay que cruzar el océano Atlántico." },
      { modality: "ferroviario", reason: "No hay ruta terrestre: hay que cruzar el océano Atlántico." },
    ],
    geographyNote: "El puerto de Sevilla no tiene servicio directo transatlántico en este caso: el contenedor va en camión a Algeciras, que sí lo tiene.",
    decisiveReason: "aprovecha_capacidad",
  },
  packing: [
    { id: "separadores", label: "Cajas con separadores de cartón, palés retractilados y bolsas desecantes en el contenedor", cost: 650, protects: true },
    { id: "simple", label: "Cajas sin separadores", cost: 250, protects: false },
  ],
  duty: { generalRatePct: 8, preferentialRatePct: 8, originProofDoc: "certificado_origen" },
  importVatRatePct: null,
  sellerVatRegisteredAtDestination: false,
  deadlineDays: 45,
  prepDays: 5,
  standard: { transport: "fcl", packing: "separadores" },
  incoterms: ["CIP", "CIF", "FCA", "DDP", "EXW"],
  decisions: [
    {
      id: "verificacion", stage: "ficha", kind: "single", title: "Primera comprobación",
      prompt: "Antes de preparar la oferta, ¿qué compruebas primero?",
      concept: "Para alimentos, además del arancel, el país de destino puede exigir registros y avisos sanitarios antes de que llegue la mercancía.",
      options: [
        opt("acceso", "El arancel de la partida y los requisitos de la FDA para alimentos importados (registro y aviso previo)", "correcta", "Bien: sin esos trámites el contenedor no se despacha, y el arancel condiciona el precio que verá el importador."),
        opt("informe", "Un informe de solvencia del importador", "razonable", "Útil para el cobro, pero lo primero es saber si el producto puede entrar y con qué arancel."),
        opt("eur1", "Cómo emitir el EUR.1 para el arancel preferencial", "grave", "En el caso no hay acuerdo preferencial con EE. UU.: el EUR.1 no sirve aquí."),
      ],
      best: "acceso", whyBest: "Fuera de la UE, lo primero es saber qué aranceles y requisitos encontrará el producto.",
    },
    {
      id: "requisito", stage: "preparacion", kind: "single", title: "Requisito pendiente",
      prompt: "El importador pregunta si tu fábrica está preparada para vender alimentos en EE. UU. ¿Qué queda pendiente?",
      concept: "En EE. UU. las instalaciones que producen alimentos para ese mercado se registran ante la FDA, y cada envío necesita un aviso previo antes de llegar (compruébalo en una operación real).",
      options: [
        opt("fda", "Registrar la instalación ante la FDA y dar al importador los datos para el aviso previo de cada envío", "correcta", "Correcto: sin registro ni aviso previo la mercancía se retiene en el puerto."),
        opt("ninguno", "Nada: las aceitunas en conserva no tienen requisitos especiales", "grave", "Los alimentos importados tienen controles sanitarios; sin los trámites el contenedor queda retenido."),
        opt("sanitario_ue", "Enviar el registro sanitario español como único documento", "razonable", "Acredita tu empresa en España, pero no sustituye los trámites de la FDA."),
      ],
      best: "fda", whyBest: "Cumplir los requisitos sanitarios del destino antes de enviar evita retenciones.",
    },
    {
      id: "incoterm", stage: "contrato", kind: "single", title: "Incoterm del contrato",
      prompt: "El importador quiere el precio con transporte y seguro pagados hasta la terminal de Nueva Jersey. La mercancía irá en contenedor. ¿Qué Incoterm propones?",
      concept: "Para contenedores, la ICC recomienda reglas multimodales (FCA, CPT, CIP) en lugar de FOB, CFR o CIF, porque el contenedor se entrega en la terminal antes de cargarse en el buque.",
      options: [
        opt("CIP", "CIP Nueva Jersey (terminal)", "correcta", "Cubre lo que pide (transporte y seguro hasta destino) y encaja con el contenedor, con seguro de cobertura amplia."),
        opt("CIF", "CIF Nueva York", "razonable", "Habitual, pero con contenedor el riesgo pasa a bordo cuando ya no controlas la carga, y el seguro mínimo de CIF es limitado."),
        opt("FCA", "FCA Sevilla (tus instalaciones)", "razonable", "Muy cómodo para ti, pero el importador pidió el transporte pagado."),
        opt("DDP", "DDP Newark", "grave", "Tendrías que importar en EE. UU., pagar el arancel y cumplir allí como importador: no estás preparado."),
        opt("EXW", "EXW Sevilla", "grave", "El importador tendría que despachar la exportación en España: poco práctico y te deja sin prueba de salida."),
      ],
      best: "CIP", whyBest: "Transporte y seguro pagados hasta destino con contenedor: CIP.",
    },
    ownershipDecision,
    {
      id: "payment", stage: "contrato", kind: "single", title: "Forma de cobro",
      prompt: "Primera operación con este importador, envío marítimo con conocimiento de embarque. ¿Qué forma de cobro propones?",
      options: [
        opt("cobro_documentario", "Cobro documentario: documentos contra pago (D/P)", "correcta", "Buen equilibrio: el importador solo recibe el conocimiento de embarque (y con él el contenedor) cuando paga."),
        opt("carta_credito", "Carta de crédito confirmada", "razonable", "Máxima seguridad, pero más cara y exigente con los documentos para un país de riesgo bajo."),
        opt("anticipado", "Pago anticipado del 100 %", "razonable", "Sin riesgo para ti, pero muchos importadores no lo aceptan con un proveedor nuevo."),
        opt("abierta_60", "Cuenta abierta a 60 días", "grave", "Envías un contenedor al otro lado del Atlántico a un cliente nuevo sin ninguna garantía."),
      ],
      best: "cobro_documentario", whyBest: "Por mar, el conocimiento de embarque controla la mercancía: vincular su entrega al pago reduce el riesgo a bajo coste.",
    },
    ...routeDecisions("14 palés (≈11 t, 20 m³) de tarros de vidrio, 45 días de plazo y 5 de preparación. Compara las alternativas y elige la ruta."),
    {
      id: "packing", stage: "logistica", kind: "single", title: "Embalaje",
      prompt: "Tarros de vidrio que cruzarán el Atlántico en contenedor, con condensación por los cambios de temperatura. ¿Qué embalaje usas?",
      options: [
        opt("separadores", "Cajas con separadores, palés retractilados y desecantes (650 €)", "correcta", "Protege el vidrio de golpes y las etiquetas de la humedad dentro del contenedor."),
        opt("simple", "Cajas sin separadores (250 €)", "grave", "Ahorras 400 €, pero las roturas y las etiquetas dañadas acaban en reclamaciones del importador."),
      ],
      best: "separadores", whyBest: "En una travesía larga, el embalaje debe proteger del golpe y de la humedad.",
    },
    {
      id: "insurance", stage: "logistica", kind: "single", title: "Seguro de transporte",
      prompt: (ctx) => `En ${ctx.settings.incoterm} el riesgo del viaje es tuyo y la regla no te obliga a asegurar. ¿Contratas seguro?`,
      appliesIf: (ctx) => !!ctx.settings.incoterm && sellerBearsTransitRisk(incotermOf(ctx.settings.incoterm)) && !sellerMustInsure(incotermOf(ctx.settings.incoterm)),
      options: [
        opt("si", "Sí, al 110 % del valor", "correcta", "Cubres un riesgo que es tuyo hasta destino."),
        opt("no", "No", "razonable", "Ahorras la prima, pero una pérdida en el mar la asumirías tú."),
      ],
      best: "si", whyBest: "Quien soporta el riesgo del transporte es quien debe valorar asegurarlo.",
    },
    {
      id: "documents", stage: "documentacion", kind: "multi", title: "Documentación del envío",
      prompt: "Marca los documentos que debes preparar o gestionar como exportador.",
      docs: (ctx) => [
        { id: "factura", label: "Factura comercial", need: "obligatorio", explain: "Base del despacho en los dos países y del cobro; debe indicar el país de origen." },
        { id: "packing_list", label: "Packing list (lista de bultos)", need: "obligatorio", explain: "La aduana y el importador comprueban con ella bultos y pesos." },
        byAir(ctx)
          ? { id: "awb", label: "Conocimiento aéreo (AWB)", need: "obligatorio", explain: "Contrato del transporte aéreo. No es un título de la mercancía: con avión, el cobro documentario protege menos." }
          : { id: "bl", label: "Conocimiento de embarque (B/L)", need: ctx.settings.incoterm === "EXW" || ctx.settings.incoterm === "FCA" ? "recomendado" : "obligatorio", explain: "Contrato del transporte marítimo y título que da derecho a retirar la mercancía; en el cobro documentario es clave." },
        { id: "dua_exportacion", label: "DUA de exportación", need: sellerClearsExport(ctx) ? "obligatorio" : "innecesario", explain: sellerClearsExport(ctx) ? "Despachas tú la exportación: el DUA con salida prueba además la exención de IVA." : "Con EXW la exportación la despacha el comprador." },
        { id: "fda", label: "Número de registro FDA y datos para el aviso previo (Prior Notice)", need: "obligatorio", explain: "El importador o su agente presentan el aviso antes de la llegada; sin tus datos el contenedor se retiene." },
        { id: "certificado_origen", label: "Certificado de origen de la Cámara de Comercio", need: "innecesario", explain: "Sin acuerdo preferencial no rebaja el arancel; el origen se indica en la factura y en el etiquetado (verificar si el importador lo pide)." },
        { id: "eur1", label: "Certificado de circulación EUR.1", need: "incorrecto", explain: "Solo sirve con países que tienen acuerdo preferencial con la UE que lo prevé; no es el caso." },
      ],
    },
    {
      id: "clasificacion", stage: "aduanas", kind: "single", title: "Clasificación arancelaria",
      prompt: "¿Con qué código HS6 declaras las aceitunas de mesa en conserva?",
      concept: "El código HS (Sistema Armonizado) clasifica la mercancía y determina aranceles y requisitos. Los seis primeros dígitos son comunes en todo el mundo.",
      options: [
        opt("200570", "200570: aceitunas preparadas o conservadas", "correcta", "Es el código del catálogo de SmarTrade para aceitunas de mesa en conserva."),
        opt("150920", "150920: aceite de oliva virgen extra", "grave", "Es el código del aceite, no de la aceituna de mesa."),
        opt("080510", "080510: naranjas", "grave", "No tiene relación con la mercancía."),
      ],
      best: "200570", whyBest: "La clasificación correcta es la base de todo el despacho.",
    },
    {
      id: "arancel", stage: "aduanas", kind: "single", title: "Arancel de importación",
      prompt: "¿Qué arancel pagarán las aceitunas al entrar en EE. UU. en este caso?",
      options: [
        opt("general", "El general (8 % en el caso), con o sin certificado de origen, porque no hay acuerdo preferencial", "correcta", "Correcto: acreditar el origen solo rebaja el arancel cuando hay un acuerdo que lo prevé."),
        opt("preferencial", "El 0 % si se presenta un EUR.1", "grave", "El EUR.1 solo funciona con países que tienen ese acuerdo con la UE; aquí no rebaja nada."),
        opt("vendedor", "El que pague el vendedor, que siempre asume los aranceles", "grave",
          (ctx) => `Quién paga el arancel depende del Incoterm: en ${ctx.settings.incoterm ?? "la regla elegida"} lo paga ${ctx.settings.incoterm ? incotermOf(ctx.settings.incoterm).importClearance : "quien despacha la importación"}.`),
      ],
      best: "general", whyBest: "Sin acuerdo comercial se aplica el arancel general; quién lo paga depende del Incoterm.",
    },
    {
      id: "incidencia", stage: "entrega", kind: "single", incident: true, title: "Incidencia: retención de la FDA",
      prompt: "La FDA retiene el contenedor en Nueva Jersey: el aviso previo se presentó sin el número de registro de tu instalación. Cada día de retención cuesta 180 € de almacenaje y demoras del contenedor, y el importador te los reclamará.",
      options: [
        opt("enviar", "Enviar hoy al agente del importador el número de registro y la documentación, y confirmar la corrección del aviso", "correcta",
          "Se resuelve en 2 días. Asumes el almacenaje de esos días porque el dato que faltaba era tuyo.",
          () => ({ concept: "incidencia", label: "Retención de 2 días", amount: 360, payer: "vendedor", note: "2 × 180 € de almacenaje y demoras (simulados)." })),
        opt("devolver", "Pedir que devuelvan el contenedor a España y reenviarlo más adelante", "grave",
          "Pagas el flete de vuelta y pierdes la venta de temporada: el problema se resolvía con un dato.",
          (ctx) => ({ concept: "incidencia", label: "Devolución del contenedor y descuento para recuperar al cliente", amount: round2(3500 + 0.05 * revenueOf(ctx)), payer: "vendedor", note: "Flete de retorno + 5 % del pedido (simulados)." })),
        opt("esperar", "Dejar que lo resuelva el importador: la importación es suya", "grave",
          "Sin tu número de registro no puede resolverlo: la retención dura 10 días y te la repercute con un descuento por el retraso.",
          (ctx) => ({ concept: "incidencia", label: "Retención de 10 días y descuento exigido", amount: round2(10 * 180 + 0.01 * revenueOf(ctx)), payer: "vendedor", note: "10 × 180 € + 1 % del pedido (simulados)." })),
      ],
      best: "enviar", whyBest: "Los trámites de destino los presenta el importador, pero con tus datos: si falta uno, aportarlo cuanto antes es lo que reduce el daño.",
    },
    {
      id: "cierre", stage: "entrega", kind: "single", title: "Cobro y cierre",
      prompt: "El importador ha pagado y retirado el contenedor. ¿Qué haces para cerrar la operación?",
      options: [
        opt("archivar", "Comparar el margen real con el previsto y archivar el DUA con la salida confirmada, el B/L, la factura y el cobro", "correcta", "El DUA con salida prueba la exención de IVA de la exportación, y comparar márgenes mejora tus próximos precios."),
        opt("solo_cobro", "Archivar solo el justificante de cobro", "grave", "Sin la prueba de salida podrías tener que justificar ante Hacienda por qué la factura no lleva IVA."),
      ],
      best: "archivar", whyBest: "Cerrar una operación es comprobar el resultado y guardar las pruebas.",
    },
  ],
};
