import { ESTIMACION, REAL_HS, REAL_MARKET, SUPUESTO, VERIFICAR } from "../../provenance";
import { round2 } from "../../money";
import { computeOperation, sellerBearsTransitRisk, sellerMustInsure, incotermOf } from "../costs";
import { R } from "../../logistics/types";
import type { DecisionCtx, ExportScenario } from "../types";
import { bySea, eur, leg, opt, ownershipDecision, productName, routeDecisions, sellerCarries } from "./shared";

/**
 * CASO A1 (básico, intracomunitario). Todo lo que no sea el código HS o la pertenencia de Alemania a la UE es SIMULADO:
 * empresas ficticias, precios, costes y plazos inventados con fines educativos.
 * Idea didáctica: dentro de la UE no hay aduana; lo que importa es el IVA (entrega intracomunitaria) y la prueba del transporte.
 * Logística: con 20 palés y 15 días (5 de preparación), el camión completo es lo lógico; el barco vía Hamburgo es más
 * barato pero no llega, y grupaje y tren solo llegan si todo va bien. Rutas didácticas: tarifas en rangos inventados.
 */
const revenueOf = (ctx: DecisionCtx) => computeOperation(ctx.scenario, ctx.settings).revenue;

export const ACEITE_ALEMANIA: ExportScenario = {
  id: "aceite-alemania",
  title: "Aceite de oliva virgen extra a Múnich",
  difficulty: "básica",
  summary: "Primera venta de una almazara andaluza a un mayorista alemán de alimentación gourmet. Operación dentro de la UE, por carretera.",
  learningGoal: "Gestionar una venta intracomunitaria: elegir un Incoterm coherente con el transporte, preparar la documentación y aplicar bien el IVA sin trámites de aduana.",
  instructions: [
    "Avanza etapa por etapa. En cada una toma una decisión y lee su consecuencia antes de continuar.",
    "Las decisiones confirmadas no se pueden cambiar: igual que en una operación real.",
    "Al final verás tu nota de conocimientos y, por separado, el resultado económico.",
  ],
  hs6: "150920",
  destination: "DE",
  company: { name: "Almazara Valdeolivo, S.L. (ficticia)", city: "Jaén", description: "Almazara familiar con marca propia; exporta por primera vez fuera de España." },
  buyer: { name: "Feinkost Beispiel GmbH (ficticia)", city: "Múnich", description: "Mayorista de alimentación gourmet que abastece a tiendas especializadas del sur de Alemania." },
  quantity: { units: 1000, unit: "caja", detail: "1.000 cajas de 12 botellas de vidrio de 0,75 l (12.000 botellas, 9.000 l)" },
  exwUnitPrice: 48,
  unitCost: 38.4,
  targetMarginPct: 15,
  facts: [
    { label: "Producto", value: `${productName("150920")} (HS 150920)`, prov: REAL_HS },
    { label: "Destino", value: "Alemania, Estado miembro de la UE: no hay aduana ni aranceles entre España y Alemania", prov: REAL_MARKET },
    { label: "Pedido", value: "1.000 cajas de 12 botellas de 0,75 l", prov: SUPUESTO },
    { label: "Peso y volumen", value: "≈ 17.000 kg brutos y 32 m³ en 20 palés europeos (un camión completo)", prov: ESTIMACION },
    { label: "Precio en origen (EXW)", value: "48,00 € por caja, embalaje estándar incluido", prov: SUPUESTO },
    { label: "Coste de producción", value: "38,40 € por caja", prov: SUPUESTO },
    { label: "Plazo pactado", value: "Entrega en Múnich como máximo 15 días después de confirmar el pedido", prov: SUPUESTO },
    { label: "Petición del comprador", value: "Precio entregado en su almacén de Múnich y pago a 30 días", prov: SUPUESTO },
    { label: "Etiquetado", value: "Información alimentaria obligatoria en alemán para la venta en Alemania", prov: VERIFICAR },
  ],
  logistics: {
    origin: "Jaén", destinationPlace: "Múnich (almacén del comprador)",
    cargo: { goods: "fragil", pallets: 20, grossKg: 17_000, volumeM3: 32 },
    routes: [
      { id: "camion_completo", modality: "carretera", label: "Camión completo (FTL) Jaén–Múnich puerta a puerta", transshipments: [], waitDays: R(0, 1),
        legs: [leg("camion", "Jaén", "Múnich", [4, 5], "principal", { kind: "camion_completo", km: 2300 })],
        terminal: { kind: "por_camion", origin: R(0, 0), destination: R(0, 0) }, destinationCharges: R(0, 0), suitability: [] },
      { id: "grupaje", modality: "carretera", label: "Grupaje por carretera (plataformas)", transshipments: ["plataforma de Madrid"], waitDays: R(0, 2),
        legs: [leg("camion", "Jaén", "Múnich (vía plataformas)", [6, 9], "principal", { kind: "grupaje_carretera", ratePer100Kg: R(18, 26) })],
        terminal: { kind: "por_palet", origin: R(4, 7), destination: R(4, 7) }, destinationCharges: R(0, 0),
        suitability: [{ penalty: 15, note: "Más manipulaciones en las plataformas: más riesgo de roturas en botellas de vidrio." }] },
      { id: "tren", modality: "ferroviario", label: "Tren con camión en los extremos", transshipments: ["frontera franco-española (cambio de ancho de vía)"], waitDays: R(1, 3),
        transshipmentCost: R(180, 280),
        legs: [leg("camion", "Jaén", "terminal ferroviaria de Madrid", [1, 1], "recogida", { kind: "camion_completo", km: 330 }),
          leg("tren", "Madrid", "frontera (ancho ibérico)", [2, 3], "principal", { kind: "tren", perContainer40: R(1900, 2600) }, "Incluye los dos tramos ferroviarios."),
          leg("tren", "frontera (ancho internacional)", "terminal de Múnich", [3, 4], "principal"),
          leg("camion", "terminal de Múnich", "almacén del comprador", [1, 1], "ultima_milla")],
        terminal: { kind: "por_contenedor", origin: R(120, 200), destination: R(120, 200) }, destinationCharges: R(0, 0),
        suitability: [{ penalty: 10, note: "El cambio de ancho de vía obliga a transbordar la carga: una manipulación más." }] },
      { id: "maritimo", modality: "maritimo_fcl", label: "Contenedor por mar Algeciras–Hamburgo y camión", transshipments: [], waitDays: R(2, 5),
        legs: [leg("camion", "Jaén", "puerto de Algeciras", [1, 1], "recogida", { kind: "camion_completo", km: 300 }),
          leg("barco", "Algeciras", "Hamburgo", [7, 9], "principal", { kind: "fcl", per20: R(700, 1100), per40: R(950, 1400) }),
          leg("camion", "Hamburgo", "almacén del comprador (Múnich)", [2, 2], "ultima_milla", { kind: "camion_completo", km: 780 })],
        terminal: { kind: "por_contenedor", origin: R(180, 260), destination: R(180, 260) }, destinationCharges: R(80, 160), suitability: [] },
      { id: "aereo", modality: "aereo", label: "Avión Madrid–Múnich con camión en los extremos", transshipments: [], waitDays: R(1, 2),
        legs: [leg("camion", "Jaén", "aeropuerto de Madrid-Barajas", [1, 1], "recogida", { kind: "camion_completo", km: 330 }),
          leg("avion", "Madrid", "Múnich", [1, 1], "principal", { kind: "aereo", perChargeableKg: R(1.9, 2.8) }),
          leg("camion", "aeropuerto de Múnich", "almacén del comprador", [0, 1], "ultima_milla")],
        terminal: { kind: "por_kg_tasable", origin: R(0.08, 0.14), destination: R(0.08, 0.14) }, destinationCharges: R(60, 120),
        suitability: [{ penalty: 10, note: "17 toneladas en avión exigen carguero o varios vuelos." }] },
    ],
    infeasible: [],
    geographyNote: "Múnich no tiene puerto marítimo: por barco o avión hacen falta tramos por carretera hasta el almacén del comprador.",
    decisiveReason: "barata_que_cumple",
  },
  packing: [
    { id: "protegido", label: "Cajas con separadores, palet retractilado y esquineros", cost: 1300, protects: true },
    { id: "basico", label: "Cajas sin separadores", cost: 700, protects: false },
  ],
  duty: null,
  importVatRatePct: null,
  sellerVatRegisteredAtDestination: false,
  deadlineDays: 15,
  prepDays: 5,
  standard: { transport: "camion_completo", packing: "protegido" },
  incoterms: ["DAP", "FCA", "EXW", "CIF"],
  decisions: [
    {
      id: "verificacion", stage: "ficha", kind: "single", title: "Primera comprobación",
      prompt: "Antes de aceptar el pedido, ¿qué compruebas primero del comprador?",
      concept: "VIES es el sistema de la Comisión Europea para comprobar si un número de IVA intracomunitario es válido.",
      options: [
        opt("vies", "Que su NIF-IVA intracomunitario es válido en VIES", "correcta", "Bien: sin un NIF-IVA válido no podrías tratar la venta como entrega intracomunitaria exenta y tendrías que repercutir IVA español."),
        opt("informe", "Un informe comercial de solvencia", "razonable", "Es buena práctica con un cliente nuevo, pero primero va el NIF-IVA: determina cómo se factura la operación."),
        opt("dua", "Cómo tramitar el DUA de exportación a Alemania", "grave", "Error importante: entre países de la UE no hay despacho de exportación ni DUA. Alemania forma parte del mercado único."),
        opt("nada", "Nada: es una empresa alemana, el riesgo es mínimo", "grave", "Sin comprobar el NIF-IVA no sabes si puedes facturar sin IVA, y sin información de solvencia vendes a ciegas."),
      ],
      best: "vies", whyBest: "En una venta intracomunitaria, el NIF-IVA válido del comprador es la condición para facturar sin IVA español.",
    },
    {
      id: "requisito", stage: "preparacion", kind: "single", title: "Requisito pendiente",
      prompt: "El comprador recuerda que el aceite se venderá en tiendas alemanas. ¿Qué requisito queda pendiente?",
      concept: "En la UE, la información alimentaria obligatoria debe figurar en una lengua que entiendan los consumidores del país de venta.",
      options: [
        opt("etiquetado", "Etiquetado con la información obligatoria en alemán", "correcta", "Correcto: es la adaptación que exige vender al consumidor en Alemania (compruébalo en la normativa vigente antes de una operación real)."),
        opt("registro", "Un registro sanitario de importación en Alemania", "grave", "No existe ese trámite para un alimento que circula dentro del mercado único de la UE."),
        opt("ninguno", "Ninguno: el aceite ya cumple la normativa española", "grave", "Cumplir la normativa es necesario, pero el etiquetado debe estar en la lengua del país de venta."),
      ],
      best: "etiquetado", whyBest: "El producto ya cumple las normas de la UE; lo que cambia al venderlo en Alemania es la lengua de la etiqueta.",
    },
    {
      id: "incoterm", stage: "contrato", kind: "single", title: "Incoterm del contrato",
      prompt: "El comprador quiere el precio entregado en su almacén de Múnich y el transporte será por carretera. ¿Qué Incoterm pones en el contrato?",
      concept: "Un Incoterm fija dónde se entrega la mercancía, cuándo pasa el riesgo y quién paga cada tramo. No fija el precio ni la forma de pago.",
      options: [
        opt("DAP", "DAP Múnich (almacén del comprador)", "correcta", "Coherente con lo que pide el comprador: transportas tú hasta Múnich y el riesgo es tuyo hasta allí. El precio debe incluir ese transporte."),
        opt("FCA", "FCA Jaén (tus instalaciones)", "razonable", "Reduce tu riesgo, pero el comprador tendría que organizar un camión desde España, que no es lo que pidió: puede costarte la venta. El precio por caja sería menor."),
        opt("EXW", "EXW Jaén", "razonable", "Te quita casi todas las obligaciones, pero en una venta intracomunitaria necesitas probar que la mercancía salió de España para no repercutir IVA, y con EXW el transporte no lo controlas tú."),
        opt("CIF", "CIF Hamburgo", "grave", "CIF es una regla solo para transporte marítimo, el envío va por carretera y el destino es Múnich, no un puerto."),
      ],
      best: "DAP", whyBest: "DAP es una regla multimodal que entrega en el lugar que pide el comprador.",
    },
    ownershipDecision,
    {
      id: "payment", stage: "contrato", kind: "single", title: "Forma de cobro",
      prompt: "Es un cliente nuevo, de un país de la UE, que pide pagar a 30 días. ¿Qué forma de cobro propones?",
      options: [
        opt("anticipo_30_70", "30 % anticipado y 70 % a la entrega de documentos", "correcta", "Equilibrio razonable para un primer pedido: el anticipo cubre parte del riesgo y el comprador no paga todo por adelantado."),
        opt("abierta_30", "Cuenta abierta a 30 días, como pide", "razonable", "Es habitual dentro de la UE y facilita cerrar la venta, pero sin informe de solvencia ni garantía asumes todo el riesgo en el primer pedido."),
        opt("carta_credito", "Carta de crédito documentaria confirmada", "razonable", "Muy segura, pero cara y burocrática para una venta intracomunitaria por carretera; el comprador probablemente la rechazará."),
        opt("abierta_90", "Cuenta abierta a 90 días para ganarte al cliente", "grave", "Financias tres meses a un cliente que no conoces y que solo pedía 30 días: más riesgo y más coste sin obtener nada a cambio."),
      ],
      best: "anticipo_30_70", whyBest: "Con un cliente nuevo conviene repartir el riesgo; más adelante, con historial, se puede pasar a cuenta abierta.",
    },
    ...routeDecisions("Tienes 20 palés (≈17 t, 32 m³) de botellas de vidrio y 15 días de plazo, de los que 5 son de preparación en almacén. Compara las alternativas y elige la ruta."),
    {
      id: "packing", stage: "logistica", kind: "single", title: "Embalaje",
      prompt: "Son botellas de vidrio que viajarán 2.000 km. ¿Qué embalaje usas?",
      options: [
        opt("protegido", "Cajas con separadores, palet retractilado y esquineros (1.300 €)", "correcta", "Protege el vidrio y estabiliza la carga. Si el riesgo del viaje es tuyo, una rotura la pagarías tú; si es del comprador, se la estarías provocando a tu cliente."),
        opt("basico", "Cajas sin separadores (700 €)", "grave", "Ahorras 600 €, pero el riesgo de roturas en vidrio es alto y una reclamación costaría mucho más."),
      ],
      best: "protegido", whyBest: "El embalaje debe proteger la mercancía durante todo el viaje.",
    },
    {
      id: "insurance", stage: "logistica", kind: "single", title: "Seguro de transporte",
      prompt: (ctx) => `En ${ctx.settings.incoterm} el riesgo del viaje es tuyo hasta Múnich y la regla no te obliga a asegurar. ¿Contratas seguro?`,
      appliesIf: (ctx) => !!ctx.settings.incoterm && sellerBearsTransitRisk(incotermOf(ctx.settings.incoterm)) && !sellerMustInsure(incotermOf(ctx.settings.incoterm)),
      options: [
        opt("si", "Sí, al 110 % del valor de la mercancía", "correcta", "Por una prima de en torno al 0,25 % del valor (estimación) cubres un riesgo de unos 50.000 €."),
        opt("no", "No, para ahorrar el coste", "razonable", "Te ahorras la prima, pero si el camión sufre un accidente pierdes la mercancía y la venta."),
      ],
      best: "si", whyBest: "Quien soporta el riesgo del transporte es quien debe valorar asegurarlo.",
    },
    {
      id: "documents", stage: "documentacion", kind: "multi", title: "Documentación del envío",
      prompt: "Marca los documentos que debes preparar para este envío.",
      docs: (ctx) => [
        { id: "factura", label: "Factura comercial", need: "obligatorio", explain: "Con el NIF-IVA de las dos empresas y la mención de entrega intracomunitaria exenta." },
        { id: "packing_list", label: "Packing list (lista de bultos)", need: "recomendado", explain: "Detalla palets, cajas y pesos; facilita la carga y la recepción." },
        { id: "cmr", label: "CMR (carta de porte por carretera)", need: bySea(ctx) || ctx.settings.transport === "tren" ? "recomendado" : "obligatorio", explain: "Es el contrato de transporte por carretera y, firmado en destino, prueba que la mercancía salió de España (necesario para no repercutir IVA)." },
        ...(bySea(ctx) ? [{ id: "bl", label: "Conocimiento de embarque (B/L)", need: "obligatorio" as const, explain: "Es el documento del tramo marítimo." }] : []),
        ...(ctx.settings.transport === "tren" ? [{ id: "cim", label: "Carta de porte ferroviaria (CIM)", need: "obligatorio" as const, explain: "Es el contrato del tramo por ferrocarril y prueba la salida de la mercancía." }] : []),
        { id: "dua_exportacion", label: "DUA de exportación", need: "incorrecto", explain: "No hay despacho de exportación entre países de la UE." },
        { id: "eur1", label: "Certificado de circulación EUR.1", need: "incorrecto", explain: "Prueba el origen preferencial frente a terceros países; dentro de la UE no se usa." },
        { id: "certificado_origen", label: "Certificado de origen de la Cámara de Comercio", need: "innecesario", explain: "No lo exige una venta dentro de la UE; solo si el comprador lo pidiera por motivos comerciales." },
      ],
    },
    {
      id: "iva", stage: "aduanas", kind: "single", title: "Tratamiento fiscal",
      prompt: "El NIF-IVA del comprador es válido en VIES. ¿Cómo tratas la venta?",
      concept: "En una entrega intracomunitaria, el vendedor factura sin IVA y el comprador declara el IVA en su país (inversión del sujeto pasivo).",
      options: [
        opt("exenta", "Factura sin IVA (entrega intracomunitaria exenta) y la declaras en el modelo 349", "correcta", "Correcto. Guarda la prueba de que la mercancía llegó a Alemania (CMR firmado) por si Hacienda la pide."),
        opt("iva_es", "Factura con IVA español, por si acaso", "grave", "Con un NIF-IVA válido y la mercancía saliendo de España, la operación está exenta: cobrar IVA español es un error de facturación."),
        opt("arancel", "Calcular el arancel de entrada en Alemania", "grave", "Entre países de la UE no hay aranceles."),
      ],
      best: "exenta", whyBest: "Venta a empresa de otro país de la UE con NIF-IVA válido y transporte probado: entrega intracomunitaria exenta.",
    },
    {
      id: "incidencia", stage: "entrega", kind: "single", incident: true, title: "Incidencia: avería en ruta",
      prompt: (ctx) => sellerCarries(ctx)
        ? `El transporte que contrataste sufre una avería en ruta y la mercancía llegará 3 días tarde. El contrato prevé una penalización del 0,5 % del valor del pedido por día de retraso (${eur(round2(0.005 * revenueOf(ctx)))} por día).`
        : "El camión que contrató el comprador sufre una avería en Francia y llegará 3 días tarde. El comprador te llama molesto.",
      options: [
        opt("avisar", "Avisar enseguida, dar una nueva fecha y ofrecer asumir un día de penalización", "correcta",
          (ctx) => sellerCarries(ctx) ? "La transparencia mantiene la confianza: el comprador acepta reducir la penalización a un día." : "El transporte era del comprador, así que no te corresponde penalización; aun así, ayudar a coordinar refuerza la relación. No asumes ningún coste.",
          (ctx) => sellerCarries(ctx) ? { concept: "incidencia", label: "Penalización por retraso (1 día)", amount: round2(0.005 * revenueOf(ctx)), payer: "vendedor", note: "Negociada tras avisar a tiempo." } : null),
        opt("urgente", "Contratar un camión de sustitución urgente con dos conductores", "razonable",
          (ctx) => sellerCarries(ctx) ? "Reduces el retraso a un día, pero pagas el camión urgente y además la penalización de ese día." : "No te corresponde: el transporte lo contrató el comprador. Pagarías un coste que no es tuyo.",
          (ctx) => ({ concept: "incidencia", label: "Camión urgente de sustitución" + (sellerCarries(ctx) ? " y 1 día de penalización" : ""), amount: round2(1400 + (sellerCarries(ctx) ? 0.005 * revenueOf(ctx) : 0)), payer: "vendedor", note: "Coste simulado del transporte de sustitución." })),
        opt("callar", "No decir nada y esperar a que llegue", "grave",
          (ctx) => sellerCarries(ctx) ? "El comprador se entera por su cuenta, aplica los tres días de penalización y desconfía de ti en próximos pedidos." : "Aunque el transporte no era tuyo, ignorar al cliente daña la relación comercial.",
          (ctx) => sellerCarries(ctx) ? { concept: "incidencia", label: "Penalización por retraso (3 días)", amount: round2(0.015 * revenueOf(ctx)), payer: "vendedor", note: "Aplicada íntegramente por falta de aviso." } : null),
      ],
      best: "avisar", whyBest: "Ante un retraso, comunicar pronto y proponer una solución suele reducir el daño económico y comercial.",
    },
    {
      id: "cierre", stage: "entrega", kind: "single", title: "Cobro y cierre",
      prompt: "La mercancía ha llegado y has cobrado. ¿Qué haces para cerrar la operación?",
      options: [
        opt("archivar", "Comparar el margen real con el previsto y archivar factura, CMR firmado y justificante de cobro", "correcta", "Así sabes si el precio era adecuado y conservas la prueba de la entrega intracomunitaria."),
        opt("solo_factura", "Archivar solo la factura", "grave", "Sin el CMR firmado no puedes demostrar que la mercancía salió de España: Hacienda podría exigirte el IVA."),
      ],
      best: "archivar", whyBest: "Cerrar una operación es comprobar el resultado y guardar las pruebas.",
    },
  ],
};
