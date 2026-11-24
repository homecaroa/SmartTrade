import { round2 } from "../../learning/money";
import { intIn, stream } from "../rng";
import { capacityKm, learn, registerClients, transportKm, variablePerKm } from "./helpers";
import type { CampaignState, Decision } from "./model";
import { decideLeadV2, leadDecisionsV2 } from "./offers";

/**
 * Clientes nuevos (desde el nivel 4): con la reputación que has ganado, cada semana puede llamarte un cliente con un
 * contrato fijo de reparto. Solo compensa si tienes capacidad para atenderlo: es lo que justifica contratar. Empresas,
 * km y precios SIMULADOS.
 */
const NAMES = ["Ferretería Marítim (ficticia)", "Óptica Benimaclet (ficticia)", "Panadería Patraix (ficticia)", "Librería Ruzafa Sur (ficticia)", "Farmacia Campanar (ficticia)", "Recambios Moncada (ficticia)", "Cosmética Burjassot (ficticia)", "Papelería Torrent (ficticia)"];
export const LEAD = { chance: 0.55, km: { min: 200, max: 400 }, rate: { min: 0.95, max: 1.15 } };

export function leadDecisions(s: CampaignState): Decision[] {
  if (s.version >= 2) return leadDecisionsV2(s, NAMES);
  const r = stream(s.seed, s.abs, "campana-clientes");
  if (r() >= LEAD.chance * (s.company.reputation.fiabilidad >= 70 ? 1 : 0.5)) return [];
  const i = Math.floor(r() * NAMES.length), id = `nuevo-${s.abs}`;
  registerClients({ [id]: NAMES[i] });
  const km = intIn(r, LEAD.km.min, LEAD.km.max, 10), rate = round2(LEAD.rate.min + r() * (LEAD.rate.max - LEAD.rate.min));
  const free = capacityKm(s.company) - transportKm(s.company, s.abs);
  return [{ id: `cliente-${s.abs}`, title: "Un cliente nuevo quiere trabajar contigo", key: false, data: { km, rate, client: id },
    prompt: `${NAMES[i]} te propone un reparto fijo de ${km} km a la semana a ${rate.toLocaleString("es-ES", { minimumFractionDigits: 2 })} €/km (${Math.round(km * rate).toLocaleString("es-ES")} € a la semana), cobro a 30 días. Ahora te quedan unos ${Math.max(0, free).toLocaleString("es-ES")} km libres a la semana.`,
    hint: "Un cliente fijo bien pagado es lo que paga la plantilla. ¿Te cabe sin fallar a los que ya tienes?",
    options: [{ id: "aceptar", label: "Aceptarlo" }, { id: "rechazar", label: "Rechazarlo" }] }];
}

export function decideLead(s: CampaignState, d: Decision, op: string) {
  if (s.version >= 2) { decideLeadV2(s, d, op); return; }
  const km = Number(d.data!.km), rate = Number(d.data!.rate), client = String(d.data!.client);
  const free = capacityKm(s.company) - transportKm(s.company, s.abs);
  const fits = free >= km;
  if (op === "aceptar") s.company.deals.push({ id: `l-${client}`, client, kind: "transporte", km, rate, payWeeks: 4, fromAbs: s.abs, missed: 0 });
  const margin = round2(km * (rate - variablePerKm(s.company)));
  learn(s, { id: d.id, what: d.title, answer: op === "aceptar" ? "Aceptado" : "Rechazado", grade: op === "aceptar" ? (fits ? "correcta" : "grave") : fits ? "razonable" : "correcta", competences: ["0622-RA2"], key: false,
    feedback: op === "aceptar" ? (fits ? `Aporta ${margin.toLocaleString("es-ES")} € a la semana después del gasóleo: es lo que hace rentable tener más capacidad.` : `Solo te quedaban ${Math.max(0, free)} km libres: fallarás a alguien cada semana hasta que se vaya.`) : fits ? `Te cabía y aportaba ${margin.toLocaleString("es-ES")} € a la semana: capacidad que pagas y no usas.` : "Bien: no te cabía." });
}
