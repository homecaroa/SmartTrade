import { ESTIMACION, REAL_HS, REAL_MARKET, SUPUESTO, VERIFICAR } from "../../provenance";
import { round2 } from "../../money";
import { computeOperation, sellerBearsTransitRisk, sellerMustInsure, incotermOf } from "../costs";
import type { DecisionCtx, ExportScenario, ExtraCost } from "../types";
import { eur, opt, productName, sellerCarries, sellerClearsExport } from "./shared";

/**
 * CASO A2 (medio, fuera de la UE). Reales: el código HS y que Japón no es de la UE. TODO lo demás es SIMULADO, incluidos
 * los tipos de arancel (15 % general / 0 % preferencial) y de impuesto de importación (10 %): sirven para practicar el
 * cálculo, NO son las tarifas japonesas. En una operación real se consultan en Access2Markets.
 * Idea didáctica: fuera de la UE aparecen el despacho de exportación, el origen preferencial y la coherencia documental.
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
    { label: "Peso", value: "≈ 10.800 kg brutos", prov: ESTIMACION },
    { label: "Precio en origen (EXW)", value: "33,60 € por caja, embalaje estándar incluido", prov: SUPUESTO },
    { label: "Coste de producción", value: "26,40 € por caja", prov: SUPUESTO },
    { label: "Plazo pactado", value: "Llegada a Yokohama como máximo 60 días después de confirmar el pedido", prov: SUPUESTO },
    { label: "Aranceles e impuestos del caso", value: "Arancel general 15 %, preferencial 0 % con prueba de origen; impuesto de importación 10 %: tipos SIMULADOS", prov: ESTIMACION },
  ],
  transport: [
    { id: "fcl", label: "Contenedor completo de 20' (FCL) Valencia–Yokohama", mode: "maritimo", cost: 3400, days: 38 },
    { id: "lcl", label: "Grupaje marítimo (LCL)", mode: "maritimo", cost: 4100, days: 45 },
    { id: "aereo", label: "Aéreo Madrid–Tokio", mode: "aereo", cost: 26000, days: 4 },
  ],
  packing: [
    { id: "termico", label: "Cajas con separadores y manta térmica en el contenedor", cost: 900, protects: true },
    { id: "estandar", label: "Cajas estándar sin protección térmica", cost: 400, protects: false },
  ],
  fees: { loading: 180, exportClearance: 250, importClearance: 400, unloading: 300, insuranceRatePct: 0.35 },
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
    {
      id: "transport", stage: "logistica", kind: "single", title: "Modo de transporte",
      prompt: "900 cajas (≈10,8 t), 60 días de plazo y 7 de preparación. ¿Cómo envías?",
      appliesIf: sellerCarries,
      options: [
        opt("fcl", "Contenedor completo de 20' (FCL), 38 días, 3.400 €", "correcta", "Llenas un contenedor, la carga no se manipula en ruta y llegas a tiempo."),
        opt("lcl", "Grupaje marítimo (LCL), 45 días, 4.100 €", "razonable", "Llegas a tiempo, pero pagas más que por un contenedor completo y la mercancía se manipula en consolidación."),
        opt("aereo", "Aéreo, 4 días, 26.000 €", "grave", "El flete aéreo de casi 11 toneladas de vino hace la operación ruinosa."),
      ],
      best: "fcl", whyBest: "Volumen de contenedor completo y plazo suficiente: FCL.",
    },
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
        { id: "bl", label: "Conocimiento de embarque (B/L)", need: ctx.settings.incoterm === "EXW" || ctx.settings.incoterm === "FCA" ? "recomendado" : "obligatorio", explain: "Contrato del transporte marítimo y título que da derecho a retirar la mercancía; en el cobro documentario es clave." },
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
