import { apply, capacityKm, nextLevel, newCampaign, rescueAvailable, transportKm } from "./engine";
import type { Action, CampaignState, Decision } from "./model";
import { QUIZ } from "./quiz";
import { OFFERS, storeRoom } from "./offers";

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
export const L7_STRATEGIES = ["servicio", "contratos", "guerra", "mala"] as const;
export const L8_STRATEGIES = ["renting", "leasing", "camion", "mala"] as const;
export const L9_STRATEGIES = ["fijo", "variable", "socio", "mala"] as const;
export type Plan = [(typeof L1_STRATEGIES)[number], (typeof L2_STRATEGIES)[number]?, (typeof L3_STRATEGIES)[number]?, (typeof L4_STRATEGIES)[number]?, (typeof L5_STRATEGIES)[number]?, (typeof L6_STRATEGIES)[number]?, (typeof L7_STRATEGIES)[number]?, (typeof L8_STRATEGIES)[number]?, (typeof L9_STRATEGIES)[number]?];

const fits = (s: CampaignState, d: Decision) => transportKm(s.company, s.abs) + Number(s.data.spotKm ?? 0) + Number(d.data?.km ?? 0) <= capacityKm(s.company);

/** Reglas 2: la estrategia buena acepta lo que cabe, subcontrata lo que deja margen y hace bien los trámites; la mala, al revés. */
function offerChoice(s: CampaignState, d: Decision, bad: boolean): string {
  const good: Record<string, string> = { lleno: "sub", documentos: "doc", estiba: "ellos", valor: "declarar", pago90: "30", combustible: "aviso" };
  const wrong: Record<string, string> = { lleno: "rechazar", documentos: "sin", estiba: "indicar", valor: "normal", pago90: "90", combustible: "renuncia" };
  const mode = String(d.data?.mode ?? "normal");
  if (mode === "normal") return bad || fits(s, d) ? "aceptar" : "rechazar";
  // Una carta con caso que ya no cabe (otra decisión de la semana ocupó el sitio): la buena la rechaza.
  if (!bad && mode !== "lleno" && !fits(s, d)) return "rechazar";
  return (bad ? wrong : good)[mode];
}

function choose(s: CampaignState, d: Decision, plan: Plan): string {
  const bad = plan[s.level] === "mala";
  if (d.id.startsWith("urgente-") || d.id.startsWith("cliente-")) return s.version >= 2 ? offerChoice(s, d, bad) : bad || fits(s, d) ? "aceptar" : "rechazar";
  if (d.id.startsWith("almacen-")) return bad ? "sin" : storeRoom(s) >= OFFERS.store.pallets ? "albaran" : "rechazar";
  if (d.id.startsWith("pregunta-")) { const q = QUIZ.find((x) => x.id === d.data?.q)!; return q.options.find((o) => o.grade === (bad ? "grave" : "correcta"))!.id; }
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
  if (s.level === 6) {
    const t: Record<string, Record<string, string>> = {
      servicio: { respuesta: "servicio", ataque: "valor", recuperar: "si" },
      contratos: { respuesta: "contratos", ataque: "igualar", recuperar: "si" },
      guerra: { respuesta: "guerra", ataque: "igualar", guerra2: "parar", recuperar: "si" },
      mala: { respuesta: "pacto", ataque: "dejar", recuperar: "no" },
    };
    if (t[p!]?.[d.id]) return t[p!][d.id];
  }
  if (s.level === 7) {
    const t: Record<string, Record<string, string>> = {
      renting: { vehiculo: "furgoneta", financiacion: "renting" },
      leasing: { vehiculo: "furgoneta", financiacion: "leasing" },
      camion: { vehiculo: "rigido", financiacion: "leasing" },
      mala: { vehiculo: "rigido", financiacion: "contado", tercero: "rechazar" },
    };
    if (t[p!]?.[d.id]) return t[p!][d.id];
    if (d.id === "tercero") return Number(d.data?.free) >= 800 ? "aceptar" : "rechazar";
  }
  if (s.level === 8) {
    const t: Record<string, Record<string, string>> = {
      fijo: { forma: "sl-3000", financiar: "fijo", aval: "sin-aval", cuota: "pagar" },
      variable: { forma: "sl-3000", financiar: "variable", aval: "firmar", cuota: "carencia" },
      socio: { forma: "sl-3000", financiar: "socio", cuota: "pagar" },
      mala: { forma: "autonomo", financiar: "variable", cuota: "impagar" },
    };
    if (t[p!]?.[d.id]) return t[p!][d.id];
  }
  return d.options[0].id;
}

/** Juega los niveles del plan con la misma empresa. Devuelve el estado y las acciones de cada nivel. */
/** `rescue`: si al empezar un nivel hay poca caja, aceptar el socio (financiación con capital en vez de deuda). */
export function playCampaign(seed: number, plan: Plan, rescue = false, version?: number): { state: CampaignState; levels: Action[][] } {
  let s = newCampaign(seed, version);
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
