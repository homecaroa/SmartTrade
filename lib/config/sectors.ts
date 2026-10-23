/**
 * Sectores para descubrir oportunidades sin conocer códigos HS. Cada sector agrupa códigos del catálogo
 * (`hs-catalog.ts`). Para añadir un sector: nuevo objeto aquí con códigos que existan en el catálogo.
 * La puntuación se calcula comparando solo los productos del sector elegido.
 */
export interface Sector { id: string; name: string; description: string; codes: string[] }

export const SECTORS: Sector[] = [
  { id: "alimentacion", name: "Alimentación", description: "Aceite, frutas, hortalizas, conservas, cárnicos, lácteos, dulces y café.",
    codes: ["150920", "150930", "200570", "160414", "020329", "021011", "040690", "190531", "180690", "090121", "100630", "080510", "080520", "080930", "081010", "070200", "070960"] },
  { id: "bebidas", name: "Vinos y bebidas", description: "Vino, espumosos, cerveza y destilados.", codes: ["220421", "220429", "220410", "220300", "220830"] },
  { id: "salud-quimica", name: "Salud, química y cosmética", description: "Medicamentos, perfumería, plásticos, fertilizantes y neumáticos.", codes: ["300490", "330499", "330300", "392690", "310210", "401110"] },
  { id: "automocion", name: "Automoción", description: "Turismos, vehículos eléctricos y componentes.", codes: ["870323", "870324", "870380", "870829", "870899"] },
  { id: "tecnologia-energia", name: "Tecnología, energía y equipos", description: "Informática, móviles, baterías, solar y material eléctrico.", codes: ["847130", "851713", "850760", "854143", "841810", "853710"] },
  { id: "construccion-metales", name: "Construcción y metales", description: "Cerámica, estructuras de acero y aluminio.", codes: ["690721", "690722", "730890", "760110"] },
  { id: "hogar-moda", name: "Hogar, moda y calzado", description: "Muebles, calzado y ropa de algodón.", codes: ["940360", "940161", "640399", "610910", "620342", "620462"] },
];

export const sectorById = (id: string) => SECTORS.find((s) => s.id === id);

/** Devuelve el sector si la consulta es exactamente `sector:<id>`. */
export function sectorFromQuery(q?: string): Sector | undefined {
  const m = /^\s*sector:([a-z0-9-]+)\s*$/.exec(q ?? "");
  return m ? sectorById(m[1]) : undefined;
}
