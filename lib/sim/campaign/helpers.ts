import { round2, sum } from "../../learning/money";
import type { CampaignState, Company, LearningRec } from "./model";
import { START, VAN_VARIABLE, WEEKS_PER_MONTH } from "./params";
import { has } from "./upgrades";

/** Utilidades del motor de campaña que usan también los niveles (sin dependencias circulares). */

/** Pagar algo ahora que es una inversión (activo que se amortiza en `weeks` semanas). */
export function invest(s: CampaignState, amount: number, weeks: number) { s.company.cash = round2(s.company.cash - amount); s.company.assets = round2(s.company.assets + amount); s.company.assetsWeekly = round2(s.company.assetsWeekly + amount / weeks); }
/** Gasto o ingreso de la semana (positivo = gasto). `cash: false` si no sale de la caja ahora (queda como deuda). */
export function charge(s: CampaignState, label: string, amount: number, cash = true) { s.charges.push({ label, amount: round2(amount), cash }); }
export const learn = (s: CampaignState, r: Omit<LearningRec, "week" | "level">) => { s.learning.push({ ...r, week: s.week, level: s.level }); };
export const unlock = (s: CampaignState, ...ids: string[]) => { for (const id of ids) if (!s.manual.includes(id)) s.manual.push(id); };
export const remember = (s: CampaignState, flag: string) => { if (!s.company.memory.includes(flag)) s.company.memory.push(flag); };
export const relate = (s: CampaignState, client: string, delta: number) => { s.company.relation[client] = Math.max(0, Math.min(100, (s.company.relation[client] ?? 50) + delta)); };
export const capacityKm = (c: Company) => sum(c.vehicles.map((v) => v.kmWeek));
export const variablePerKm = (c: Company) => round2(VAN_VARIABLE * (has(c, "rutas") ? 0.92 : 1));
export const palletCapacity = (c: Company, abs: number) => (c.facility && abs >= c.facility.readyAbs ? c.facility.pallets + (has(c, "estanterias") ? 100 : 0) : 0);
export const activeDeals = (c: Company, abs: number) => c.deals.filter((d) => !d.ended && d.fromAbs <= abs && (d.toAbs === undefined || abs <= d.toAbs));
export const transportKm = (c: Company, abs: number) => sum(activeDeals(c, abs).filter((d) => d.kind === "transporte" && !d.sub).map((d) => d.km!)) + (c.facility && abs >= c.facility.readyAbs ? c.facility.kmExtra : 0);
export const weeklyFixed = (c: Company, abs: number) => round2((sum(c.vehicles.map((v) => v.monthly)) + START.insuranceMonthly + START.ownerMonthly + (c.facility?.rentMonthly ?? 0)) / WEEKS_PER_MONTH + (c.facility && abs >= c.facility.readyAbs ? c.facility.opsWeek : 0));


/** Nombres de los clientes (los registra cada nivel). */
const NAMES: Record<string, string> = {};
export const registerClients = (xs: Record<string, string>) => Object.assign(NAMES, xs);
export const clientName = (id: string) => NAMES[id] ?? (id === "urgentes" ? "los encargos urgentes" : id);

