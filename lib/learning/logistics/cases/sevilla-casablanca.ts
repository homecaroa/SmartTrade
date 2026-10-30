import { ESTIMACION, REAL_HS, REAL_MARKET, SUPUESTO, VERIFICAR } from "../../provenance";
import { R, type LogisticsCase } from "../types";
import { incidentByMode, leg, productName } from "./shared";

/**
 * CASO L2 (medio, fuera de la UE). Reales: código HS y que Marruecos no es de la UE. Todo lo demás es SIMULADO,
 * incluidos los tipos de arancel (0 % con prueba de origen / 10 % general) e impuesto de importación (20 %).
 * Idea: el plazo manda (piezas para una línea de montaje). El grupaje es más barato pero puede no llegar.
 */
export const SEVILLA_CASABLANCA: LogisticsCase = {
  id: "sevilla-casablanca", title: "Recambios de Sevilla a Casablanca", difficulty: "media",
  summary: "6 palés de recambios para una planta de montaje en Casablanca que los necesita en 7 días.",
  learningGoal: "Cruzar el Estrecho: comparar camión con ferry, grupaje, barco y avión cuando el plazo es crítico, con aduanas.",
  origin: "Sevilla", destination: "Casablanca", market: "MA",
  cargo: { product: productName("870899"), hs6: "870899", goods: "general", units: 600, unit: "pieza", pallets: 6, grossKg: 3200, volumeM3: 9, valueEur: 85_000 },
  deadlineDays: 7, prepDays: 1,
  agreed: { unitPrice: 155, incoterm: "DAP", place: "planta del comprador en Casablanca", buyerRequest: "Quiere recibir en su planta; su agente de aduanas despacha la importación." },
  unitCost: 118,
  facts: [
    { label: "Producto", value: `${productName("870899")} (HS 870899)`, prov: REAL_HS },
    { label: "Destino", value: "Marruecos, fuera de la UE: despacho de exportación e importación", prov: REAL_MARKET },
    { label: "Pedido", value: "600 piezas en 6 palés · 3.200 kg · 9 m³ · valor 85.000 €", prov: SUPUESTO },
    { label: "Plazo", value: "Mercancía lista en 1 día; la línea de montaje la necesita en 7 días como máximo", prov: SUPUESTO },
    { label: "Precio pactado", value: "155 € por pieza, DAP planta del comprador (Casablanca)", prov: SUPUESTO },
    { label: "Coste de producto", value: "118 € por pieza", prov: SUPUESTO },
    { label: "Aranceles e impuestos del caso", value: "0 % con prueba de origen (10 % sin ella); impuesto de importación 20 %: tipos simulados", prov: ESTIMACION },
    { label: "Acuerdo UE–Marruecos y prueba de origen", value: "Comprobar en Access2Markets antes de una operación real", prov: VERIFICAR },
  ],
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
  incoterms: { correct: ["DAP"], reasonable: ["CPT", "CIP", "FCA", "DPU"], why: "Recibe en su planta y despacha él la importación: DAP. En DDP tendrías que importar tú en Marruecos." },
  decisiveReason: "plazo",
  dutyPct: { preferential: 0, general: 10, originProof: "prueba de origen preferencial (EUR.1 o la que exija el acuerdo)" }, importVatPct: 20,
  incident: incidentByMode({ road: "retraso", roadCause: "Un temporal de levante suspende el ferry del Estrecho.", sea: "retencion" }),
};
