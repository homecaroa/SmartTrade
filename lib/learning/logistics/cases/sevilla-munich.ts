import { ESTIMACION, REAL_HS, REAL_MARKET, SUPUESTO } from "../../provenance";
import { R, type LogisticsCase } from "../types";
import { incidentByMode, leg, productName } from "./shared";

/**
 * CASO L1 (básico, UE). Reales: código HS y que Alemania es de la UE. TODO lo demás (empresas, precios, distancias,
 * tarifas y plazos) son «Estimaciones simuladas con fines educativos». Las rutas son didácticas: en una operación real
 * hay que confirmar servicios y salidas con transitarios.
 * Idea: con 18 palés y 10 días, el camión completo es lo lógico; el tren y el barco existen pero no compensan aquí.
 */
export const SEVILLA_MUNICH: LogisticsCase = {
  id: "sevilla-munich", title: "Aceitunas de Sevilla a Múnich", difficulty: "básica",
  summary: "18 palés de aceitunas en conserva para un mayorista de Múnich. Operación dentro de la UE: sin aduanas.",
  learningGoal: "Elegir el transporte adecuado dentro de Europa según volumen y plazo, y calcular el coste logístico y el margen.",
  origin: "Sevilla", destination: "Múnich", market: "DE",
  cargo: { product: productName("200570"), hs6: "200570", goods: "fragil", units: 1440, unit: "caja", pallets: 18, grossKg: 14_000, volumeM3: 30, valueEur: 42_000 },
  deadlineDays: 10, prepDays: 2,
  agreed: { unitPrice: 32, incoterm: "DAP", place: "almacén del comprador en Múnich", buyerRequest: "Quiere recibir la mercancía en su almacén de Múnich sin ocuparse del transporte." },
  unitCost: 24,
  facts: [
    { label: "Producto", value: `${productName("200570")} (HS 200570), en botes de cristal`, prov: REAL_HS },
    { label: "Destino", value: "Alemania, Estado miembro de la UE: sin aduanas ni aranceles", prov: REAL_MARKET },
    { label: "Pedido", value: "1.440 cajas en 18 palés · 14.000 kg · 30 m³ · valor 42.000 €", prov: SUPUESTO },
    { label: "Plazo", value: "Mercancía lista en 2 días; entrega como máximo 10 días después", prov: SUPUESTO },
    { label: "Precio pactado", value: "32,00 € por caja, DAP almacén del comprador (Múnich)", prov: SUPUESTO },
    { label: "Coste de producto", value: "24,00 € por caja", prov: SUPUESTO },
    { label: "Distancias y tarifas", value: "Sevilla–Múnich ≈ 2.350 km por carretera; tarifas en rangos", prov: ESTIMACION },
  ],
  routes: [
    { id: "camion", modality: "carretera", label: "Camión completo puerta a puerta", transshipments: [], waitDays: R(0, 1),
      legs: [leg("camion", "Sevilla", "Múnich", [4, 5], "principal", { kind: "camion_completo", km: 2350 })],
      terminal: { kind: "por_camion", origin: R(0, 0), destination: R(0, 0) }, destinationCharges: R(0, 0), suitability: [] },
    { id: "grupaje", modality: "carretera", label: "Grupaje por carretera (plataformas)", transshipments: ["plataforma de Madrid"], waitDays: R(0, 2),
      legs: [leg("camion", "Sevilla", "Múnich (vía plataformas)", [6, 9], "principal", { kind: "grupaje_carretera", ratePer100Kg: R(20, 28) })],
      terminal: { kind: "por_palet", origin: R(4, 7), destination: R(4, 7) }, destinationCharges: R(0, 0),
      suitability: [{ penalty: 15, note: "Más manipulaciones en las plataformas: más riesgo de roturas en botes de cristal." }] },
    { id: "tren", modality: "ferroviario", label: "Tren con camión en los extremos", transshipments: ["frontera franco-española (cambio de ancho de vía)"], waitDays: R(1, 3),
      transshipmentCost: R(180, 280),
      legs: [leg("camion", "Sevilla", "terminal ferroviaria de Madrid", [1, 1], "recogida", { kind: "camion_completo", km: 530 }),
        leg("tren", "Madrid", "frontera (ancho ibérico)", [2, 3], "principal", { kind: "tren", perContainer40: R(1900, 2600) }, "Incluye los dos tramos ferroviarios."),
        leg("tren", "frontera (ancho internacional)", "terminal de Múnich", [3, 4], "principal"),
        leg("camion", "terminal de Múnich", "almacén del comprador", [1, 1], "ultima_milla")],
      terminal: { kind: "por_contenedor", origin: R(120, 200), destination: R(120, 200) }, destinationCharges: R(0, 0),
      suitability: [{ penalty: 10, note: "El cambio de ancho de vía obliga a transbordar la carga: una manipulación más." }] },
    { id: "fcl", modality: "maritimo_fcl", label: "Contenedor por mar Sevilla–Róterdam y camión", transshipments: [], waitDays: R(2, 5),
      legs: [leg("camion", "Sevilla", "puerto de Sevilla", [1, 1], "recogida"),
        leg("barco", "puerto de Sevilla", "Róterdam", [5, 7], "principal", { kind: "fcl", per20: R(700, 1100), per40: R(950, 1400) }),
        leg("camion", "Róterdam", "almacén del comprador (Múnich)", [2, 2], "ultima_milla", { kind: "camion_completo", km: 830 })],
      terminal: { kind: "por_contenedor", origin: R(180, 260), destination: R(180, 260) }, destinationCharges: R(80, 160), suitability: [] },
    { id: "lcl", modality: "maritimo_lcl", label: "Grupaje marítimo vía Róterdam", transshipments: ["consolidación en Sevilla", "desconsolidación en Róterdam"], waitDays: R(4, 7),
      legs: [leg("camion", "Sevilla", "almacén de consolidación", [1, 1], "recogida"),
        leg("barco", "puerto de Sevilla", "Róterdam", [5, 7], "principal", { kind: "lcl", perRevenueTon: R(55, 85) }),
        leg("camion", "Róterdam", "almacén del comprador (Múnich)", [2, 3], "ultima_milla")],
      terminal: { kind: "por_tonelada_volumen", origin: R(20, 35), destination: R(20, 35) }, destinationCharges: R(120, 220),
      suitability: [{ penalty: 25, note: "30 m³ en grupaje marítimo: con ese volumen se paga casi un contenedor y se manipula más." }] },
    { id: "aereo", modality: "aereo", label: "Avión Sevilla–Múnich con escala en Madrid", transshipments: ["Madrid-Barajas"], waitDays: R(1, 2),
      legs: [leg("camion", "Sevilla", "aeropuerto de Sevilla", [0, 1], "recogida"),
        leg("avion", "Sevilla", "Múnich (escala en Madrid)", [1, 2], "principal", { kind: "aereo", perChargeableKg: R(1.9, 2.8) }),
        leg("camion", "aeropuerto de Múnich", "almacén del comprador", [0, 1], "ultima_milla")],
      terminal: { kind: "por_kg_tasable", origin: R(0.08, 0.14), destination: R(0.08, 0.14) }, destinationCharges: R(60, 120),
      suitability: [{ penalty: 10, note: "14 toneladas en avión exigen carguero o varios vuelos." }] },
  ],
  infeasible: [],
  geographyNote: "Múnich no tiene puerto marítimo: las opciones por barco o avión necesitan tramos por carretera hasta el almacén del comprador.",
  incoterms: { correct: ["DAP"], reasonable: ["DPU", "CPT", "CIP", "FCA"], why: "El comprador quiere recibir en su almacén sin ocuparse del transporte: DAP. Dentro de la UE no hay despacho de importación." },
  decisiveReason: "barata_que_cumple",
  dutyPct: null, importVatPct: null,
  incident: incidentByMode({ road: "dano", sea: "rollover" }),
};
