import { ESTIMACION, REAL_HS, REAL_MARKET, SUPUESTO, VERIFICAR } from "../../provenance";
import { round2 } from "../../money";
import { computeOperation, sellerBearsTransitRisk, sellerMustInsure, incotermOf } from "../costs";
import { R } from "../../logistics/types";
import type { DecisionCtx, ExportScenario, ExtraCost } from "../types";
import { byAir, eur, leg, opt, ownershipDecision, productName, routeDecisions, sellerClearsExport } from "./shared";

/**
 * CASO A2 (medio, fuera de la UE). Reales: el código HS y que Japón no es de la UE. TODO lo demás es SIMULADO, incluidos
 * los tipos de arancel (15 % general / 0 % preferencial) y de impuesto de importación (10 %): sirven para practicar el
 * cálculo, NO son las tarifas japonesas. En una operación real se consultan en Access2Markets.
 * Idea didáctica: fuera de la UE aparecen el despacho de exportación, el origen preferencial y la coherencia documental.
 * Logística: 18 m³ llenan bien un contenedor de 20'; el grupaje solo llega si todo va bien y el avión es desproporcionado.
 */
const revenueOf = (ctx: DecisionCtx) => computeOperation(ctx.scenario, ctx.settings).revenue;
const hasOriginProof = (ctx: DecisionCtx) => (ctx.settings.documents ?? []).includes("declaracion_origen");

/** Sin declaración de origen, el comprador paga el arancel general y pide compensarlo: lo asume el vendedor. */
function originCompensation(ctx: DecisionCtx): ExtraCost | null {
  if (hasOriginProof(ctx) || !ctx.scenario.duty) return null;
  // En DDP el arancel ya lo paga el vendedor como coste propio: compensar al comprador lo contaría dos veces.
  if (ctx.settings.incoterm && incotermOf(ctx.settings.incoterm).importClearance === "vendedor") return null;
  const withProof = computeOperation(ctx.scenario, { ...ctx.settings, documents: [...(ctx.settings.documents ?? []), "declaracion_origen"] });
  const without = computeOperation(ctx.scenario, ctx.settings);
  const dutyLine = (r: typeof without) => r.lines.find((l) => l.concept === "arancel")?.amount ?? 0;
  const extra = round2(dutyLine(without) - dutyLine(withProof));
  return extra > 0 ? { concept: "ajuste_comercial", label: "Compensación al comprador por el arancel general pagado", amount: extra, payer: "vendedor", note: "Sin declaración de origen no se aplicó el arancel preferencial; el comprador lo descuenta del pago." } : null;
}

export const VINO_JAPON: ExportScenario = {
  id: "vino-japon",
  title: "Vino tinto embotellado a Yokohama",
  difficulty: "media",
  summary: "Una bodega riojana envía su primer contenedor a un importador japonés. Operación fuera de la UE, por vía marítima.",
  learningGoal: "Gestionar una exportación a un tercer país: Incoterm para contenedor, cobro con documentos, despacho de exportación, prueba de origen preferencial y coherencia documental.",
  instructions: [
    "Avanza etapa por etapa y lee la consecuencia de cada decisión antes de seguir.",
    "Fíjate en quién paga y despacha cada tramo según el Incoterm que elijas: cambia las etapas siguientes.",
    "Los tipos de arancel e impuesto son simulados: sirven para practicar el cálculo, no son los reales.",
  ],
  hs6: "220421",
  destination: "JP",
  company: { name: "Bodegas Ejemplar de Rioja, S.A. (ficticia)", city: "Logroño", description: "Bodega mediana con experiencia en la UE y sin ventas previas en Asia." },
  buyer: { name: "Yokohama Ejemplo Trading K.K. (ficticia)", city: "Yokohama", description: "Importador y distribuidor de vinos europeos para restaurantes y tiendas especializadas." },
  quantity: { units: 900, unit: "caja", detail: "900 cajas de 12 botellas de 0,75 l (10.800 botellas), un contenedor de 20 pies" },
  exwUnitPrice: 33.6,
  unitCost: 26.4,
  targetMarginPct: 14,
  facts: [
    { label: "Producto", value: `${productName("220421")} (HS 220421)`, prov: REAL_HS },
    { label: "Destino", value: "Japón, país fuera de la UE: hay despacho de exportación y de importación", prov: REAL_MARKET },
    { label: "Acuerdo comercial", value: "Existe un acuerdo de asociación económica UE–Japón con reglas de origen propias", prov: VERIFICAR },
    { label: "Pedido", value: "900 cajas de 12 botellas de 0,75 l, un contenedor de 20 pies", prov: SUPUESTO },
    { label: "Peso y volumen", value: "≈ 10.800 kg brutos y 18 m³ en 15 palés", prov: ESTIMACION },
    { label: "Precio en origen (EXW)", value: "33,60 € por caja, embalaje estándar incluido", prov: SUPUESTO },
    { label: "Coste de producción", value: "26,40 € por caja", prov: SUPUESTO },
    { label: "Plazo pactado", value: "Llegada a Yokohama como máximo 60 días después de confirmar el pedido", prov: SUPUESTO },
    { label: "Aranceles e impuestos del caso", value: "Arancel general 15 %, preferencial 0 % con prueba de origen; impuesto de importación 10 %: tipos SIMULADOS", prov: ESTIMACION },
  ],
  logistics: {
    origin: "Logroño", destinationPlace: "Yokohama (almacén del importador)",
    cargo: { goods: "fragil", pallets: 15, grossKg: 10_800, volumeM3: 18 },
    routes: [
      { id: "fcl", modality: "maritimo_fcl", label: "Contenedor completo de 20' (FCL) Valencia–Yokohama", transshipments: [], waitDays: R(2, 5),
        legs: [leg("camion", "Logroño", "puerto de Valencia", [1, 1], "recogida", { kind: "camion_completo", km: 400 }),
          leg("barco", "Valencia", "Yokohama", [36, 40], "principal", { kind: "fcl", per20: R(2600, 3600), per40: R(3500, 4800) }),
          leg("camion", "terminal de Yokohama", "almacén del importador", [1, 1], "ultima_milla")],
        terminal: { kind: "por_contenedor", origin: R(200, 300), destination: R(250, 380) }, destinationCharges: R(150, 260), suitability: [] },
      { id: "lcl", modality: "maritimo_lcl", label: "Grupaje marítimo (LCL) consolidado en Valencia", transshipments: ["consolidación en Valencia", "desconsolidación en Yokohama"], waitDays: R(4, 8),
        legs: [leg("camion", "Logroño", "almacén de consolidación (Valencia)", [1, 1], "recogida", { kind: "camion_completo", km: 400 }),
          leg("barco", "Valencia", "Yokohama", [40, 48], "principal", { kind: "lcl", perRevenueTon: R(150, 210) }),
          leg("camion", "almacén de desconsolidación", "almacén del importador", [1, 2], "ultima_milla")],
        terminal: { kind: "por_tonelada_volumen", origin: R(30, 45), destination: R(35, 55) }, destinationCharges: R(180, 300),
        suitability: [{ penalty: 20, note: "Botellas de vidrio en grupaje: consolidar y desconsolidar añade manipulaciones y riesgo de roturas." }] },
      { id: "aereo", modality: "aereo", label: "Avión Madrid–Tokio con camión en los extremos", transshipments: [], waitDays: R(1, 2),
        legs: [leg("camion", "Logroño", "aeropuerto de Madrid-Barajas", [1, 1], "recogida", { kind: "camion_completo", km: 330 }),
          leg("avion", "Madrid", "Tokio Narita", [1, 2], "principal", { kind: "aereo", perChargeableKg: R(2.2, 3.0) }),
          leg("camion", "aeropuerto de Narita", "almacén del importador (Yokohama)", [1, 1], "ultima_milla")],
        terminal: { kind: "por_kg_tasable", origin: R(0.08, 0.14), destination: R(0.1, 0.16) }, destinationCharges: R(90, 160), suitability: [] },
    ],
    infeasible: [
      { modality: "carretera", reason: "Japón es un archipiélago: no hay conexión terrestre." },
      { modality: "ferroviario", reason: "No hay conexión ferroviaria con Japón; un corredor Europa–Asia necesitaría además un tramo marítimo final y no compensa para este envío." },
    ],
    geographyNote: "Logroño no tiene puerto: el contenedor va en camión hasta Valencia, que tiene servicio regular con Japón.",
    decisiveReason: "aprovecha_capacidad",
  },
  packing: [
    { id: "termico", label: "Cajas con separadores y manta térmica en el contenedor", cost: 900, protects: true },
    { id: "estandar", label: "Cajas estándar sin protección térmica", cost: 400, protects: false },
  ],
  duty: { generalRatePct: 15, preferentialRatePct: 0, originProofDoc: "declaracion_origen" },
  importVatRatePct: 10,
  sellerVatRegisteredAtDestination: false,
  deadlineDays: 60,
  prepDays: 7,
  standard: { transport: "fcl", packing: "termico" },
  incoterms: ["CIP", "CIF", "FCA", "DDP", "EXW"],
  decisions: [
    {
      id: "verificacion", stage: "ficha", kind: "single", title: "Primera comprobación",
      prompt: "Antes de preparar la oferta, ¿qué compruebas primero?",
      concept: "Access2Markets es el portal de la Comisión Europea con aranceles, reglas de origen y requisitos de cada país.",
      options: [
        opt("acceso", "El código arancelario, el origen y si el acuerdo UE–Japón reduce el arancel (Access2Markets)", "correcta", "Bien: el arancel y la prueba de origen condicionan el precio final que verá el importador."),
        opt("informe", "Un informe de solvencia del importador", "razonable", "Útil para decidir la forma de cobro, pero el acceso al mercado condiciona antes si la oferta es competitiva."),
        opt("vies", "Su NIF-IVA en VIES", "grave", "VIES solo sirve para empresas de la UE; Japón es un tercer país."),
      ],
      best: "acceso", whyBest: "Fuera de la UE, lo primero es saber qué aranceles y requisitos encontrará el producto.",
    },
    {
      id: "requisito", stage: "preparacion", kind: "single", title: "Requisito pendiente",
      prompt: "El importador te pide información antes del embarque. ¿Qué requisito queda pendiente?",
      concept: "En muchos países la notificación sanitaria de un alimento importado la presenta el importador, pero necesita datos del fabricante.",
      options: [
        opt("datos", "Enviarle la composición, aditivos y análisis que necesita para su notificación sanitaria de importación", "correcta", "Correcto: el trámite es suyo, pero sin tus datos no podrá despachar. Comprueba en una operación real qué pide exactamente."),
        opt("ninguno", "Ninguno: el vino no tiene requisitos especiales", "grave", "Los alimentos y bebidas suelen tener controles en destino; si el importador no puede despacharlos, la mercancía queda retenida."),
        opt("registro_es", "Enviarle tu registro sanitario español como único documento", "razonable", "Ayuda a acreditar tu empresa, pero no sustituye la información que pide la aduana japonesa."),
      ],
      best: "datos", whyBest: "Colaborar con el importador en sus trámites de destino evita retenciones.",
    },
    {
      id: "incoterm", stage: "contrato", kind: "single", title: "Incoterm del contrato",
      prompt: "El importador quiere el precio con transporte y seguro pagados hasta el puerto de Yokohama. La mercancía irá en contenedor. ¿Qué Incoterm propones?",
      concept: "Para contenedores, la ICC recomienda reglas multimodales (FCA, CPT, CIP) en lugar de FOB, CFR o CIF, porque el contenedor se entrega en la terminal antes de cargarse en el buque.",
      options: [
        opt("CIP", "CIP Yokohama", "correcta", "Cubre lo que pide (transporte y seguro hasta Yokohama) y encaja con el contenedor: el riesgo pasa al entregarlo en la terminal de Valencia, con seguro de cobertura amplia."),
        opt("CIF", "CIF Yokohama", "razonable", "Es muy habitual y el comprador lo entiende, pero con contenedor el riesgo pasa a bordo cuando ya no controlas la carga, y el seguro mínimo de CIF es de cobertura limitada."),
        opt("FCA", "FCA Valencia (terminal de contenedores)", "razonable", "Muy cómodo para ti, pero el importador pidió el transporte pagado: tendría que contratar el flete desde Japón."),
        opt("DDP", "DDP Yokohama", "grave", "Tendrías que importar en Japón y pagar aranceles e impuestos allí sin estar registrado: probablemente no podrías hacerlo y no recuperarías el impuesto."),
        opt("EXW", "EXW Logroño", "grave", "El importador japonés tendría que despachar la exportación en España, algo poco práctico y que te deja sin prueba de la salida."),
      ],
      best: "CIP", whyBest: "Transporte y seguro pagados hasta destino con contenedor: CIP.",
    },
    ownershipDecision,
    {
      id: "payment", stage: "contrato", kind: "single", title: "Forma de cobro",
      prompt: "Primera operación con este importador, en un país de riesgo bajo, envío marítimo con conocimiento de embarque. ¿Qué forma de cobro propones?",
      options: [
        opt("cobro_documentario", "Cobro documentario: documentos contra pago (D/P)", "correcta", "Buen equilibrio: el importador solo recibe el conocimiento de embarque (y con él la mercancía) cuando paga, y el coste bancario es moderado."),
        opt("carta_credito", "Carta de crédito confirmada", "razonable", "Máxima seguridad, pero cuesta más y cualquier discrepancia documental retrasa el cobro. Puede ser excesiva en un país de riesgo bajo."),
        opt("anticipado", "Pago anticipado del 100 %", "razonable", "Sin riesgo para ti, pero muchos importadores no aceptan pagar por adelantado a un proveedor nuevo."),
        opt("abierta_60", "Cuenta abierta a 60 días", "grave", "Envías un contenedor a 10.000 km a un cliente nuevo sin ninguna garantía de cobro."),
      ],
      best: "cobro_documentario", whyBest: "Con transporte marítimo, el conocimiento de embarque controla la mercancía: vincular su entrega al pago reduce el riesgo a bajo coste.",
    },
    ...routeDecisions("900 cajas (≈10,8 t, 18 m³) de botellas de vidrio, 60 días de plazo y 7 de preparación. Compara las alternativas y elige la ruta."),
    {
      id: "packing", stage: "logistica", kind: "single", title: "Embalaje",
      prompt: "El contenedor cruzará zonas tropicales durante más de un mes. ¿Qué embalaje usas?",
      options: [
        opt("termico", "Cajas con separadores y manta térmica (900 €)", "correcta", "Protege el vino de los cambios de temperatura dentro del contenedor y de las roturas."),
        opt("estandar", "Cajas estándar sin protección térmica (400 €)", "grave", "El calor dentro de un contenedor puede estropear el vino: el importador rechazaría la mercancía dañada."),
      ],
      best: "termico", whyBest: "En rutas largas y calurosas, el vino necesita protección térmica.",
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
      concept: "En el acuerdo UE–Japón el origen preferencial se acredita con una declaración del exportador en la factura (verifica los requisitos, como el número REX, en una operación real).",
      docs: (ctx) => [
        { id: "factura", label: "Factura comercial", need: "obligatorio", explain: "Base del despacho en los dos países y del cobro." },
        { id: "packing_list", label: "Packing list (lista de bultos)", need: "obligatorio", explain: "La aduana y el importador la necesitan para comprobar bultos y pesos." },
        byAir(ctx)
          ? { id: "awb", label: "Conocimiento aéreo (AWB)", need: "obligatorio", explain: "Contrato del transporte aéreo. No es un título de la mercancía: con avión, el cobro documentario protege menos." }
          : { id: "bl", label: "Conocimiento de embarque (B/L)", need: ctx.settings.incoterm === "EXW" || ctx.settings.incoterm === "FCA" ? "recomendado" : "obligatorio", explain: "Contrato del transporte marítimo y título que da derecho a retirar la mercancía; en el cobro documentario es clave." },
        { id: "dua_exportacion", label: "DUA de exportación", need: sellerClearsExport(ctx) ? "obligatorio" : "innecesario", explain: sellerClearsExport(ctx) ? "Despachas tú la exportación: además, el DUA con salida prueba la exención de IVA de la exportación." : "Con EXW la exportación la despacha el comprador." },
        { id: "declaracion_origen", label: "Declaración de origen en la factura (acuerdo UE–Japón)", need: "obligatorio", explain: "Sin ella el importador no puede pedir el arancel preferencial y pagará el general." },
        { id: "eur1", label: "Certificado de circulación EUR.1", need: "incorrecto", explain: "No es la prueba de origen que usa el acuerdo UE–Japón." },
        { id: "cmr", label: "CMR", need: "innecesario", explain: "Es la carta de porte por carretera; el transporte principal es marítimo." },
      ],
    },
    {
      id: "clasificacion", stage: "aduanas", kind: "single", title: "Clasificación arancelaria",
      prompt: "¿Con qué código HS6 declaras el vino embotellado en botellas de 0,75 l?",
      concept: "El código HS (Sistema Armonizado) clasifica la mercancía y determina aranceles y requisitos. Los seis primeros dígitos son comunes en todo el mundo.",
      options: [
        opt("220421", "220421: vino en recipientes de hasta 2 l", "correcta", "Correcto: es el código del catálogo de SmarTrade para vino embotellado."),
        opt("220429", "220429: vino en otros recipientes (granel)", "grave", "Es el código del vino a granel: una clasificación errónea puede suponer otro arancel, sanciones y retenciones."),
        opt("220410", "220410: vino espumoso", "grave", "Es el código del vino espumoso; un tinto tranquilo no se clasifica ahí."),
      ],
      best: "220421", whyBest: "La clasificación correcta es la base de todo el despacho.",
    },
    {
      id: "arancel", stage: "aduanas", kind: "single", title: "Arancel de importación",
      prompt: (ctx) => hasOriginProof(ctx)
        ? "Has incluido la declaración de origen. ¿Qué arancel pagará el vino al entrar en Japón en este caso?"
        : "No has incluido la declaración de origen. ¿Qué arancel pagará el vino al entrar en Japón en este caso?",
      options: [
        opt("segun_origen", "El preferencial (0 % en el caso) si se acredita el origen; si no, el general (15 % en el caso)", "correcta",
          (ctx) => hasOriginProof(ctx) ? "Correcto: con la declaración de origen se aplica el tipo preferencial." : "Correcto, y por eso tu cliente pagará el 15 % simulado: te pedirá compensarlo.", originCompensation),
        opt("vendedor", "El que pague el vendedor, que siempre es quien asume los aranceles", "grave",
          (ctx) => `Quién paga el arancel depende del Incoterm: en ${ctx.settings.incoterm ?? "la regla elegida"} lo paga ${ctx.settings.incoterm ? incotermOf(ctx.settings.incoterm).importClearance : "quien despacha la importación"}.`, originCompensation),
        opt("ninguno", "Ninguno: Japón no grava el vino", "grave", "No puedes suponerlo: hay que consultar el arancel y el efecto del acuerdo comercial.", originCompensation),
      ],
      best: "segun_origen", whyBest: "El arancel depende del origen acreditado y del acuerdo; quién lo paga depende del Incoterm.",
    },
    {
      id: "incidencia", stage: "entrega", kind: "single", incident: true, title: "Incidencia: discrepancia documental",
      prompt: "La aduana japonesa retiene el contenedor: el peso bruto del conocimiento de embarque (10.400 kg) no coincide con el de la factura y la packing list (10.800 kg). Cada día de retención cuesta 150 € de almacenaje y demoras, y el importador te los reclamará.",
      options: [
        opt("corregir", "Comprobar el peso real, pedir al transitario la corrección del B/L y enviar a todos la documentación coherente", "correcta",
          "Se resuelve en 2 días. Asumes el almacenaje de esos días y la corrección del documento. Si cobras contra documentos (cobro documentario o carta de crédito), el pago también se retrasa hasta que son coherentes.",
          () => ({ concept: "incidencia", label: "Retención de 2 días y corrección del B/L", amount: 380, payer: "vendedor", note: "2 × 150 € de almacenaje + 80 € de corrección (importes simulados)." })),
        opt("rehacer", "Rehacer la factura con el peso del B/L sin comprobar cuál es el correcto", "grave",
          "Resuelve el papel, pero declaras un dato sin verificar: si el peso real era el de la factura, has creado una declaración falsa.",
          () => ({ concept: "incidencia", label: "Retención de 2 días", amount: 300, payer: "vendedor", note: "2 × 150 € (simulado)." })),
        opt("comprador", "Decirle al importador que lo resuelva él: el despacho de importación es suyo", "grave",
          "El error es de tus documentos: la retención dura 8 días y el importador te descuenta el almacenaje y un 1 % por las molestias.",
          (ctx) => ({ concept: "incidencia", label: "Retención de 8 días y descuento exigido", amount: round2(8 * 150 + 0.01 * revenueOf(ctx)), payer: "vendedor", note: `8 × 150 € + 1 % del pedido (${eur(round2(0.01 * revenueOf(ctx)))}), simulados.` })),
      ],
      best: "corregir", whyBest: "Los documentos deben ser coherentes entre sí y con la realidad: se corrige el que está mal, tras comprobarlo.",
    },
    {
      id: "cierre", stage: "entrega", kind: "single", title: "Cobro y cierre",
      prompt: "El importador ha pagado y retirado la mercancía. ¿Qué haces para cerrar la operación?",
      options: [
        opt("archivar", "Comparar el margen real con el previsto y archivar el DUA con la salida confirmada, el B/L, la factura y el cobro", "correcta", "El DUA con salida prueba la exención de IVA de la exportación, y comparar márgenes mejora tus próximos precios."),
        opt("solo_cobro", "Archivar solo el justificante de cobro", "grave", "Sin la prueba de salida podrías tener que justificar ante Hacienda por qué la factura no lleva IVA."),
      ],
      best: "archivar", whyBest: "Cerrar una operación es comprobar el resultado y guardar las pruebas.",
    },
  ],
};
