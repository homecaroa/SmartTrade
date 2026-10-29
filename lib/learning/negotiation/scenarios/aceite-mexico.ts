import { ESTIMACION, REAL_HS, REAL_MARKET, SUPUESTO, VERIFICAR } from "../../provenance";
import { productName } from "../../export/scenarios/shared";
import type { NegotiationScenario } from "../types";

/**
 * CASO B1 (medio). Reales: el código HS y el país. Todo lo demás es SIMULADO: empresas ficticias, costes, límites del
 * comprador y probabilidades de impago. Idea didáctica: el comprador valora mucho el aplazamiento y la exclusividad;
 * se gana negociando con intercambios (90 días con seguro de crédito, exclusividad por volumen), no solo bajando el precio.
 */
export const ACEITE_MEXICO: NegotiationScenario = {
  id: "aceite-mexico",
  title: "Aceite de oliva para un distribuidor mexicano",
  difficulty: "media",
  summary: "Una almazara española negocia su primer pedido con un distribuidor de alimentación gourmet de México que pide aplazamiento y exclusividad.",
  learningGoal: "Preparar una negociación (punto de retirada y estrategia) y cerrar un acuerdo rentable intercambiando concesiones en lugar de limitarse a rebajar el precio.",
  instructions: [
    "Lee el perfil del comprador y tus costes. Prepara tu estrategia antes de ofertar.",
    "Escribe tus ofertas con valores concretos. El comprador responde según sus reglas, sin azar.",
    "Puedes aceptar su contraoferta, rechazarla o hacer otra propuesta. Tiene paciencia limitada.",
  ],
  hs6: "150920",
  market: "MX",
  unit: "caja",
  unitDetail: "caja de 12 botellas de 0,5 l",
  company: { name: "Almazara Valdeolivo, S.L. (ficticia)", city: "Jaén", description: "Almazara con marca propia, certificación de calidad y capacidad para 2.000 cajas por pedido." },
  buyer: {
    name: "Distribuidora Ejemplo del Bajío, S.A. de C.V. (ficticia)", city: "León (Guanajuato)", type: "Distribuidor mayorista de alimentación gourmet",
    description: "Abastece a tiendas delicatessen, hoteles y restaurantes del centro de México. Busca un aceite español de gama media-alta para su catálogo.",
    needs: ["Un aceite virgen extra español que pueda vender con marca de origen", "Vida útil larga al llegar, porque rota el stock despacio", "Margen suficiente para su red de reventa"],
    budget: "Trabaja con un precio de compra puesto en su almacén cercano al de otros aceites europeos que ya distribuye.",
    volume: "Un primer pedido de alrededor de un contenedor", frequency: "Pedidos trimestrales si el producto funciona",
    requirements: ["Análisis de laboratorio por lote", "Vida útil mínima de 18 meses a la llegada (garantía ampliada)", "Etiquetado conforme a la normativa mexicana (lo adapta él con tu información)"],
    language: "Español", context: ["Valora construir una relación estable con el proveedor", "En su canal es habitual pagar a 90 días", "Prefiere recibir la mercancía con flete y seguro pagados hasta el puerto"],
    paymentHabit: "Pide cuenta abierta a 90 días", risk: "medio",
  },
  facts: [
    { label: "Producto", value: `${productName("150920")} (HS 150920)`, prov: REAL_HS },
    { label: "Mercado", value: "México, fuera de la UE", prov: REAL_MARKET },
    { label: "Tu coste de producción", value: "30,00 € por caja", prov: SUPUESTO },
    { label: "Tu coste logístico por caja", value: "FCA 0,90 € · CIF 4,20 € · CIP 4,40 € · DAP 7,80 €", prov: ESTIMACION },
    { label: "Garantía ampliada (análisis y vida útil)", value: "0,60 € por caja", prov: SUPUESTO },
    { label: "Coste de financiar el cobro", value: "7 % anual sobre lo aplazado", prov: ESTIMACION },
    { label: "Tu margen objetivo", value: "18 % sobre ventas", prov: SUPUESTO },
    { label: "Plazo mínimo que puedes cumplir", value: "40 días hasta su almacén o puerto", prov: SUPUESTO },
    { label: "Requisitos de etiquetado e importación en México", value: "Pendientes de comprobar en una operación real", prov: VERIFICAR },
  ],
  seller: {
    unitCost: 30, logisticsPerUnit: { FCA: 0.9, CIF: 4.2, CIP: 4.4, DAP: 7.8 }, guaranteeCostPerUnit: 0.6, targetMarginPct: 18, capitalCostPct: 7,
    minDeliveryDays: 40, maxQuantity: 2000, unfeasibleIncoterms: {},
  },
  allowedIncoterms: ["FCA", "CIF", "CIP", "DAP"],
  allowedPayments: ["anticipado", "anticipo_30_70", "carta_credito", "cobro_documentario", "abierta_30", "abierta_60", "abierta_90", "abierta_90_seguro"],
  hidden: {
    targetPrice: 46, maxPrice: 53, buyerExtraPerUnit: { FCA: 6.8, CIF: 2.9, CIP: 2.7, DAP: 0.4 },
    minQty: 700, desiredQty: 1200, maxQty: 1600, maxDeliveryDays: 60,
    paymentUtility: { abierta_90: 1, abierta_90_seguro: 1, abierta_60: 0.8, abierta_30: 0.6, cobro_documentario: 0.45, anticipo_30_70: 0.3, carta_credito: 0.25, anticipado: 0 },
    incotermUtility: { CIP: 1, DAP: 1, CIF: 0.9, FCA: 0.4 },
    requiredGuarantee: "ampliada", exclusivity: { wants: true, extraQty: 300 },
    weights: { price: 0.35, payment: 0.25, delivery: 0.1, quantity: 0.1, guarantee: 0.1, incoterm: 0.1 },
    acceptAt: 0.8, rejectBelow: 0.4, maxRounds: 5,
  },
  prep: [
    { kind: "walkaway", id: "walkaway", title: "Tu punto de retirada", prompt: "Calcula el precio mínimo por caja que aceptarías en CIP Veracruz, con cuenta abierta a 90 días con seguro de crédito y garantía ampliada. Por debajo, la operación da pérdidas.", basis: { incoterm: "CIP", payment: "abierta_90_seguro", guarantee: "ampliada" } },
    { kind: "options", id: "apertura", title: "Oferta de apertura", prompt: "¿Cómo planteas tu primera oferta de precio?", best: "ambiciosa",
      why: "Abrir algo por encima del objetivo, con argumentos, deja espacio para conceder sin perder margen.",
      options: [
        { id: "ambiciosa", label: "Algo por encima de mi precio objetivo, justificada por calidad y garantías", grade: "correcta", feedback: "Te deja margen para conceder y la justificas con valor para el comprador." },
        { id: "minimo", label: "Directamente en mi precio mínimo, para cerrar rápido", grade: "grave", feedback: "Si abres en tu límite no puedes conceder nada: cualquier rebaja te da pérdidas." },
        { id: "muy_alta", label: "Muy por encima, el doble de mi objetivo", grade: "razonable", feedback: "Deja mucho margen, pero una cifra sin justificación resta credibilidad y puede romper la negociación." },
      ] },
    { kind: "options", id: "aplazamiento", title: "El aplazamiento de 90 días", prompt: "El comprador insiste en pagar a 90 días, lo habitual en su canal. ¿Cómo lo afrontas?", best: "seguro",
      why: "Dar lo que el comprador valora mucho, cubriendo tu riesgo a un coste moderado, es una concesión inteligente.",
      options: [
        { id: "seguro", label: "Aceptar 90 días con seguro de crédito y repercutir parte del coste en el precio", grade: "correcta", feedback: "Le das lo que más valora y cubres el riesgo; el coste del seguro y la financiación entran en tu precio." },
        { id: "sin_mas", label: "Aceptar 90 días sin más para ganar el pedido", grade: "razonable", feedback: "Cierras antes, pero financias y arriesgas tú todo el importe con un cliente nuevo." },
        { id: "anticipado", label: "Exigir pago anticipado: es un cliente nuevo", grade: "grave", feedback: "Es seguro para ti, pero el comprador no lo acepta en su canal: bloquea la negociación." },
      ] },
    { kind: "options", id: "contrapartida", title: "Si te pide rebaja", prompt: "Si el comprador te pide bajar el precio, ¿qué haces?", best: "intercambio",
      why: "En negociación, cada concesión debería obtener algo a cambio.",
      options: [
        { id: "intercambio", label: "Bajar solo a cambio de algo: más cantidad, compromiso de pedidos o mejores condiciones", grade: "correcta", feedback: "Así cada concesión mejora el acuerdo para las dos partes." },
        { id: "conceder", label: "Bajar el precio para mostrar buena voluntad", grade: "grave", feedback: "Una rebaja gratuita enseña al comprador que basta con pedir para conseguir más." },
        { id: "nunca", label: "No mover nunca el precio", grade: "razonable", feedback: "Protege el margen, pero sin flexibilidad puedes perder un acuerdo bueno." },
      ] },
  ],
  reference: {
    label: "Estrategia de referencia: apertura justificada e intercambios",
    explanation: "Abre en CIP con 90 días asegurados y garantía ampliada; en la segunda oferta baja algo el precio a cambio de exclusividad con más volumen.",
    offers: [
      { unitPrice: 47.5, quantity: 1200, incoterm: "CIP", deliveryDays: 50, payment: "abierta_90_seguro", exclusivity: false, guarantee: "ampliada" },
      { unitPrice: 46, quantity: 1500, incoterm: "CIP", deliveryDays: 50, payment: "abierta_90_seguro", exclusivity: true, guarantee: "ampliada" },
    ],
  },
};
