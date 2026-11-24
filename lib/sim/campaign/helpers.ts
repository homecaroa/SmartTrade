import { round2, sum } from "../../learning/money";
import type { CampaignState, Company, LearningRec, Loan, Person } from "./model";
import { LABOR, START, VAN_VARIABLE, WEEKS_PER_MONTH } from "./params";
import { has } from "./upgrades";

/** Utilidades del motor de campaña que usan también los niveles (sin dependencias circulares). */

/** Pagar algo ahora que es una inversión (activo que se amortiza en `weeks` semanas). */
export function invest(s: CampaignState, amount: number, weeks: number) { s.company.cash = round2(s.company.cash - amount); s.company.assets = round2(s.company.assets + amount); s.company.assetsWeekly = round2(s.company.assetsWeekly + amount / weeks); }
/** Activo que entra sin pagar ahora (leasing: lo financia la deuda); se amortiza en `weeks` semanas. */
export function capitalize(s: CampaignState, amount: number, weeks: number) { s.company.assets = round2(s.company.assets + amount); s.company.assetsWeekly = round2(s.company.assetsWeekly + amount / weeks); }
/** Cuota constante (sistema francés) de un préstamo a `months` meses al tipo anual `annualRate`. */
export const annuity = (principal: number, annualRate: number, months: number) => { const r = annualRate / 12; return round2(r === 0 ? principal / months : principal * r / (1 - (1 + r) ** -months)); };
/**
 * Endeudarse. Préstamo: entra el dinero en la caja. Leasing: entra el vehículo en el activo (se capitaliza aparte) y la
 * deuda por el mismo importe (PGC, norma 8.ª, 1.2). La primera cuota, a las 4 semanas.
 */
export function borrow(s: CampaignState, l: Omit<Loan, "monthly" | "nextAbs" | "principal" | "monthsLeft"> & { amount: number; months: number }) {
  const { amount, months, ...rest } = l;
  if (rest.kind === "prestamo") s.company.cash = round2(s.company.cash + amount);
  (s.company.loans ??= []).push({ ...rest, principal: round2(amount), monthsLeft: months, monthly: annuity(amount, rest.annualRate, months), nextAbs: s.abs + WEEKS_PER_MONTH });
}
export const debtOutstanding = (c: Company) => round2(sum((c.loans ?? []).map((l) => l.principal)));
/** Gasto o ingreso de la semana (positivo = gasto). `cash: false` si no sale de la caja ahora (queda como deuda). */
export function charge(s: CampaignState, label: string, amount: number, cash = true) { s.charges.push({ label, amount: round2(amount), cash }); }
export const learn = (s: CampaignState, r: Omit<LearningRec, "week" | "level">) => { s.learning.push({ ...r, week: s.week, level: s.level }); };
export const unlock = (s: CampaignState, ...ids: string[]) => { for (const id of ids) if (!s.manual.includes(id)) s.manual.push(id); };
export const remember = (s: CampaignState, flag: string) => { if (!s.company.memory.includes(flag)) s.company.memory.push(flag); };
export const relate = (s: CampaignState, client: string, delta: number) => { s.company.relation[client] = Math.max(0, Math.min(100, (s.company.relation[client] ?? 50) + delta)); };
export const capacityKm = (c: Company) => sum(c.vehicles.map((v) => v.kmWeek)) + sum(activeStaff(c).map((p) => p.kmBonus ?? 0));
export const variablePerKm = (c: Company) => round2(VAN_VARIABLE * (has(c, "rutas") ? 0.92 : 1));
export const palletCapacity = (c: Company, abs: number) => (c.facility && abs >= c.facility.readyAbs ? c.facility.pallets + (has(c, "estanterias") ? 100 : 0) : 0);
export const activeDeals = (c: Company, abs: number) => c.deals.filter((d) => !d.ended && d.fromAbs <= abs && (d.toAbs === undefined || abs <= d.toAbs));
export const transportKm = (c: Company, abs: number) => sum(activeDeals(c, abs).filter((d) => d.kind === "transporte" && !d.sub).map((d) => d.km!)) + (c.facility && abs >= c.facility.readyAbs ? c.facility.kmExtra : 0);
export const weeklyFixed = (c: Company, abs: number) => round2((sum(c.vehicles.map((v) => v.monthly)) + START.insuranceMonthly + START.ownerMonthly + (c.facility?.rentMonthly ?? 0)) / WEEKS_PER_MONTH + (c.facility && abs >= c.facility.readyAbs ? Math.max(0, c.facility.opsWeek - sum(activeStaff(c).map((p) => p.opsSaving ?? 0))) : 0));

/** Plantilla activa (sin los que se han ido). */
export const activeStaff = (c: Company) => (c.staff ?? []).filter((p) => !p.left);
/** Coste para la empresa de una persona a la semana: sueldo bruto más cotizaciones (LABOR). Un mes de juego = 4 semanas. */
export const personWeekly = (p: Person) => round2(p.salaryMonthly * (1 + LABOR.employerRate[p.contract] + LABOR.accidentRate) / WEEKS_PER_MONTH);
export const staffWeekly = (c: Company) => round2(sum(activeStaff(c).map(personWeekly)));


/** Nombres de los clientes (los registra cada nivel). */
const NAMES: Record<string, string> = {};
export const registerClients = (xs: Record<string, string>) => Object.assign(NAMES, xs);
export const clientName = (id: string) => NAMES[id] ?? (id === "urgentes" ? "los encargos urgentes" : id);

