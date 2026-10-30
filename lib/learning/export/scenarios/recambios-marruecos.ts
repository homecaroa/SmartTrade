import { ESTIMACION, REAL_HS, REAL_MARKET, SUPUESTO, VERIFICAR } from "../../provenance";
import { round2 } from "../../money";
import { R } from "../../logistics/types";
import { computeOperation, incotermOf, sellerBearsTransitRisk, sellerMustInsure } from "../costs";
import type { DecisionCtx, ExportScenario, ExtraCost } from "../types";
import { byAir, bySea, leg, opt, ownershipDecision, productName, routeDecisions, sellerClearsExport } from "./shared";

/**
 * CASO A3 (medio, fuera de la UE, cruce del Estrecho). Reales: el código HS y que Marruecos no es de la UE. TODO lo
 * demás es SIMULADO, incluidos los tipos de arancel (10 % general / 0 % preferencial) e impuesto de importación (20 %):
 * no son las tarifas marroquíes. El tipo de prueba de origen del acuerdo UE–Marruecos se marca «verificar».
 * Idea didáctica: entre Sevilla y Marruecos siempre hay un tramo marítimo; con 7 días de plazo, el camión en ferry es
 * la opción segura aunque el grupaje sea más barato. Por carretera, el CMR no es un título de la mercancía.
 */
const hasOriginProof = (ctx: DecisionCtx) => (ctx.settings.documents ?? []).includes("eur1");
const transportDoc = (ctx: DecisionCtx) => (byAir(ctx) ? "conocimiento aéreo (AWB)" : bySea(ctx) ? "conocimiento de embarque (B/L)" : "CMR");

/** Sin prueba de origen, el importador paga el arancel general y pide compensarlo (salvo en DDP, donde ya es del vendedor). */
function originCompensation(ctx: DecisionCtx): ExtraCost | null {
  if (hasOriginProof(ctx) || !ctx.scenario.duty) return null;
  if (ctx.settings.incoterm && incotermOf(ctx.settings.incoterm).importClearance === "vendedor") return null;
  const dutyOf = (docs: string[]) => computeOperation(ctx.scenario, { ...ctx.settings, documents: docs }).lines.find((l) => l.concept === "arancel")?.amount ?? 0;
  const extra = round2(dutyOf(ctx.settings.documents ?? []) - dutyOf([...(ctx.settings.documents ?? []), "eur1"]));
  return extra > 0 ? { concept: "ajuste_comercial", label: "Compensación al comprador por el arancel general pagado", amount: extra, payer: "vendedor", note: "Sin prueba de origen no se aplicó el arancel preferencial; el comprador lo descuenta del pago." } : null;
}

export const RECAMBIOS_MARRUECOS: ExportScenario = {
  id: "recambios-marruecos",
  title: "Recambios de automoción de Sevilla a Casablanca",
  difficulty: "media",
  summary: "Un fabricante sevillano de piezas metálicas abastece a una planta de montaje de Casablanca que las necesita en una semana. Fuera de la UE, cruzando el Estrecho.",
  learningGoal: "Organizar una exportación urgente a un país vecino fuera de la UE: comparar camión con ferry, grupaje, barco y avión con un plazo crítico, acreditar el origen preferencial y elegir un cobro adecuado al transporte por carretera.",
  instructions: [
    "Avanza etapa por etapa y lee la consecuencia de cada decisión antes de seguir.",
    "El plazo manda: la línea de montaje del cliente se para si las piezas no llegan.",
    "Los tipos de arancel e impuesto son simulados: sirven para practicar el cálculo, no son los reales.",
  ],
  hs6: "870899",
  destination: "MA",
  company: { name: "Recambios Hispalis, S.L. (ficticia)", city: "Sevilla", description: "Fabricante de protectores de cárter y soportes metálicos para el mercado de recambios; primera venta a Marruecos." },
  buyer: { name: "Atlas Montage Exemple SARL (ficticia)", city: "Casablanca", description: "Planta de montaje de vehículos industriales ligeros con proveedores europeos." },
  quantity: { units: 600, unit: "pieza", detail: "600 protectores de cárter y soportes de motor en 6 palés" },
  exwUnitPrice: 140,
  unitCost: 116,
  targetMarginPct: 14,
  facts: [
    { label: "Producto", value: `${productName("870899")} (HS 870899)`, prov: REAL_HS },
    { label: "Clasificación de cada pieza", value: "Confirmar en el TARIC o con un agente de aduanas que cada referencia va en la 870899", prov: VERIFICAR },
    { label: "Destino", value: "Marruecos, fuera de la UE: despacho de exportación y de importación", prov: REAL_MARKET },
    { label: "Acuerdo UE–Marruecos y prueba de origen", value: "Hay acuerdo de asociación; en el caso se usa el EUR.1 (comprobar en Access2Markets qué prueba exige hoy)", prov: VERIFICAR },
    { label: "Pedido", value: "600 piezas en 6 palés · 3.200 kg · 9 m³", prov: SUPUESTO },
    { label: "Precio en origen (EXW)", value: "140,00 € por pieza, embalaje estándar incluido", prov: SUPUESTO },
    { label: "Coste de fabricación", value: "116,00 € por pieza", prov: SUPUESTO },
    { label: "Plazo pactado", value: "Mercancía en stock (1 día de preparación); entrega en la planta como máximo 7 días después del pedido", prov: SUPUESTO },
    { label: "Aranceles e impuestos del caso", value: "Arancel general 10 %, preferencial 0 % con prueba de origen; impuesto de importación 20 %: tipos SIMULADOS", prov: ESTIMACION },
  ],
  logistics: {
    origin: "Sevilla", destinationPlace: "Casablanca (planta del comprador)",
    cargo: { goods: "general", pallets: 6, grossKg: 3200, volumeM3: 9 },
    routes: [
      { id: "camion_ferry", modality: "multimodal", label: "Camión completo con ferry Algeciras–Tánger Med", transshipments: [], waitDays: R(0, 1),
        legs: [leg("camion", "Sevilla", "Algeciras", [1, 1], "principal", { kind: "camion_completo", km: 550 }, "Tarifa por los dos tramos por carretera (≈ 190 + 360 km)."),
          leg("ferry", "Algeciras", "Tánger Med", [0, 1], "principal", { kind: "ferry", perTruck: R(550, 850) }),
          leg("camion", "Tánger Med", "planta del comprador (Casablanca)", [1, 1], "principal")],
        terminal: { kind: "por_camion", origin: R(60, 120), destination: R(60, 120) }, destinationCharges: R(0, 0), suitability: [] },
      { id: "grupaje_ferry", modality: "multimodal", label: "Grupaje por carretera con ferry", transshipments: ["plataforma de grupaje de Algeciras"], waitDays: R(0, 1),
        legs: [leg("camion", "Sevilla", "plataforma de Algeciras", [2, 3], "principal", { kind: "grupaje_carretera", ratePer100Kg: R(22, 32) }, "Tarifa de grupaje hasta destino, ferry incluido."),
          leg("ferry", "Algeciras", "Tánger Med", [0, 1], "principal"),
          leg("camion", "Tánger Med", "planta del comprador (Casablanca)", [1, 2], "principal")],
        terminal: { kind: "por_palet", origin: R(8, 14), destination: R(8, 14) }, destinationCharges: R(0, 0), suitability: [] },
      { id: "lcl", modality: "maritimo_lcl", label: "Grupaje marítimo Sevilla–Casablanca (salida semanal)", transshipments: ["consolidación en Sevilla"], waitDays: R(2, 6),
        legs: [leg("camion", "Sevilla", "almacén de consolidación", [0, 1], "recogida"),
          leg("barco", "puerto de Sevilla", "Casablanca", [3, 4], "principal", { kind: "lcl", perRevenueTon: R(60, 90) }),
          leg("camion", "puerto de Casablanca", "planta del comprador", [1, 1], "ultima_milla")],
        terminal: { kind: "por_tonelada_volumen", origin: R(25, 40), destination: R(25, 40) }, destinationCharges: R(80, 150), suitability: [] },
      { id: "fcl", modality: "maritimo_fcl", label: "Contenedor de 20' Sevilla–Casablanca (salida semanal)", transshipments: [], waitDays: R(2, 6),
        legs: [leg("camion", "Sevilla", "puerto de Sevilla", [0, 1], "recogida"),
          leg("barco", "puerto de Sevilla", "Casablanca", [3, 4], "principal", { kind: "fcl", per20: R(650, 950), per40: R(900, 1300) }),
          leg("camion", "puerto de Casablanca", "planta del comprador", [1, 1], "ultima_milla")],
        terminal: { kind: "por_contenedor", origin: R(150, 230), destination: R(150, 230) }, destinationCharges: R(80, 150),
        suitability: [{ penalty: 10, note: "9 m³ en un contenedor de 20 pies: pagas espacio que va vacío." }] },
      { id: "aereo", modality: "aereo", label: "Avión Sevilla–Casablanca con escala en Madrid", transshipments: ["Madrid-Barajas"], waitDays: R(1, 1),
        legs: [leg("camion", "Sevilla", "aeropuerto de Sevilla", [0, 1], "recogida"),
          leg("avion", "Sevilla", "Casablanca (escala en Madrid)", [1, 2], "principal", { kind: "aereo", perChargeableKg: R(2.2, 3.2) }),
          leg("camion", "aeropuerto de Casablanca", "planta del comprador", [0, 1], "ultima_milla")],
        terminal: { kind: "por_kg_tasable", origin: R(0.08, 0.14), destination: R(0.08, 0.14) }, destinationCharges: R(60, 120), suitability: [] },
    ],
    infeasible: [
      { modality: "ferroviario", reason: "No hay conexión ferroviaria entre Europa y África: el Estrecho de Gibraltar obliga a un tramo marítimo." },
      { modality: "carretera", reason: "No hay ruta solo por carretera: el camión tiene que cruzar el Estrecho en ferry (es la opción multimodal)." },
    ],
    geographyNote: "Entre Sevilla y Marruecos siempre hay un tramo marítimo: en ferry con el camión a bordo, o en buque desde el puerto.",
    decisiveReason: "plazo",
  },
  packing: [
    { id: "palet_film", label: "Palés retractilados con cantoneras y piezas aceitadas contra la corrosión", cost: 360, protects: true },
    { id: "granel", label: "Piezas sueltas en cajas de cartón sin paletizar", cost: 120, protects: false },
  ],
  duty: { generalRatePct: 10, preferentialRatePct: 0, originProofDoc: "eur1" },
  importVatRatePct: 20,
  sellerVatRegisteredAtDestination: false,
  deadlineDays: 7,
  prepDays: 1,
  standard: { transport: "camion_ferry", packing: "palet_film" },
  incoterms: ["DAP", "CPT", "FCA", "FOB", "DDP"],
  decisions: [
    {
      id: "verificacion", stage: "ficha", kind: "single", title: "Primera comprobación",
      prompt: "Antes de cotizar, ¿qué compruebas primero?",
      concept: "Access2Markets es el portal de la Comisión Europea con aranceles, reglas de origen y requisitos de cada país.",
      options: [
        opt("acceso", "El arancel marroquí de la partida, las reglas de origen del acuerdo UE–Marruecos y qué prueba de origen exige (Access2Markets)", "correcta", "Bien: con origen acreditado el arancel puede ser cero, y eso cambia la competitividad de tu oferta."),
        opt("informe", "Un informe de solvencia de la planta", "razonable", "Útil para decidir el cobro, pero primero hay que saber con qué arancel y requisitos entrará la mercancía."),
        opt("vies", "Su NIF-IVA en VIES", "grave", "VIES solo sirve para empresas de la UE; Marruecos es un tercer país."),
      ],
      best: "acceso", whyBest: "Fuera de la UE, lo primero es conocer aranceles, origen y requisitos de entrada.",
    },
    {
      id: "requisito", stage: "preparacion", kind: "single", title: "Requisito pendiente",
      prompt: "El comprador avisa de que algunos recambios pasan un control de conformidad al importarse. ¿Qué haces?",
      concept: "Muchos países controlan la conformidad técnica de ciertos productos importados; el trámite lo hace el importador, pero necesita datos del fabricante.",
      options: [
        opt("fichas", "Preguntar qué referencias lo necesitan y enviarle fichas técnicas y certificados de material antes del envío", "correcta", "Correcto: el trámite es suyo, pero sin tu documentación técnica la mercancía queda retenida. Compruébalo en una operación real."),
        opt("ce", "Nada: con el marcado CE de la UE basta en cualquier país", "grave", "El marcado CE es europeo: fuera de la UE rigen las normas del país de destino."),
        opt("despues", "Resolverlo cuando la aduana lo pida", "razonable", "Puede funcionar, pero con 7 días de plazo una retención en destino para la línea del cliente."),
      ],
      best: "fichas", whyBest: "Anticiparse a los controles del país de destino evita retenciones.",
    },
    {
      id: "incoterm", stage: "contrato", kind: "single", title: "Incoterm del contrato",
      prompt: "La planta quiere recibir las piezas en sus instalaciones de Casablanca; su agente de aduanas hará la importación. ¿Qué Incoterm propones?",
      concept: "FAS, FOB, CFR y CIF son solo para transporte marítimo; con camión (también si embarca en un ferry), avión o tren hay que usar reglas multimodales.",
      options: [
        opt("DAP", "DAP Casablanca (planta del comprador)", "correcta", "Coherente con lo que pide: llevas la mercancía hasta su planta y él despacha la importación con su agente."),
        opt("CPT", "CPT Casablanca", "razonable", "Pagas el transporte hasta Casablanca, pero el riesgo pasa al entregar al primer transportista en España: no es lo que pidió."),
        opt("FCA", "FCA Sevilla (tus instalaciones)", "razonable", "Te quita el transporte, pero la planta tendría que organizarlo desde Marruecos con un plazo muy corto."),
        opt("FOB", "FOB Algeciras", "grave", "FOB es solo marítima y la mercancía irá en camión, aunque cruce en ferry; además no entrega donde pide el comprador."),
        opt("DDP", "DDP Casablanca", "grave", "Tendrías que importar en Marruecos y pagar arancel e impuestos allí sin estar registrado."),
      ],
      best: "DAP", whyBest: "Entrega en la planta del comprador, que despacha la importación: DAP, una regla multimodal.",
    },
    ownershipDecision,
    {
      id: "payment", stage: "contrato", kind: "single", title: "Forma de cobro",
      prompt: "Cliente nuevo, envío probable por carretera (el CMR no es un título de la mercancía). ¿Qué forma de cobro propones?",
      options: [
        opt("anticipo_30_70", "30 % anticipado y 70 % contra copia de documentos", "correcta", "Buen equilibrio: el anticipo cubre parte del riesgo en un envío por carretera, donde el comprador puede retirar la mercancía sin presentar documentos."),
        opt("cobro_documentario", "Cobro documentario (documentos contra pago)", "razonable", "Por carretera protege poco: el CMR no da derecho a retirar la mercancía, así que el comprador puede recibirla sin pagar los documentos."),
        opt("carta_credito", "Carta de crédito confirmada", "razonable", "Muy segura, pero cara y lenta de abrir para un pedido urgente de una semana."),
        opt("abierta_60", "Cuenta abierta a 60 días", "grave", "Financias dos meses a un cliente nuevo fuera de la UE sin ninguna garantía."),
      ],
      best: "anticipo_30_70", whyBest: "Con transporte por carretera el documento no controla la mercancía: un anticipo reduce el riesgo a bajo coste.",
    },
    ...routeDecisions("6 palés (3.200 kg, 9 m³), 7 días de plazo con 1 de preparación. Compara las alternativas y elige la ruta."),
    {
      id: "packing", stage: "logistica", kind: "single", title: "Embalaje",
      prompt: "Piezas de acero que cruzarán el Estrecho y se manipularán en terminales. ¿Qué embalaje usas?",
      options: [
        opt("palet_film", "Palés retractilados con cantoneras y piezas aceitadas (360 €)", "correcta", "Protege del golpe y de la corrosión por la humedad marina, y agiliza la carga y la inspección."),
        opt("granel", "Cajas de cartón sueltas sin paletizar (120 €)", "grave", "Las cajas sueltas se dañan y se pierden en las manipulaciones, y la inspección aduanera tarda más."),
      ],
      best: "palet_film", whyBest: "El embalaje debe aguantar todas las manipulaciones y el ambiente marino.",
    },
    {
      id: "insurance", stage: "logistica", kind: "single", title: "Seguro de transporte",
      prompt: (ctx) => `En ${ctx.settings.incoterm} el riesgo del viaje es tuyo hasta Casablanca y la regla no te obliga a asegurar. ¿Contratas seguro?`,
      appliesIf: (ctx) => !!ctx.settings.incoterm && sellerBearsTransitRisk(incotermOf(ctx.settings.incoterm)) && !sellerMustInsure(incotermOf(ctx.settings.incoterm)),
      options: [
        opt("si", "Sí, al 110 % del valor", "correcta", "Cubres un riesgo que es tuyo hasta la planta del cliente, incluido el cruce en ferry."),
        opt("no", "No", "razonable", "Ahorras la prima, pero una pérdida en ruta la asumirías tú."),
      ],
      best: "si", whyBest: "Quien soporta el riesgo del transporte es quien debe valorar asegurarlo.",
    },
    {
      id: "documents", stage: "documentacion", kind: "multi", title: "Documentación del envío",
      prompt: "Marca los documentos que debes preparar o gestionar como exportador.",
      concept: "Con el acuerdo UE–Marruecos el origen preferencial se acredita con una prueba de origen; en el caso, el certificado EUR.1 (verifica en una operación real qué prueba exige hoy).",
      docs: (ctx) => [
        { id: "factura", label: "Factura comercial", need: "obligatorio", explain: "Base del despacho en los dos países y del cobro." },
        { id: "packing_list", label: "Packing list (lista de bultos)", need: "obligatorio", explain: "La aduana y el comprador comprueban con ella bultos, referencias y pesos." },
        { id: "transporte", label: `Documento de transporte: ${transportDoc(ctx)}`, need: "obligatorio", explain: "Es el contrato del transporte principal de la ruta elegida y acompaña a la mercancía." },
        { id: "dua_exportacion", label: "DUA de exportación", need: sellerClearsExport(ctx) ? "obligatorio" : "innecesario", explain: sellerClearsExport(ctx) ? "Despachas tú la exportación: el DUA con salida prueba además la exención de IVA." : "Con EXW la exportación la despacha el comprador." },
        { id: "eur1", label: "Certificado de circulación EUR.1", need: "obligatorio", explain: "Sin prueba de origen el importador paga el arancel general en lugar del preferencial." },
        { id: "fichas", label: "Fichas técnicas para el control de conformidad del importador", need: "recomendado", explain: "Sin ellas el control de conformidad en destino puede retener la mercancía." },
        { id: "certificado_origen", label: "Certificado de origen de la Cámara de Comercio", need: "innecesario", explain: "No da derecho al arancel preferencial: para eso está la prueba de origen del acuerdo." },
      ],
    },
    {
      id: "clasificacion", stage: "aduanas", kind: "single", title: "Clasificación arancelaria",
      prompt: "¿Con qué código HS6 declaras los protectores de cárter y soportes de motor?",
      concept: "El código HS (Sistema Armonizado) clasifica la mercancía y determina aranceles y requisitos. Los seis primeros dígitos son comunes en todo el mundo.",
      options: [
        opt("870899", "870899: otras partes y accesorios de vehículos", "correcta", "Es la partida del catálogo de SmarTrade para estas piezas (en una operación real, confírmalo referencia a referencia)."),
        opt("870829", "870829: partes de carrocería", "grave", "Los protectores de cárter y los soportes de motor no son carrocería: una clasificación errónea puede cambiar el arancel y provocar sanciones."),
        opt("401110", "401110: neumáticos para turismos", "grave", "No tiene relación con la mercancía."),
      ],
      best: "870899", whyBest: "La clasificación correcta es la base de todo el despacho.",
    },
    {
      id: "arancel", stage: "aduanas", kind: "single", title: "Arancel de importación",
      prompt: (ctx) => hasOriginProof(ctx)
        ? "Has incluido el EUR.1. ¿Qué arancel pagarán las piezas al entrar en Marruecos en este caso?"
        : "No has incluido prueba de origen. ¿Qué arancel pagarán las piezas al entrar en Marruecos en este caso?",
      options: [
        opt("segun_origen", "El preferencial (0 % en el caso) si se acredita el origen; si no, el general (10 % en el caso)", "correcta",
          (ctx) => hasOriginProof(ctx) ? "Correcto: con el EUR.1 se aplica el tipo preferencial." : "Correcto, y por eso tu cliente pagará el 10 % simulado: te pedirá compensarlo.", originCompensation),
        opt("vendedor", "El que pague el vendedor, que siempre asume los aranceles", "grave",
          (ctx) => `Quién paga el arancel depende del Incoterm: en ${ctx.settings.incoterm ?? "la regla elegida"} lo paga ${ctx.settings.incoterm ? incotermOf(ctx.settings.incoterm).importClearance : "quien despacha la importación"}.`, originCompensation),
        opt("ninguno", "Ninguno: Marruecos está junto a la UE", "grave", "La cercanía no exime: sin acreditar el origen se paga el arancel general.", originCompensation),
      ],
      best: "segun_origen", whyBest: "El arancel depende del origen acreditado y del acuerdo; quién lo paga depende del Incoterm.",
    },
    {
      id: "incidencia", stage: "entrega", kind: "single", incident: true, title: "Incidencia: retención en la aduana de destino",
      prompt: (ctx) => `La aduana marroquí retiene la mercancía: la descripción de la factura no coincide con la del ${transportDoc(ctx)} y el EUR.1 cita otra partida. La planta tiene la línea parada esperando; cada día cuesta 120 € de almacenaje y el cliente pide compensación por el retraso.`,
      options: [
        opt("corregir", "Comprobar cuál es la descripción correcta, emitir las correcciones hoy y enviarlas al agente del importador", "correcta",
          "Se resuelve en 2 días. Como el error estaba en tus documentos, asumes el almacenaje y un descuento por el retraso.",
          (ctx) => ({ concept: "incidencia", label: "Retención de 2 días y descuento por retraso", amount: round2(2 * 120 + 0.005 * 2 * computeOperation(ctx.scenario, ctx.settings).revenue), payer: "vendedor", note: "2 × 120 € de almacenaje + 0,5 % del pedido por día (simulados)." })),
        opt("urgente", "Pagar a un agente en destino para que tramite la corrección por vía urgente", "razonable",
          "Se resuelve en 1 día, con un coste de gestión adicional.",
          (ctx) => ({ concept: "incidencia", label: "Gestión urgente, 1 día de retención y descuento", amount: round2(300 + 120 + 0.005 * computeOperation(ctx.scenario, ctx.settings).revenue), payer: "vendedor", note: "Importes simulados." })),
        opt("esperar", "Dejar que lo resuelva el importador: el despacho es suyo", "grave",
          "Sin tu corrección la retención dura 8 días y el cliente te repercute el almacenaje y la línea parada.",
          (ctx) => ({ concept: "incidencia", label: "Retención de 8 días y penalización por la línea parada", amount: round2(8 * 120 + 0.005 * 8 * computeOperation(ctx.scenario, ctx.settings).revenue), payer: "vendedor", note: "8 × 120 € + 0,5 % del pedido por día (simulados)." })),
      ],
      best: "corregir", whyBest: "Los documentos deben coincidir entre sí: quien los emitió mal debe corregirlos cuanto antes, aunque el despacho lo haga otro.",
    },
    {
      id: "cierre", stage: "entrega", kind: "single", title: "Cobro y cierre",
      prompt: "La planta ha recibido las piezas y has cobrado. ¿Qué haces para cerrar la operación?",
      options: [
        opt("archivar", "Comparar el margen real con el previsto y archivar el DUA con la salida confirmada, el documento de transporte, el EUR.1, la factura y los cobros", "correcta", "El DUA con salida prueba la exención de IVA de la exportación, y comparar márgenes mejora tus próximos precios."),
        opt("solo_cobro", "Archivar solo los justificantes de cobro", "grave", "Sin la prueba de salida podrías tener que justificar ante Hacienda por qué la factura no lleva IVA."),
      ],
      best: "archivar", whyBest: "Cerrar una operación es comprobar el resultado y guardar las pruebas.",
    },
  ],
};
