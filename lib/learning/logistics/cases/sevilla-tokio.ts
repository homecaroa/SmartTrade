import { ESTIMACION, REAL_HS, REAL_MARKET, SUPUESTO, VERIFICAR } from "../../provenance";
import { R, type LogisticsCase } from "../types";
import { incidentByMode, leg, productName } from "./shared";

/**
 * CASO L4 (avanzado). Reales: código HS y que Japón no es de la UE. Todo lo demás es SIMULADO, incluidos los tipos de
 * arancel (0 % con declaración de origen / 20 % general) e impuesto de importación (10 %).
 * Idea: la opción correcta es la MÁS CARA. El barco no llega a la fecha del lanzamiento y la mercancía es ligera para
 * su volumen, así que en avión se paga por peso volumétrico.
 */
export const SEVILLA_TOKIO: LogisticsCase = {
  id: "sevilla-tokio", title: "Calzado de Sevilla a Tokio", difficulty: "avanzada",
  summary: "1.200 pares para el lanzamiento de una colección en Tokio dentro de 15 días. Mercancía voluminosa y de valor alto.",
  learningGoal: "Aceptar una opción cara cuando es la única que cumple, y calcular el peso tasable en aéreo.",
  origin: "Sevilla", destination: "Tokio", market: "JP",
  cargo: { product: productName("640399"), hs6: "640399", goods: "general", units: 1200, unit: "par", pallets: 4, grossKg: 1100, volumeM3: 9, valueEur: 96_000 },
  deadlineDays: 15, prepDays: 2,
  agreed: { unitPrice: 86, incoterm: "CPT", place: "aeropuerto de Narita (Tokio)", buyerRequest: "Su transitario en Japón despacha la importación; quiere el transporte pagado hasta el aeropuerto de Narita." },
  unitCost: 62,
  facts: [
    { label: "Producto", value: `${productName("640399")} (HS 640399), en cajas individuales`, prov: REAL_HS },
    { label: "Destino", value: "Japón, fuera de la UE", prov: REAL_MARKET },
    { label: "Pedido", value: "1.200 pares en 4 palés · 1.100 kg · 9 m³ · valor 96.000 €", prov: SUPUESTO },
    { label: "Plazo", value: "Mercancía lista en 2 días; el lanzamiento en tienda es 15 días después", prov: SUPUESTO },
    { label: "Precio pactado", value: "86,00 € por par, CPT aeropuerto de Narita", prov: SUPUESTO },
    { label: "Coste de producto", value: "62,00 € por par", prov: SUPUESTO },
    { label: "Aranceles e impuestos del caso", value: "0 % con declaración de origen (20 % sin ella); impuesto de importación 10 %: simulados", prov: ESTIMACION },
    { label: "Requisitos del calzado en Japón", value: "Comprobar en Access2Markets antes de una operación real", prov: VERIFICAR },
  ],
  routes: [
    { id: "aereo", modality: "aereo", label: "Avión Sevilla–Tokio Narita con escala en Madrid", transshipments: ["Madrid-Barajas"], waitDays: R(1, 2),
      legs: [leg("camion", "Sevilla", "aeropuerto de Sevilla", [0, 1], "recogida"),
        leg("avion", "Sevilla", "Tokio Narita (escala en Madrid)", [2, 3], "principal", { kind: "aereo", perChargeableKg: R(3.4, 4.8) }),
        leg("camion", "aeropuerto de Narita", "almacén del comprador", [0, 1], "ultima_milla")],
      terminal: { kind: "por_kg_tasable", origin: R(0.1, 0.18), destination: R(0.1, 0.18) }, destinationCharges: R(70, 140), suitability: [] },
    { id: "lcl", modality: "maritimo_lcl", label: "Grupaje marítimo vía Algeciras (transbordo en Singapur)", transshipments: ["consolidación en Algeciras", "Singapur"], waitDays: R(4, 8),
      legs: [leg("camion", "Sevilla", "almacén de consolidación", [1, 1], "recogida"),
        leg("barco", "Algeciras", "Yokohama (transbordo en Singapur)", [38, 48], "principal", { kind: "lcl", perRevenueTon: R(90, 130) }),
        leg("camion", "puerto de Yokohama", "almacén del comprador (Tokio)", [1, 2], "ultima_milla")],
      terminal: { kind: "por_tonelada_volumen", origin: R(30, 48), destination: R(30, 48) }, destinationCharges: R(150, 260), suitability: [] },
    { id: "fcl", modality: "maritimo_fcl", label: "Contenedor de 20' vía Algeciras (transbordo en Singapur)", transshipments: ["Singapur"], waitDays: R(2, 5),
      transshipmentCost: R(60, 120),
      legs: [leg("camion", "Sevilla", "puerto de Algeciras", [1, 1], "recogida", { kind: "camion_completo", km: 190 }),
        leg("barco", "Algeciras", "Yokohama (transbordo en Singapur)", [35, 45], "principal", { kind: "fcl", per20: R(1700, 2600), per40: R(2400, 3600) }),
        leg("camion", "puerto de Yokohama", "almacén del comprador (Tokio)", [1, 2], "ultima_milla")],
      terminal: { kind: "por_contenedor", origin: R(200, 300), destination: R(220, 330) }, destinationCharges: R(120, 220),
      suitability: [{ penalty: 10, note: "9 m³ en un contenedor de 20 pies: va casi vacío." }] },
  ],
  infeasible: [
    { modality: "carretera", reason: "Japón es un archipiélago: no hay conexión terrestre." },
    { modality: "ferroviario", reason: "No hay conexión ferroviaria con Japón; cualquier corredor ferroviario Europa–Asia necesitaría además un tramo marítimo final, y no es viable para este envío." },
  ],
  geographyNote: "Sevilla no tiene vuelos directos a Japón: la carga aérea hace escala (aquí, en Madrid). Por mar, el contenedor va a Algeciras y transborda en un gran puerto asiático.",
  incoterms: { correct: ["CPT", "CIP"], reasonable: ["FCA", "DAP"], why: "Transporte pagado hasta el aeropuerto de destino y despacho a cargo del comprador: CPT (o CIP si además aseguras). CIF y CFR son solo marítimos." },
  decisiveReason: "plazo",
  dutyPct: { preferential: 0, general: 20, originProof: "declaración de origen del exportador (acuerdo UE–Japón)" }, importVatPct: 10,
  incident: incidentByMode({ road: "retraso", sea: "rollover" }),
};
