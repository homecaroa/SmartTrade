import { ESTIMACION, REAL_HS, REAL_MARKET, SUPUESTO, VERIFICAR } from "../../provenance";
import { productName } from "../../export/scenarios/shared";
import type { NegotiationScenario } from "../types";

/**
 * CASO B2 (avanzado). Reales: el código HS y que Reino Unido no es de la UE. Todo lo demás es SIMULADO.
 * Idea didáctica: aquí el plazo y las garantías pesan tanto como el precio; prometer lo que no se puede cumplir o
 * aceptar un Incoterm inviable (DDP sin registro de IVA en destino) es peor que ceder unos céntimos.
 */
export const CALZADO_REINO_UNIDO: NegotiationScenario = {
  id: "calzado-reino-unido",
  title: "Calzado de piel para una cadena británica",
  difficulty: "avanzada",
  summary: "Un fabricante de calzado de Elche negocia con una cadena de tiendas británica que necesita la mercancía a tiempo para su campaña de otoño.",
  learningGoal: "Negociar cuando el comprador prioriza el plazo y las garantías: ofrecer solo lo que se puede cumplir y evitar condiciones inviables.",
  instructions: [
    "Revisa tus costes y lo que puedes cumplir antes de ofertar.",
    "El comprador no revela sus límites: interpreta sus respuestas.",
    "Una buena negociación no siempre es la de mayor precio.",
  ],
  hs6: "640399",
  market: "GB",
  unit: "par",
  unitDetail: "par de zapatos de piel",
  company: { name: "Calzados Ejemplo de Elche, S.L. (ficticia)", city: "Elche", description: "Fabricante de calzado de piel con capacidad para 3.200 pares por pedido y plazo mínimo de 30 días." },
  buyer: {
    name: "Example Footwear Retail Ltd (ficticia)", city: "Mánchester", type: "Cadena de 40 tiendas de calzado",
    description: "Compra colecciones de temporada a fabricantes europeos y exige cumplir estrictamente las ventanas de entrega.",
    needs: ["Recibir la colección a tiempo para el inicio de la campaña de otoño", "Calidad constante y sustitución de defectuosos", "Un precio que le permita su margen de tienda"],
    budget: "Compara con otros fabricantes europeos con precio puesto en su almacén.",
    volume: "Entre una y dos tallas por modelo para sus 40 tiendas", frequency: "Dos colecciones al año",
    requirements: ["Entrega como muy tarde en la fecha de campaña", "Sustitución de defectuosos durante 12 meses y documentación de conformidad (garantía ampliada)", "Prueba de origen para aplicar la preferencia arancelaria (pendiente de verificar)"],
    language: "Inglés (comunicación formal y por escrito)", context: ["Confirma todo por escrito", "Penaliza los retrasos", "Prefiere recibir la mercancía en su almacén"],
    paymentHabit: "Cuenta abierta a 60 días", risk: "bajo",
  },
  facts: [
    { label: "Producto", value: `${productName("640399")} (HS 640399)`, prov: REAL_HS },
    { label: "Mercado", value: "Reino Unido, fuera de la UE desde 2021", prov: REAL_MARKET },
    { label: "Tu coste de producción", value: "36,00 € por par", prov: SUPUESTO },
    { label: "Tu coste logístico por par", value: "FCA 0,50 € · CPT 1,90 € · DAP 2,30 € · DDP 2,30 € más trámites de importación", prov: ESTIMACION },
    { label: "Garantía ampliada", value: "0,90 € por par", prov: SUPUESTO },
    { label: "Coste de financiar el cobro", value: "7 % anual sobre lo aplazado", prov: ESTIMACION },
    { label: "Tu margen objetivo", value: "22 % sobre ventas", prov: SUPUESTO },
    { label: "Plazo mínimo que puedes cumplir", value: "30 días hasta su almacén", prov: SUPUESTO },
    { label: "Registro de IVA en Reino Unido", value: "Tu empresa no está registrada: no puede importar allí", prov: SUPUESTO },
    { label: "Aranceles y reglas de origen UE–Reino Unido", value: "Pendientes de comprobar en una operación real", prov: VERIFICAR },
  ],
  seller: {
    unitCost: 36, logisticsPerUnit: { FCA: 0.5, CPT: 1.9, DAP: 2.3, DDP: 2.3 }, guaranteeCostPerUnit: 0.9, targetMarginPct: 22, capitalCostPct: 7,
    minDeliveryDays: 30, maxQuantity: 3200,
    unfeasibleIncoterms: { DDP: "DDP te obliga a importar en Reino Unido y pagar allí aranceles e IVA, pero tu empresa no está registrada: no podrías cumplirlo." },
  },
  allowedIncoterms: ["FCA", "CPT", "DAP", "DDP"],
  allowedPayments: ["anticipado", "anticipo_30_70", "carta_credito", "cobro_documentario", "abierta_30", "abierta_60", "abierta_90", "abierta_90_seguro"],
  hidden: {
    targetPrice: 56, maxPrice: 63, buyerExtraPerUnit: { FCA: 3.6, CPT: 1.3, DAP: 1, DDP: 0.1 },
    minQty: 1800, desiredQty: 2400, maxQty: 3000, maxDeliveryDays: 40,
    paymentUtility: { abierta_60: 1, abierta_90: 1, abierta_90_seguro: 1, abierta_30: 0.85, cobro_documentario: 0.4, anticipo_30_70: 0.25, carta_credito: 0.15, anticipado: 0 },
    incotermUtility: { DAP: 1, DDP: 1, CPT: 0.8, FCA: 0.3 },
    requiredGuarantee: "ampliada", exclusivity: { wants: false, extraQty: 0 },
    weights: { price: 0.3, delivery: 0.25, guarantee: 0.15, payment: 0.1, quantity: 0.1, incoterm: 0.1 },
    acceptAt: 0.82, rejectBelow: 0.4, maxRounds: 5,
  },
  prep: [
    { kind: "walkaway", id: "walkaway", title: "Tu punto de retirada", prompt: "Calcula el precio mínimo por par que aceptarías en DAP Mánchester, con cuenta abierta a 60 días y garantía ampliada. Por debajo, la operación da pérdidas.", basis: { incoterm: "DAP", payment: "abierta_60", guarantee: "ampliada" } },
    { kind: "options", id: "plazo", title: "La fecha de campaña", prompt: "El comprador insiste en que necesita la mercancía a tiempo para su campaña. ¿Qué plazo te comprometes a ofrecer?", best: "realista",
      why: "Un compromiso de plazo debe poder cumplirse: un retraso en una cadena con campaña cuesta más que cualquier rebaja.",
      options: [
        { id: "realista", label: "Uno que pueda cumplir con holgura (≥ 30 días) y que encaje en su campaña", grade: "correcta", feedback: "Das seguridad al comprador y te proteges de penalizaciones." },
        { id: "agresivo", label: "Prometer 20 días para ganar el pedido y ya veremos", grade: "grave", feedback: "Tu empresa necesita al menos 30 días: prometer menos es comprometerte a incumplir." },
        { id: "holgado", label: "Pedir 60 días para ir tranquilo", grade: "razonable", feedback: "Es cómodo para ti, pero puede no llegar a la campaña: el comprador lo valorará mal." },
      ] },
    { kind: "options", id: "incoterm", title: "Entrega en su almacén", prompt: "El comprador prefiere recibir la mercancía en su almacén con todo resuelto (DDP). ¿Qué haces?", best: "dap",
      why: "Ofrecer DAP da al comprador casi todo lo que quiere sin obligarte a algo que no puedes hacer.",
      options: [
        { id: "dap", label: "Ofrecer DAP: entregas en su almacén y él despacha la importación", grade: "correcta", feedback: "Cubres lo que más le importa (recibir en su almacén) sin asumir una importación que no puedes realizar." },
        { id: "ddp", label: "Aceptar DDP para no perder la venta", grade: "grave", feedback: "Sin registro de IVA en Reino Unido no puedes importar allí: te comprometes a algo inviable." },
        { id: "fca", label: "Ofrecer FCA Elche y que él organice todo", grade: "razonable", feedback: "Reduces tus obligaciones, pero el comprador lo valora poco y tendrás que compensarlo con precio." },
      ] },
  ],
  reference: {
    label: "Estrategia de referencia: plazo fiable y DAP",
    explanation: "Abre en DAP con un plazo cumplible, 60 días de pago (lo habitual para él) y garantía ampliada; concede algo de precio a cambio de más cantidad.",
    offers: [
      { unitPrice: 57, quantity: 2400, incoterm: "DAP", deliveryDays: 35, payment: "abierta_60", exclusivity: false, guarantee: "ampliada" },
      { unitPrice: 55.5, quantity: 2700, incoterm: "DAP", deliveryDays: 35, payment: "abierta_60", exclusivity: false, guarantee: "ampliada" },
    ],
  },
};
