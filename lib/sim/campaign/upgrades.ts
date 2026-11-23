import type { Company } from "./model";

/**
 * Árbol de mejoras (23/11/2026). Se compran con dinero en la sede, entre niveles, y se desbloquean al superar niveles
 * (no con estrellas: las estrellas solo miden la gestión). Son inversiones: van al activo y se amortizan. Cada una dice
 * qué concepto enseña. Importes y efectos SIMULADOS. Ramas: flota, almacén, comercial y dirección; en esta primera
 * entrega, las que tienen efecto en los niveles 1-3.
 */
export interface Upgrade { id: string; branch: "flota" | "almacen" | "comercial" | "direccion"; name: string; cost: number; unlockAfter: number; effect: string; lesson: string; requires?: (c: Company) => string | null }

export const UPGRADES: Upgrade[] = [
  { id: "rutas", branch: "flota", name: "Programa de rutas", cost: 1_200, unlockAfter: 1, effect: "Un 8 % menos de gasto por km.", lesson: "Una inversión que baja el coste variable mejora el margen de CADA km: cuanto más trabajes, antes se recupera." },
  { id: "web", branch: "comercial", name: "Web y teléfono comercial", cost: 800, unlockAfter: 1, effect: "Hasta un encargo urgente más por semana.", lesson: "Captar clientes también es una inversión: solo compensa si tienes capacidad libre para atenderlos." },
  { id: "estanterias", branch: "almacen", name: "Estanterías de altura", cost: 2_000, unlockAfter: 2, effect: "100 palés más de capacidad en tu nave.", lesson: "Aprovechar la altura sale más barato que alquilar más metros: el coste fijo por palé baja.", requires: (c) => (c.facility ? null : "Necesitas una nave.") },
  { id: "cobros", branch: "direccion", name: "Programa de facturación y cobros", cost: 600, unlockAfter: 2, effect: "Los clientes que se retrasan pagan una semana antes.", lesson: "Controlar los vencimientos y reclamar a tiempo acorta el periodo medio de cobro: es caja que no tienes que pedir al banco." },
];

export const upgradeById = (id: string) => UPGRADES.find((u) => u.id === id);
export const has = (c: Company, id: string) => c.upgrades.includes(id);
