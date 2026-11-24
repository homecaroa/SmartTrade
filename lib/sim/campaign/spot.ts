import { round2 } from "../../learning/money";
import { intIn, stream } from "../rng";
import { capacityKm, learn, transportKm, unlock, variablePerKm } from "./helpers";
import type { CampaignState, Decision } from "./model";
import { SPOT } from "./params";
import { has } from "./upgrades";
import { decideSpotV2, spotDecisionsV2 } from "./offers";

/**
 * Encargos urgentes de la semana (todos los niveles): de su propia secuencia, para que no cambien según lo que decidas.
 * Aceptar sin capacidad libre es fallar al cliente.
 */
export function spotDecisions(s: CampaignState): Decision[] {
  if (s.version >= 2) return spotDecisionsV2(s);
  const r = stream(s.seed, s.abs, "campana-urgentes");
  const x = r();
  let n = x < SPOT.count[0] ? 0 : x < SPOT.count[0] + SPOT.count[1] ? 1 : 2;
  if (has(s.company, "web")) n += r() < 0.6 ? 1 : 0;
  const free = capacityKm(s.company) - transportKm(s.company, s.abs);
  return Array.from({ length: n }, (_, i) => {
    const km = intIn(r, SPOT.km.min, SPOT.km.max, 10), rate = round2(SPOT.rate.min + r() * (SPOT.rate.max - SPOT.rate.min));
    const margin = round2(rate - variablePerKm(s.company));
    return { id: `urgente-${s.abs}-${i + 1}`, title: "Encargo urgente", key: false, data: { km, rate },
      prompt: `Un cliente nuevo necesita ${km} km esta semana a ${rate.toLocaleString("es-ES", { minimumFractionDigits: 2 })} €/km (${(km * rate).toLocaleString("es-ES", { maximumFractionDigits: 0 })} €). Te quedan unos ${Math.max(0, free).toLocaleString("es-ES")} km libres esta semana, antes de otros urgentes que aceptes.`,
      hint: `Cada km de este encargo aporta ${margin.toLocaleString("es-ES", { minimumFractionDigits: 2 })} € después del gasóleo y el mantenimiento. ¿Te cabe sin fallar a tus clientes fijos?`,
      options: [{ id: "aceptar", label: "Aceptarlo" }, { id: "rechazar", label: "Rechazarlo" }] };
  });
}

/** Corrección de un encargo urgente: depende de la capacidad libre que te quedaba al decidir. */
export function decideSpot(s: CampaignState, d: Decision, opcion: string) {
  if (s.version >= 2) { decideSpotV2(s, d, opcion); return; }
  const km = Number(d.data!.km), rate = Number(d.data!.rate);
  const used = transportKm(s.company, s.abs) + Number(s.data.spotKm ?? 0);
  const fits = used + km <= capacityKm(s.company);
  if (opcion === "aceptar") { s.data.spotKm = Number(s.data.spotKm ?? 0) + km; s.data.spotRev = round2(Number(s.data.spotRev ?? 0) + km * rate); }
  const grade = opcion === "aceptar" ? (fits ? "correcta" : "grave") : fits ? "razonable" : "correcta";
  const fb = opcion === "aceptar"
    ? fits ? `Bien: te cabía y aporta ${round2(km * (rate - variablePerKm(s.company))).toLocaleString("es-ES")} € de margen. La capacidad libre solo vale si la usas.` : "No te cabía: alguien se quedará sin servicio esta semana. Fallar baja tu reputación y cuesta una penalización."
    : fits ? `Te cabía: has dejado pasar ${round2(km * (rate - variablePerKm(s.company))).toLocaleString("es-ES")} € de margen (coste de oportunidad).` : "Bien visto: no te cabía y aceptarlo habría sido fallar a alguien.";
  learn(s, { id: d.id, what: d.title, answer: opcion === "aceptar" ? "Aceptado" : "Rechazado", grade, feedback: fb, competences: ["0622-RA2"], key: false });
  unlock(s, "capacidad");
}

