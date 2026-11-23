import { activeDeals, activeStaff } from "./helpers";
import type { CampaignState } from "./model";

/**
 * Logros de la campaña (23/11/2026): hitos de la empresa que se celebran al conseguirlos. Se calculan a partir del
 * estado (no se guardan), así que no cambian las partidas guardadas. Miden la empresa, no el aprendizaje.
 */
export interface Achievement { id: string; title: string; text: string; icon: string; done: (s: CampaignState) => boolean }

const won = (s: CampaignState, n: number) => s.results.some((r) => r.passed && r.stars.filter(Boolean).length >= n);
export const ACHIEVEMENTS: Achievement[] = [
  { id: "cliente-fijo", icon: "€", title: "Primer cliente fijo", text: "Has firmado tu primer contrato recurrente.", done: (s) => s.company.deals.length > 0 },
  { id: "urgente", icon: "⚡", title: "A toda prisa", text: "Has hecho tu primer encargo urgente.", done: (s) => s.learning.some((l) => l.id.startsWith("urgente-") && l.answer === "Aceptado") },
  { id: "mision", icon: "★", title: "Misión cumplida", text: "Has superado tu primer nivel.", done: (s) => s.results.some((r) => r.passed) },
  { id: "tres-estrellas", icon: "✦", title: "Tres estrellas", text: "Has superado un nivel con las tres estrellas.", done: (s) => won(s, 3) },
  { id: "nave", icon: "▣", title: "Tienes base", text: "Tu primera nave ya funciona.", done: (s) => !!s.company.facility && s.abs >= s.company.facility.readyAbs },
  { id: "equipo", icon: "☺", title: "Ya no estás solo", text: "Has contratado a tu primera persona.", done: (s) => activeStaff(s.company).length > 0 },
  { id: "cartera", icon: "▤", title: "Cartera sólida", text: "Cinco clientes fijos trabajando contigo a la vez.", done: (s) => new Set(activeDeals(s.company, s.abs).map((d) => d.client)).size >= 5 },
  { id: "beneficio", icon: "↑", title: "Números negros", text: "Tu empresa acumula 5.000 € de beneficio.", done: (s) => s.company.result >= 5_000 },
  { id: "manual", icon: "§", title: "Buen estudiante", text: "Diez conceptos en tu Manual.", done: (s) => s.manual.length >= 10 },
  { id: "acuerdo", icon: "✍", title: "Gran cuenta", text: "Has firmado un acuerdo marco con una cadena.", done: (s) => s.data.signed === "hiper" || s.company.deals.some((d) => d.client === "hiper") },
];

export const achieved = (s: CampaignState) => ACHIEVEMENTS.filter((a) => a.done(s)).map((a) => a.id);
