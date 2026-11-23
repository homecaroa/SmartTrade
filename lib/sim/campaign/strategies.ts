import { apply, capacityKm, nextLevel, newCampaign, rescueAvailable, transportKm } from "./engine";
import type { Action, CampaignState, Decision } from "./model";

/**
 * Estrategias automáticas de la campaña (23/11/2026). Sirven para comprobar el diseño: cada nivel tiene que poder
 * superarse con al menos dos estrategias distintas (★★) y la mala tiene que fallar. Se juegan nivel a nivel sobre la
 * misma empresa, como el jugador.
 */
export const L1_STRATEGIES = ["premium", "equilibrio", "volumen", "mala"] as const;
export const L2_STRATEGIES = ["urbana", "poligono", "compartida", "mala"] as const;
export const L3_STRATEGIES = ["poliza", "cobrar-antes", "austeridad", "mala"] as const;
export const L4_STRATEGIES = ["experta", "junior", "flexible", "mala"] as const;
export const L5_STRATEGIES = ["equilibrado", "cruzado", "alternativa", "mala"] as const;
export const L6_STRATEGIES = ["prevencion", "selectiva", "seguro", "mala"] as const;
export type Plan = [(typeof L1_STRATEGIES)[number], (typeof L2_STRATEGIES)[number]?, (typeof L3_STRATEGIES)[number]?, (typeof L4_STRATEGIES)[number]?, (typeof L5_STRATEGIES)[number]?, (typeof L6_STRATEGIES)[number]?];

const fits = (s: CampaignState, d: Decision) => transportKm(s.company, s.abs) + Number(s.data.spotKm ?? 0) + Number(d.data?.km ?? 0) <= capacityKm(s.company);

function choose(s: CampaignState, d: Decision, plan: Plan): string {
  const bad = plan[s.level] === "mala";
  if (d.id.startsWith("urgente-") || d.id.startsWith("cliente-")) return bad || fits(s, d) ? "aceptar" : "rechazar";
  const p = plan[s.level];
  if (s.level === 0) {
    const tiers: Record<string, [string, string, string]> = { premium: ["premium", "premium", "premium"], equilibrio: ["premium", "estandar", "estandar"], volumen: ["premium", "economica", "no"], mala: ["economica", "economica", "economica"] };
    if (d.id === "tarifa-flor") return tiers[p!][0];
    if (d.id === "tarifa-fresh") return tiers[p!][1];
    if (d.id === "tarifa-imprenta") return tiers[p!][2];
    if (d.id === "rebaja-fresh") return p === "premium" ? "mantener" : p === "mala" ? "aceptar" : "contraoferta";
  }
  if (s.level === 1) {
    if (d.id === "nave") return p === "mala" ? "poligono" : p!;
    if (d.id === "pago-obra") return p === "urbana" ? "contado" : p === "mala" ? "contado" : "plazos";
    if (d.id === "tramites") return bad ? "yo" : "gestor";
    if (d.id === "retraso") return p === "poligono" ? "urgencia" : "esperar";
    if (d.id === "transporte-bazar") return Number(d.data?.free) >= 250 ? "propio" : bad ? "propio" : "sub";
    if (d.id === "muebles") return "aceptar";
    if (d.id === "espacio") return bad ? "aceptar" : "renegociar";
  }
  if (s.level === 2) {
    const t: Record<string, Record<string, string>> = {
      poliza: { subarriendo: "no", poliza: "si", "plazo-bazar": "60", mora: "reclamar", averia: "pactar", "pronto-pago": "no", factoring: "no" },
      "cobrar-antes": { subarriendo: "si", poliza: "no", "plazo-bazar": "no", mora: "reclamar", averia: "pactar", "pronto-pago": "si", factoring: "si" },
      austeridad: { subarriendo: "si", poliza: "no", "plazo-bazar": "no", mora: "reclamar", averia: "pactar", "pronto-pago": "no", factoring: "no" },
      mala: { subarriendo: "no", poliza: "no", "plazo-bazar": "90", mora: "esperar", averia: "retrasar", "pronto-pago": "si", factoring: "si" },
    };
    if (t[p!]?.[d.id]) return t[p!][d.id];
  }
  if (s.level === 3) {
    const t: Record<string, Record<string, string>> = {
      experta: { conductor: "marta", subida: "mitad", pico: "extra" },
      junior: { conductor: "javi-indefinido", prueba: "formar", pico: "temporal" },
      flexible: { conductor: "javi-temporal", prueba: "seguir", pico: "extra" },
      mala: { conductor: "nadie", pico: "no" },
    };
    if (t[p!]?.[d.id]) return t[p!][d.id];
    if (d.id === "pico") return "sub";
  }
  if (s.level === 4) {
    const t: Record<string, Record<string, string>> = {
      equilibrado: { apertura: "equilibrado", ronda2: "garantia", capacidad: "externo", recorte: "exigir" },
      cruzado: { apertura: "cruzado", ronda2: "garantia", capacidad: "externo", recorte: "exigir" },
      alternativa: { apertura: "alternativa" },
      mala: { apertura: "suya", capacidad: "nada", recorte: "aguantar" },
    };
    if (t[p!]?.[d.id]) return t[p!][d.id];
    if (d.id === "recorte") return d.options[0].id;
  }
  if (s.level === 5) {
    if (d.id.startsWith("prev-")) {
      const k = d.id.slice(5);
      const yes: Record<string, string[]> = { prevencion: ["formacion", "procedimiento", "revision", "seguro"], selectiva: ["formacion", "procedimiento"], seguro: ["seguro", "revision"], mala: [] };
      return yes[p!].includes(k) ? "si" : "no";
    }
    if (d.id.startsWith("incidencia-")) {
      const good: Record<string, string> = { espera: "reclamar", ausente: "avisar", estiba: "escrito", bultos: "anotar", dano: "recibo" };
      const badA: Record<string, string> = { espera: "irse", ausente: "puerta", estiba: "indicar", bultos: "firmar", dano: "ignorar" };
      return (bad ? badA : good)[String(d.data?.kind)];
    }
  }
  return d.options[0].id;
}

/** Juega los niveles del plan con la misma empresa. Devuelve el estado y las acciones de cada nivel. */
/** `rescue`: si al empezar un nivel hay poca caja, aceptar el socio (financiación con capital en vez de deuda). */
export function playCampaign(seed: number, plan: Plan, rescue = false): { state: CampaignState; levels: Action[][] } {
  let s = newCampaign(seed);
  const levels: Action[][] = [];
  for (let lv = 0; lv < plan.length && plan[lv]; lv++) {
    if (lv > 0) { if (s.status !== "fin_nivel" || !s.results.at(-1)?.passed) break; s = nextLevel(s); }
    const acts: Action[] = [];
    const run = (a: Action) => { acts.push(a); s = apply(s, a); };
    if (rescue && rescueAvailable(s)) run({ t: "rescate" });
    run({ t: "empezar" });
    for (let guard = 0; guard < 300 && s.status === "jugando"; guard++) {
      if (s.pending.length) { const d = s.pending[0]; run({ t: "decidir", id: d.id, opcion: choose(s, d, plan) }); }
      else run({ t: "cerrar" });
    }
    levels.push(acts);
  }
  return { state: s, levels };
}
