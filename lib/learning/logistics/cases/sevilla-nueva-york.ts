import { ESTIMACION, REAL_HS, REAL_MARKET, SUPUESTO, VERIFICAR } from "../../provenance";
import { R, type LogisticsCase } from "../types";
import { incidentByMode, leg, productName } from "./shared";

/**
 * CASO L3 (medio, transoceánico). Reales: código HS y que EE. UU. no es de la UE. Todo lo demás es SIMULADO, incluido
 * el arancel del 5 % (sin acuerdo comercial); los aranceles adicionales vigentes deben verificarse en una operación real.
 * Idea: con 18 m³ un contenedor de 20' compensa frente al grupaje (menos manipulaciones para botellas de vidrio).
 */
export const SEVILLA_NUEVA_YORK: LogisticsCase = {
  id: "sevilla-nueva-york", title: "Vino de Sevilla a Nueva York", difficulty: "media",
  summary: "900 cajas de vino para un importador de Nueva Jersey, sin urgencia. Hay que cruzar el Atlántico.",
  learningGoal: "Decidir entre contenedor completo (FCL) y grupaje (LCL), y elegir una regla adecuada para contenedores.",
  origin: "Sevilla", destination: "Nueva York (Nueva Jersey)", market: "US",
  cargo: { product: productName("220421"), hs6: "220421", goods: "fragil", units: 900, unit: "caja", pallets: 15, grossKg: 10_800, volumeM3: 18, valueEur: 34_000 },
  deadlineDays: 45, prepDays: 5,
  agreed: { unitPrice: 41, incoterm: "CIP", place: "terminal del puerto de Nueva York/Nueva Jersey", buyerRequest: "Quiere el precio con transporte y seguro pagados hasta el puerto de Nueva York; su transitario se ocupa del resto." },
  unitCost: 29.5,
  facts: [
    { label: "Producto", value: `${productName("220421")} (HS 220421), botellas de vidrio`, prov: REAL_HS },
    { label: "Destino", value: "Estados Unidos, fuera de la UE", prov: REAL_MARKET },
    { label: "Pedido", value: "900 cajas en 15 palés · 10.800 kg · 18 m³ · valor 34.000 €", prov: SUPUESTO },
    { label: "Plazo", value: "Mercancía lista en 5 días; entrega como máximo 45 días después", prov: SUPUESTO },
    { label: "Precio pactado", value: "41,00 € por caja, CIP puerto de Nueva York", prov: SUPUESTO },
    { label: "Coste de producto", value: "29,50 € por caja", prov: SUPUESTO },
    { label: "Arancel del caso", value: "5 % sobre el valor en aduana (simulado; no hay acuerdo comercial)", prov: ESTIMACION },
    { label: "Aranceles adicionales y requisitos del vino en EE. UU.", value: "Comprobar antes de una operación real", prov: VERIFICAR },
  ],
  routes: [
    { id: "fcl", modality: "maritimo_fcl", label: "Contenedor de 20' vía Algeciras (camión + buque + camión)", transshipments: [], waitDays: R(2, 5),
      legs: [leg("camion", "Sevilla", "puerto de Algeciras", [1, 1], "recogida", { kind: "camion_completo", km: 190 }),
        leg("barco", "Algeciras", "Nueva York/Nueva Jersey", [10, 14], "principal", { kind: "fcl", per20: R(1500, 2300), per40: R(2100, 3200) }),
        leg("camion", "terminal de Nueva Jersey", "almacén del importador", [1, 2], "ultima_milla")],
      terminal: { kind: "por_contenedor", origin: R(200, 300), destination: R(200, 300) }, destinationCharges: R(120, 220), suitability: [] },
    { id: "lcl", modality: "maritimo_lcl", label: "Grupaje marítimo (consolidado en Algeciras)", transshipments: ["consolidación en Algeciras", "desconsolidación en Nueva York"], waitDays: R(4, 8),
      legs: [leg("camion", "Sevilla", "almacén de consolidación", [1, 1], "recogida"),
        leg("barco", "Algeciras", "Nueva York/Nueva Jersey", [12, 16], "principal", { kind: "lcl", perRevenueTon: R(85, 120) }),
        leg("camion", "almacén de desconsolidación", "almacén del importador", [1, 2], "ultima_milla")],
      terminal: { kind: "por_tonelada_volumen", origin: R(32, 50), destination: R(32, 50) }, destinationCharges: R(150, 260),
      suitability: [{ penalty: 20, note: "Botellas de vidrio en grupaje: consolidar y desconsolidar añade manipulaciones y riesgo de roturas." }] },
    { id: "aereo", modality: "aereo", label: "Avión Sevilla–Nueva York con escala en Madrid", transshipments: ["Madrid-Barajas"], waitDays: R(1, 2),
      legs: [leg("camion", "Sevilla", "aeropuerto de Sevilla", [0, 1], "recogida"),
        leg("avion", "Sevilla", "Nueva York JFK (escala en Madrid)", [1, 2], "principal", { kind: "aereo", perChargeableKg: R(2.4, 3.6) }),
        leg("camion", "aeropuerto JFK", "almacén del importador", [1, 1], "ultima_milla")],
      terminal: { kind: "por_kg_tasable", origin: R(0.08, 0.14), destination: R(0.1, 0.16) }, destinationCharges: R(80, 150), suitability: [] },
  ],
  infeasible: [
    { modality: "carretera", reason: "No hay ruta terrestre: hay que cruzar el océano Atlántico." },
    { modality: "ferroviario", reason: "No hay ruta terrestre: hay que cruzar el océano Atlántico." },
  ],
  geographyNote: "El puerto de Sevilla no tiene servicio directo transatlántico en este caso: el contenedor va en camión a Algeciras, que sí lo tiene.",
  incoterms: { correct: ["CIP"], reasonable: ["CIF", "CPT", "FCA"], why: "Transporte y seguro pagados hasta el puerto de destino con contenedor: CIP. CIF también los cubre, pero con contenedor la ICC recomienda CIP." },
  decisiveReason: "aprovecha_capacidad",
  dutyPct: { preferential: 5, general: 5, originProof: "no aplica (sin acuerdo comercial)" }, importVatPct: null,
  incident: incidentByMode({ road: "retraso", sea: "retencion" }),
};
