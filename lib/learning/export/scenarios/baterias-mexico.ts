import { ESTIMACION, REAL_HS, REAL_MARKET, SUPUESTO, VERIFICAR } from "../../provenance";
import { round2 } from "../../money";
import { R } from "../../logistics/types";
import { computeOperation, incotermOf, routeOf, sellerBearsTransitRisk, sellerMustInsure } from "../costs";
import type { DecisionCtx, ExportScenario, ExtraCost } from "../types";
import { byAir, leg, opt, ownershipDecision, productName, routeDecisions, sellerClearsExport } from "./shared";
import { byVehicle, damageIncident, delayIncident, lateCollectionIncident } from "./incidents";
import { dangerousBookingDecision } from "./dangerous";

/**
 * CASO A6 (avanzado, fuera de la UE, MERCANCÍA PELIGROSA). Segunda parte de la propuesta 4 (04/11/2026). Reales: el
 * código HS, que México no es de la UE y que las baterías de ion litio sueltas son UN 3480, clase 9. Contrastado el
 * 04/11/2026 en documentos de la OACI y de autoridades de aviación: por avión, las UN 3480 sueltas solo pueden ir en
 * avión de carga (prohibidas como carga en avión de pasajeros desde 2016) y con un estado de carga de como máximo el
 * 30 % de su capacidad (más, solo con aprobación de los Estados). Toda pila o batería de litio debe haber superado los
 * ensayos del Manual de Pruebas y Criterios de la ONU (sección 38.3). Lo demás es SIMULADO, y lo que depende de la
 * edición vigente se marca «verificar». No se tratan los cambios de 2026 para baterías dentro de equipos (UN 3481): no
 * se pudieron confirmar en fuente oficial.
 * Idea didáctica: las baterías son mercancía peligrosa aunque no lo parezcan; el avión tiene restricciones propias; una
 * batería dañada no viaja como las demás; y con acuerdo UE–México la prueba de origen evita el arancel general.
 */
const revenueOf = (ctx: DecisionCtx) => computeOperation(ctx.scenario, ctx.settings).revenue;
const byContainer = (ctx: DecisionCtx) => routeOf(ctx.scenario, ctx.settings.transport).modality === "maritimo_fcl";
const hasOriginProof = (ctx: DecisionCtx) => (ctx.settings.documents ?? []).includes("prueba_origen");

/** Sin prueba de origen, el comprador paga el arancel general y pide compensarlo (como en el caso de Japón). */
function originCompensation(ctx: DecisionCtx): ExtraCost | null {
  if (hasOriginProof(ctx) || !ctx.scenario.duty) return null;
  // En DDP el arancel ya lo paga el vendedor como coste propio: compensar al comprador lo contaría dos veces.
  if (ctx.settings.incoterm && incotermOf(ctx.settings.incoterm).importClearance === "vendedor") return null;
  const duty = (docs: string[]) => computeOperation(ctx.scenario, { ...ctx.settings, documents: docs }).lines.find((l) => l.concept === "arancel")?.amount ?? 0;
  const extra = round2(duty(ctx.settings.documents ?? []) - duty([...(ctx.settings.documents ?? []), "prueba_origen"]));
  return extra > 0 ? { concept: "ajuste_comercial", label: "Compensación al comprador por el arancel general pagado", amount: extra, payer: "vendedor", note: "Sin prueba de origen no se aplicó el arancel preferencial; el comprador lo descuenta del pago." } : null;
}

export const BATERIAS_MEXICO: ExportScenario = {
  id: "baterias-mexico",
  title: "Baterías de litio de Zaragoza a Monterrey (mercancía peligrosa)",
  difficulty: "avanzada",
  summary: "Un fabricante de baterías industriales envía su primer pedido a un integrador mexicano. Fuera de la UE, con acuerdo comercial y con mercancía peligrosa de clase 9.",
  learningGoal: "Exportar baterías de litio: identificarlas como mercancía peligrosa, conocer las restricciones del transporte aéreo, preparar los ensayos y documentos que exigen, y aprovechar el origen preferencial.",
  instructions: [
    "Avanza etapa por etapa y lee la consecuencia de cada decisión antes de seguir.",
    "Las baterías de litio son mercancía peligrosa aunque sean un producto industrial corriente: cambia la reserva, el embalaje, los documentos y lo que admite el avión.",
    "La normativa concreta depende de la edición vigente de cada reglamento: en una operación real, consúltala o pide ayuda a un consejero de seguridad.",
  ],
  hs6: "850760",
  destination: "MX",
  company: { name: "Acumuladores del Ebro, S.A. (ficticia)", city: "Zaragoza", description: "Fabricante de baterías de ion litio para carretillas y almacenamiento de energía; primera venta en América." },
  buyer: { name: "Integraciones Energéticas del Norte, S.A. de C.V. (ficticia)", city: "Monterrey", description: "Integrador de sistemas de almacenamiento de energía para naves industriales." },
  quantity: { units: 600, unit: "batería", detail: "600 baterías de ion litio en 10 palés (≈ 6.000 kg, 12 m³)" },
  exwUnitPrice: 140,
  unitCost: 118,
  targetMarginPct: 12,
  facts: [
    { label: "Producto", value: `${productName("850760")} (HS 850760)`, prov: REAL_HS },
    { label: "Destino", value: "México, fuera de la UE: despacho de exportación y de importación", prov: REAL_MARKET },
    { label: "Mercancía peligrosa", value: "Baterías de ion litio sueltas: UN 3480, clase 9 (materias y objetos peligrosos diversos)", prov: { kind: "real", source: "Lista de mercancías peligrosas de las Recomendaciones de la ONU (UN 3480, clase 9)" } },
    { label: "Por avión", value: "UN 3480 solo en avión de carga y con un estado de carga de como máximo el 30 %, salvo aprobación de los Estados (Instrucciones Técnicas de la OACI; comprobar la edición vigente)", prov: VERIFICAR },
    { label: "Ensayos", value: "Toda pila o batería de litio debe superar los ensayos de la sección 38.3 del Manual de Pruebas y Criterios de la ONU; el fabricante facilita el resumen de ensayos", prov: VERIFICAR },
    { label: "Acuerdo comercial", value: "Existe un acuerdo UE–México: con prueba de origen, arancel preferencial. Qué prueba exige (EUR.1 o declaración en factura) depende del acuerdo vigente y del exportador", prov: VERIFICAR },
    { label: "Pedido", value: "600 baterías en 10 palés · ≈ 6.000 kg · 12 m³", prov: SUPUESTO },
    { label: "Precio en origen (EXW)", value: "140,00 € por batería, embalaje estándar incluido", prov: SUPUESTO },
    { label: "Coste de producción", value: "118,00 € por batería", prov: SUPUESTO },
    { label: "Plazo pactado", value: "Entrega en el almacén del integrador como máximo 45 días después del pedido; 5 días de preparación", prov: SUPUESTO },
    { label: "Arancel e impuesto del caso", value: "Arancel general 15 %, preferencial 0 % con prueba de origen; impuesto de importación 16 %: tipos SIMULADOS", prov: ESTIMACION },
  ],
  logistics: {
    origin: "Zaragoza", destinationPlace: "Monterrey (almacén del integrador)",
    cargo: { goods: "peligrosa", pallets: 10, grossKg: 6_000, volumeM3: 12, dangerous: { un: "UN 3480", name: "Baterías de ion litio", hazardClass: "9", packingGroup: "embalaje de nivel del grupo II (verificar)" } },
    routes: [
      { id: "fcl", modality: "maritimo_fcl", label: "Contenedor de 20' Valencia–Altamira (camión hasta Monterrey)", transshipments: [], waitDays: R(2, 5),
        legs: [leg("camion", "Zaragoza", "puerto de Valencia", [1, 1], "recogida", { kind: "camion_completo", km: 310 }),
          leg("barco", "Valencia", "Altamira", [18, 24], "principal", { kind: "fcl", per20: R(1900, 2800), per40: R(2700, 3900) }),
          leg("camion", "terminal de Altamira", "almacén del integrador (Monterrey)", [1, 2], "ultima_milla", { kind: "camion_completo", km: 510 })],
        terminal: { kind: "por_contenedor", origin: R(200, 300), destination: R(220, 340) }, destinationCharges: R(150, 260), suitability: [] },
      { id: "lcl", modality: "maritimo_lcl", label: "Grupaje marítimo de mercancía peligrosa Valencia–Altamira", transshipments: ["consolidación en Valencia", "desconsolidación en Altamira"], waitDays: R(5, 10),
        legs: [leg("camion", "Zaragoza", "almacén de consolidación (Valencia)", [1, 1], "recogida", { kind: "camion_completo", km: 310 }),
          leg("barco", "Valencia", "Altamira", [21, 28], "principal", { kind: "lcl", perRevenueTon: R(100, 150) }),
          leg("camion", "almacén de desconsolidación", "almacén del integrador (Monterrey)", [2, 3], "ultima_milla", { kind: "camion_completo", km: 510 })],
        terminal: { kind: "por_tonelada_volumen", origin: R(35, 50), destination: R(35, 55) }, destinationCharges: R(180, 300),
        suitability: [{ penalty: 15, note: "Pocos consolidadores aceptan baterías de litio y las agrupan en menos salidas: más espera y más manipulaciones." }] },
      // UN 3480 sueltas: solo avión de carga, más caro que la bodega de un avión de pasajeros.
      { id: "aereo", modality: "aereo", label: "Avión de carga Madrid–Monterrey", transshipments: [], waitDays: R(2, 4),
        legs: [leg("camion", "Zaragoza", "aeropuerto de Madrid-Barajas", [1, 1], "recogida", { kind: "camion_completo", km: 320 }),
          leg("avion", "Madrid", "Monterrey", [1, 2], "principal", { kind: "aereo", perChargeableKg: R(3.8, 5.2) }),
          leg("camion", "aeropuerto de Monterrey", "almacén del integrador", [1, 1], "ultima_milla")],
        terminal: { kind: "por_kg_tasable", origin: R(0.1, 0.16), destination: R(0.1, 0.18) }, destinationCharges: R(90, 170),
        suitability: [{ penalty: 15, note: "Baterías UN 3480 por avión: solo avión de carga, estado de carga máximo del 30 % y etiqueta «solo avión de carga» (verificar en la edición vigente)." }] },
    ],
    infeasible: [
      { modality: "carretera", reason: "No hay ruta terrestre: hay que cruzar el océano Atlántico." },
      { modality: "ferroviario", reason: "No hay ruta terrestre: hay que cruzar el océano Atlántico." },
    ],
    geographyNote: "Monterrey no tiene puerto: el contenedor llega a Altamira, en el golfo de México, y sigue en camión unos 500 km. Desde Zaragoza, el puerto con servicio regular es Valencia.",
    decisiveReason: "barata_que_cumple",
  },
  packing: [
    { id: "homologado", label: "Embalajes homologados para baterías de litio, con terminales protegidos contra cortocircuito, marca UN 3480 y etiqueta de batería de litio de clase 9", cost: 1600, protects: true },
    { id: "estandar", label: "Palés con film retráctil y cajas de cartón estándar, sin marcas ni etiquetas", cost: 600, protects: false },
  ],
  duty: { generalRatePct: 15, preferentialRatePct: 0, originProofDoc: "prueba_origen" },
  importVatRatePct: 16,
  sellerVatRegisteredAtDestination: false,
  deadlineDays: 45,
  prepDays: 5,
  standard: { transport: "fcl", packing: "homologado" },
  incoterms: ["DAP", "CIP", "CPT", "FCA", "DDP"],
  decisions: [
    {
      id: "verificacion", stage: "ficha", kind: "single", title: "Primera comprobación",
      prompt: "Antes de preparar la oferta, ¿qué compruebas primero?",
      concept: "Las baterías de litio son mercancía peligrosa para el transporte. Además de la ficha de datos de seguridad, el fabricante debe poder acreditar que el modelo superó los ensayos de la sección 38.3 del Manual de Pruebas y Criterios de la ONU.",
      options: [
        opt("ensayos", "Que el modelo está clasificado como UN 3480 y tiene superados los ensayos de la sección 38.3 de la ONU, con su resumen de ensayos", "correcta", "Bien: sin esos ensayos ninguna naviera ni aerolínea aceptará las baterías."),
        opt("arancel", "El arancel de importación en México", "razonable", "Necesario, pero antes tienes que saber si puedes transportarlas: sin ensayos acreditados no salen de España."),
        opt("nada", "Nada especial: son un producto industrial corriente", "grave", "Las baterías de ion litio son mercancía peligrosa (clase 9) por su riesgo de incendio: enviarlas como carga general es una infracción grave."),
      ],
      best: "ensayos", whyBest: "Antes de vender, comprobar que la mercancía peligrosa puede viajar: clasificación y ensayos.",
    },
    {
      id: "requisito", stage: "preparacion", kind: "single", title: "Baterías por avión",
      prompt: "El integrador pregunta si, en caso de urgencia, se podrían enviar por avión. ¿Qué le contestas?",
      concept: "Por avión, las baterías de ion litio sueltas (UN 3480) solo pueden ir en avión de carga y con un estado de carga de como máximo el 30 % de su capacidad, salvo aprobación de los Estados (comprobar la edición vigente de las normas).",
      options: [
        opt("carga_30", "Sí, pero solo en avión de carga, con un estado de carga máximo del 30 % y la etiqueta «solo avión de carga»", "correcta", "Correcto: hay que planificarlo con la aerolínea y descargar las baterías antes de enviarlas."),
        opt("cargadas", "Sí, y cargadas al 100 % para que puedan usarse en cuanto lleguen", "grave", "Por avión el estado de carga está limitado (30 %): cargadas al 100 % la aerolínea las rechazaría."),
        opt("pasajeros", "Sí, en cualquier vuelo, también de pasajeros, si van bien embaladas", "grave", "Las UN 3480 sueltas están prohibidas como carga en avión de pasajeros: solo avión de carga."),
      ],
      best: "carga_30", whyBest: "Las baterías sueltas por avión: solo avión de carga y estado de carga limitado.",
    },
    {
      id: "incoterm", stage: "contrato", kind: "single", title: "Incoterm del contrato",
      prompt: "El integrador quiere recibir las baterías en su almacén de Monterrey y se encarga él del despacho de importación. ¿Qué Incoterm propones?",
      concept: "Con las reglas D el vendedor entrega en destino y asume el riesgo hasta allí; con DAP la importación la despacha y la paga el comprador; con DDP, el vendedor.",
      options: [
        opt("DAP", "DAP almacén del integrador (Monterrey)", "correcta", "Es lo que pide: entregas en su almacén y él despacha la importación. Ojo: el riesgo del viaje es tuyo hasta allí."),
        opt("CIP", "CIP almacén del integrador (Monterrey)", "razonable", "Pagas transporte y seguro hasta su almacén, pero el riesgo pasa al entregar al primer transportista en España: no es exactamente lo que pide."),
        opt("FCA", "FCA terminal de Valencia", "razonable", "Cómodo para ti, pero el integrador quería recibirlas en su almacén: tendría que contratar él un transporte de mercancía peligrosa."),
        opt("DDP", "DDP Monterrey", "grave", "Tendrías que importar en México y pagar aranceles e impuestos sin estar registrado allí; además, él ya se encarga del despacho."),
        opt("CPT", "CPT Altamira", "razonable", "Pagas el transporte hasta el puerto, pero no hasta su almacén, que es lo que pide."),
      ],
      best: "DAP", whyBest: "Entrega en el almacén del comprador con importación a su cargo: DAP.",
    },
    ownershipDecision,
    {
      id: "payment", stage: "contrato", kind: "single", title: "Forma de cobro",
      prompt: "Primer pedido con este integrador, de unos 90.000 €, en un país de riesgo medio. ¿Qué forma de cobro propones?",
      options: [
        opt("cobro_documentario", "Cobro documentario: documentos contra pago (D/P)", "correcta", "Equilibrio razonable: el integrador recibe los documentos para retirar la mercancía cuando paga."),
        opt("carta_credito", "Carta de crédito confirmada", "razonable", "Máxima seguridad, pero más cara y exigente: con mercancía peligrosa hay más documentos y más ocasiones de discrepancia."),
        opt("anticipo_30_70", "30 % anticipado y 70 % contra copia de documentos", "razonable", "Reparte el riesgo, pero el 70 % sigue sin garantía si no paga."),
        opt("abierta_60", "Cuenta abierta a 60 días", "grave", "Envías 90.000 € a un cliente nuevo al otro lado del Atlántico sin ninguna garantía."),
      ],
      best: "cobro_documentario", whyBest: "Con transporte marítimo y cliente nuevo de riesgo medio, vincular los documentos al pago reduce el riesgo a un coste moderado.",
    },
    ...routeDecisions("10 palés (≈6 t, 12 m³) de baterías de ion litio (clase 9), 45 días de plazo y 5 de preparación. Compara las alternativas y elige la ruta."),
    dangerousBookingDecision,
    {
      id: "packing", stage: "logistica", kind: "single", title: "Embalaje y etiquetado",
      prompt: "¿Cómo embalas y marcas las baterías para el viaje?",
      concept: "Las baterías de litio viajan en embalajes adecuados, protegidas contra cortocircuitos y movimientos, marcadas con su número ONU y con la etiqueta de batería de litio de clase 9.",
      options: [
        opt("homologado", "Embalajes homologados, terminales protegidos, marca UN 3480 y etiqueta de batería de litio (1.600 €)", "correcta", "Correcto: es lo que exigen las normas de transporte y lo que revisará la terminal."),
        opt("estandar", "Palés con film y cajas estándar, sin marcas ni etiquetas (600 €)", "grave", "Una batería sin proteger puede cortocircuitarse y provocar un incendio: la terminal no aceptará la carga."),
      ],
      best: "homologado", whyBest: "Embalaje adecuado, protección contra cortocircuitos, marcado y etiquetado.",
    },
    {
      id: "insurance", stage: "logistica", kind: "single", title: "Seguro de transporte",
      prompt: (ctx) => `En ${ctx.settings.incoterm} el riesgo del viaje es tuyo y la regla no te obliga a asegurar. ¿Contratas seguro?`,
      appliesIf: (ctx) => !!ctx.settings.incoterm && sellerBearsTransitRisk(incotermOf(ctx.settings.incoterm)) && !sellerMustInsure(incotermOf(ctx.settings.incoterm)),
      options: [
        opt("si", "Sí, por el 110 % del precio del contrato, declarando que son baterías de litio", "correcta", "Cubres un riesgo que es tuyo; la póliza debe saber qué se transporta."),
        opt("no", "No", "razonable", "Ahorras la prima, pero un incendio o una pérdida en el viaje lo pagarías tú."),
      ],
      best: "si", whyBest: "Quien soporta el riesgo del transporte es quien debe valorar asegurarlo.",
    },
    {
      id: "documents", stage: "documentacion", kind: "multi", title: "Documentación del envío",
      prompt: "Marca los documentos que debes preparar o gestionar como exportador.",
      concept: "Las baterías de litio llevan su declaración de mercancías peligrosas (IMDG por mar; IATA por avión) y el fabricante debe facilitar el resumen de ensayos de la sección 38.3. Con el acuerdo UE–México, la prueba de origen permite el arancel preferencial.",
      docs: (ctx) => [
        { id: "factura", label: "Factura comercial", need: "obligatorio", explain: "Base del despacho en los dos países y del cobro." },
        { id: "packing_list", label: "Packing list (lista de bultos)", need: "obligatorio", explain: "La aduana, la terminal y el integrador comprueban con ella bultos y pesos." },
        byAir(ctx)
          ? { id: "awb", label: "Conocimiento aéreo (AWB)", need: "obligatorio", explain: "Contrato del transporte aéreo; la aerolínea revisa además la declaración de mercancías peligrosas." }
          : { id: "bl", label: "Conocimiento de embarque (B/L)", need: ctx.settings.incoterm === "FCA" ? "recomendado" : "obligatorio", explain: "Contrato del transporte marítimo y título de la mercancía; en el cobro documentario es clave." },
        { id: "dua_exportacion", label: "DUA de exportación", need: sellerClearsExport(ctx) ? "obligatorio" : "innecesario", explain: "Despachas tú la exportación: el DUA con salida prueba además la exención de IVA." },
        byAir(ctx)
          ? { id: "dgd", label: "Declaración del expedidor de mercancías peligrosas (IATA)", need: "obligatorio", explain: "La firma el expedidor y la revisa la aerolínea antes de aceptar la carga." }
          : { id: "dgd", label: "Declaración de mercancías peligrosas (Código IMDG)", need: "obligatorio", explain: "Identifica la mercancía (número ONU, designación, clase, cantidades) ante la naviera." },
        { id: "arrumazon", label: "Certificado de arrumazón del contenedor", need: byContainer(ctx) ? "obligatorio" : "innecesario", explain: byContainer(ctx) ? "Por mar, quien llena el contenedor certifica que la carga peligrosa está estibada, sujeta, marcada y rotulada correctamente." : "Solo se emite cuando llenas tú un contenedor completo." },
        { id: "ensayos_383", label: "Resumen de ensayos de la sección 38.3 de la ONU", need: "obligatorio", explain: "Acredita que el modelo de batería superó los ensayos; navieras, aerolíneas y el comprador pueden pedirlo." },
        { id: "prueba_origen", label: "Prueba de origen del acuerdo UE–México (EUR.1 o declaración en factura, según el caso)", need: "obligatorio", explain: "Sin ella el integrador paga el arancel general y te pedirá compensarlo." },
        { id: "certificado_origen", label: "Certificado de origen no preferencial de la Cámara de Comercio", need: "innecesario", explain: "No da derecho al arancel preferencial: para eso está la prueba de origen del acuerdo." },
      ],
    },
    {
      id: "clasificacion", stage: "aduanas", kind: "single", title: "Clasificación arancelaria",
      prompt: "¿Con qué código HS6 declaras las baterías de ion litio?",
      concept: "El código HS clasifica la mercancía para la aduana; el número ONU la identifica para el transporte. Un envío de mercancía peligrosa lleva los dos.",
      options: [
        opt("850760", "850760: acumuladores de ion litio", "correcta", "Correcto: es el código del catálogo de SmarTrade para baterías de ion litio."),
        opt("3480", "El 3480, su número ONU", "grave", "El número ONU identifica el peligro para el transporte; la aduana clasifica con el código HS."),
        opt("850780", "850780: los demás acumuladores", "grave", "Las baterías de ion litio tienen su propia subpartida: una clasificación errónea cambia el arancel y puede suponer sanciones."),
      ],
      best: "850760", whyBest: "Código HS para la aduana y número ONU para el transporte: son cosas distintas.",
    },
    {
      id: "arancel", stage: "aduanas", kind: "single", title: "Arancel de importación",
      prompt: (ctx) => hasOriginProof(ctx)
        ? "Has incluido la prueba de origen. ¿Qué arancel pagarán las baterías al entrar en México en este caso?"
        : "No has incluido la prueba de origen. ¿Qué arancel pagarán las baterías al entrar en México en este caso?",
      options: [
        opt("segun_origen", "El preferencial (0 % en el caso) si se acredita el origen; si no, el general (15 % en el caso)", "correcta",
          (ctx) => hasOriginProof(ctx) ? "Correcto: con la prueba de origen se aplica el tipo preferencial." : "Correcto, y por eso el integrador pagará el 15 % simulado: te pedirá compensarlo.", originCompensation),
        opt("general", "Siempre el general, aunque haya acuerdo", "grave", "El acuerdo UE–México rebaja el arancel si se acredita el origen.", originCompensation),
        opt("vendedor", "El que pague el vendedor, que siempre asume los aranceles", "grave",
          (ctx) => `Quién paga el arancel depende del Incoterm: en ${ctx.settings.incoterm ?? "la regla elegida"} lo paga ${ctx.settings.incoterm ? incotermOf(ctx.settings.incoterm).importClearance : "quien despacha la importación"}.`, originCompensation),
      ],
      best: "segun_origen", whyBest: "El arancel depende del origen acreditado y del acuerdo; quién lo paga depende del Incoterm.",
    },
    {
      // Aplica con cualquier Incoterm: preparar la carga es siempre del vendedor.
      id: "incidencia", variant: "A", stage: "entrega", kind: "single", incident: true, title: "Incidencia: baterías dañadas al cargar",
      prompt: "Al cargar el camión en tu almacén, una carretilla golpea un palé: dos baterías quedan abolladas y una se calienta. El camión sale en una hora.",
      concept: "Una batería de litio dañada o defectuosa puede provocar un incendio: no viaja como las demás. Las normas tienen condiciones especiales (o prohíben el transporte) para las baterías dañadas.",
      options: [
        opt("retirar", "Retirar las baterías dañadas, aislar la que se calienta según el procedimiento de seguridad, sustituirlas por unidades en buen estado y revisar el palé", "correcta",
          "Correcto: el camión sale con un poco de retraso y con todas las baterías en buen estado. Pierdes las dos unidades dañadas.",
          () => ({ concept: "incidencia", label: "Dos baterías dañadas retiradas del envío", amount: round2(2 * 118), payer: "vendedor", note: "Coste de producción de las dos unidades (supuesto del caso)." })),
        opt("enviar", "Enviarlas igualmente: el embalaje homologado las protege", "grave",
          "Una batería dañada que se calienta puede incendiarse durante el viaje. La terminal la detecta, retiene todo el palé y la naviera cobra la gestión.",
          (ctx) => ({ concept: "incidencia", label: "Palé retenido en terminal, gestión de la batería dañada y nuevo envío", amount: round2(1500 + 0.02 * revenueOf(ctx)), payer: "vendedor", note: "Gastos y descuento por el retraso (simulados)." })),
        opt("avion", "Enviar el palé dañado aparte, por avión, para que llegue a tiempo", "grave",
          "Por avión las restricciones son aún más estrictas: una batería dañada no se acepta. Pierdes tiempo y la reserva.",
          () => ({ concept: "incidencia", label: "Reserva aérea anulada y gestión de la batería dañada", amount: 1100, payer: "vendedor", note: "Importes simulados." })),
      ],
      best: "retirar", whyBest: "Una batería de litio dañada se retira y se gestiona aparte; el envío sale solo con unidades en buen estado.",
    },
    damageIncident({ variant: "B", what: "las baterías (palés golpeados durante el transbordo)", damagedPct: 2, reshipCost: 2200 }),
    delayIncident({ variant: "C", days: 6, urgentCost: 3500, cause: byVehicle({ camion: "Un fallo en el transporte retrasa la entrega.", barco: "Un huracán en el golfo de México cierra el puerto de Altamira varios días.", avion: "La aerolínea de carga cancela el vuelo y la carga pasa al siguiente." }) }),
    lateCollectionIncident({ variant: "D", daysOver: 5, perDay: 120 }),
    {
      id: "cierre", stage: "entrega", kind: "single", title: "Cobro y cierre",
      prompt: "El integrador ha pagado y tiene las baterías en su almacén. ¿Qué haces para cerrar la operación?",
      options: [
        opt("archivar", "Comparar el margen real con el previsto y archivar factura, B/L o AWB, declaración de mercancías peligrosas, prueba de origen y DUA", "correcta", "Así sabes si el precio era adecuado y conservas la documentación que pueden pedirte las aduanas y las autoridades de transporte."),
        opt("solo_factura", "Archivar solo la factura", "grave", "La documentación de mercancía peligrosa, la prueba de origen y el DUA deben conservarse: son la prueba de que todo se hizo conforme a la norma."),
      ],
      best: "archivar", whyBest: "Cerrar una operación es comprobar el resultado y guardar las pruebas.",
    },
  ],
};
