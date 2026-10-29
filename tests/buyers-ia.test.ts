import { afterEach, describe, expect, it, vi } from "vitest";
import { buyersToCsv } from "@/lib/buyers/csv";
import { extractSignals } from "@/lib/buyers/extract";
import { auditCandidates, nameMatchesPage, nameTokens, normalizeWeb } from "@/lib/buyers/ia/audit";
import { callGemini, extractModelText, GeminiError, parseJsonText } from "@/lib/buyers/ia/gemini";
import { generatePistas } from "@/lib/buyers/ia/generate";
import { buildPrompt, candidateListSchema, RESPONSE_JSON_SCHEMA, type Candidate } from "@/lib/buyers/ia/prompt";
import { iaSetFileSchema, loadIaSets } from "@/lib/buyers/ia/store";
import { IA_DATA_FILES } from "@/lib/buyers/ia-data";
import { searchBuyers } from "@/lib/buyers/service";
import { companyInputSchema } from "@/lib/buyers/types";
import type { FetchPageResult } from "@/lib/buyers/fetch-page";

afterEach(() => vi.restoreAllMocks());

// TODO lo de este fichero es FICTICIO: empresas, webs y respuestas del modelo. Reproduce los PATRONES de fallo observados
// en una lista real generada por un modelo (mismo dominio para varias empresas, empresa que no existe, web de otra empresa).
const KEY = "clave-secreta-de-prueba-123";
const q = { hs6: "220421", country: "DE" };
const day = new Date("2026-10-29T10:00:00Z");

const cand = (o: Partial<Candidate> & { nombre: string }): Candidate => ({ web: null, ciudad: null, tipo: "importador", motivo: "Motivo ficticio de prueba.", senalEspana: "desconocida", confianza: "media", ...o });
const html = (title: string, body: string) => `<html><head><title>${title}</title></head><body>${body}</body></html>`;
const PAGES: Record<string, string> = {
  "https://weinhandel-ficticio.test/": html("Weinhandel Ficticio", "<p>Wir sind Importeur und Großhandel für Wein aus Spanien und Italien.</p><a href=\"/kontakt\">Kontakt</a><a href=\"mailto:info@weinhandel-ficticio.test\">m</a>"),
  "https://portal-ficticio.test/": html("Portal Ficticio", "<p>Tienda online de vino español. Wein, Weine, vino.</p>"),
  "https://sinvino-ficticio.test/": html("Sinvino Ficticio GmbH", "<p>Wir verkaufen Schuhe und Taschen.</p>"),
};
const fetchPage = async (url: string): Promise<FetchPageResult> => (PAGES[url] ? { ok: true, html: PAGES[url], finalUrl: url } : { ok: false, reason: "network" });
const terms = ["wein", "weine", "wine"];
const ctx = { hs6: "220421", country: "DE", terms, model: "modelo-de-prueba" };
const deps = { fetchPage, now: () => day };

describe("prompt", () => {
  it("lleva el producto, el país, el idioma y las reglas contra la invención", () => {
    const p = buildPrompt(q);
    expect(p.input).toMatch(/220421/);
    expect(p.input).toMatch(/Alemania/);
    expect(p.input).toMatch(/alemán/);
    expect(p.system).toMatch(/No inventes/);
    expect(p.system).toMatch(/No incluyas personas, correos ni teléfonos/);
    expect(p.system).toMatch(/No es un requisito/); // el vínculo con España no se exige
  });
  it("limita el número de empresas pedidas", () => { expect(buildPrompt(q, 500).input).toMatch(/hasta 15 empresas/); expect(buildPrompt(q, 3).input).toMatch(/hasta 3 empresas/); });
  it("el esquema de salida valida respuestas buenas y rechaza malas", () => {
    expect(candidateListSchema.safeParse({ terminosProducto: ["wein"], empresas: [cand({ nombre: "Ficticia GmbH" })] }).success).toBe(true);
    expect(candidateListSchema.safeParse({ terminosProducto: ["wein"], empresas: [{ nombre: "X" }] }).success).toBe(false);
    expect(candidateListSchema.safeParse({ terminosProducto: [], empresas: [] }).success).toBe(false);
    expect(RESPONSE_JSON_SCHEMA.required).toEqual(["terminosProducto", "empresas"]);
  });
  it("el esquema enviado no contiene datos de personas", () => { expect(JSON.stringify(RESPONSE_JSON_SCHEMA)).not.toMatch(/correo|email|telefono|persona/i); });
});

describe("cliente de Gemini (sin red real)", () => {
  const ok = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  const base = { apiKey: KEY, system: "s", input: "i", schema: RESPONSE_JSON_SCHEMA };
  it("envía la clave por cabecera, sin herramientas de búsqueda, y devuelve el JSON", async () => {
    const f = ok({ output_text: '{"a":1}' });
    const r = await callGemini({ ...base, fetchImpl: f as unknown as typeof fetch, baseUrl: "https://mock.test/" });
    expect(r.data).toEqual({ a: 1 });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://mock.test/v1beta/interactions");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(KEY);
    const body = JSON.parse(init.body as string);
    expect(body).not.toHaveProperty("tools");
    expect(JSON.stringify(body)).not.toMatch(/google_search/i);
    expect(JSON.stringify(body)).not.toContain(KEY);
    expect(body.response_format).toMatchObject({ mime_type: "application/json" });
  });
  it("reconoce varias formas de respuesta y vallas de código", () => {
    expect(extractModelText({ output_text: "x" })).toBe("x");
    expect(extractModelText({ steps: [{ type: "thought" }, { type: "model_output", content: [{ type: "text", text: "hola" }] }] })).toBe("hola");
    expect(extractModelText({ candidates: [{ content: { parts: [{ text: "a" }, { text: "b" }] } }] })).toBe("ab");
    expect(extractModelText({ nada: 1 })).toBeNull();
    expect(parseJsonText('```json\n{"a":2}\n```')).toEqual({ a: 2 });
  });
  it("sin clave falla con un error de configuración y no llama a la red", async () => {
    const f = vi.fn();
    await expect(callGemini({ ...base, apiKey: "  ", fetchImpl: f as unknown as typeof fetch })).rejects.toMatchObject({ kind: "config" });
    expect(f).not.toHaveBeenCalled();
  });
  it("un error HTTP no filtra la clave en el mensaje", async () => {
    const f = ok({ error: { message: `API key ${KEY} not valid` } }, 400);
    const e = await callGemini({ ...base, fetchImpl: f as unknown as typeof fetch }).catch((x) => x);
    expect(e).toBeInstanceOf(GeminiError);
    expect(e.message).toMatch(/400/);
    expect(e.message).not.toContain(KEY);
  });
  it("si no reconoce la respuesta lo dice con las claves de primer nivel, sin volcar el contenido", async () => {
    const e = await callGemini({ ...base, fetchImpl: ok({ rareza: { secreto: "x" } }) as unknown as typeof fetch }).catch((x) => x);
    expect(e).toMatchObject({ kind: "format" });
    expect(e.message).toMatch(/rareza/);
    expect(e.message).not.toMatch(/secreto/);
  });
  it("errores de red y JSON roto se tipifican", async () => {
    await expect(callGemini({ ...base, sleep: async () => {}, fetchImpl: (async () => { throw new TypeError("fail"); }) as unknown as typeof fetch })).rejects.toMatchObject({ kind: "network" });
    await expect(callGemini({ ...base, fetchImpl: ok({ output_text: "no es json" }) as unknown as typeof fetch })).rejects.toMatchObject({ kind: "format" });
  });
});

describe("cliente de Gemini: respuesta real, reintentos y modelo de respaldo", () => {
  // Forma OBSERVADA en la API real el 29/10/2026 (gemini-3.5-flash-lite, petición mínima); ids y firma acortados.
  const REAL = { id: "v1_x", status: "completed", object: "interaction", model: "gemini-3.5-flash-lite", service_tier: "standard",
    usage: { total_tokens: 9, total_thought_tokens: 0 },
    steps: [{ signature: "Em…", type: "thought" }, { content: [{ text: "ok", type: "text" }], type: "model_output" }] };
  it("lee el texto de la forma de respuesta real", () => { expect(extractModelText(REAL)).toBe("ok"); });
  const res = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const okJson = (data: unknown) => res(200, { ...REAL, steps: [{ type: "thought" }, { type: "model_output", content: [{ type: "text", text: JSON.stringify(data) }] }] });
  const base = { apiKey: KEY, system: "s", input: "i", schema: {} };
  it("reintenta una vez ante un 503 y avisa del reintento", async () => {
    const f = vi.fn().mockResolvedValueOnce(res(503, { error: { message: "overloaded" } })).mockResolvedValueOnce(okJson({ a: 1 }));
    const sleep = vi.fn(async () => {});
    const onRetry = vi.fn();
    const r = await callGemini({ ...base, fetchImpl: f as unknown as typeof fetch, sleep, onRetry });
    expect(r.data).toEqual({ a: 1 });
    expect(f).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
  it("no reintenta errores que no son pasajeros (clave, modelo inexistente)", async () => {
    for (const status of [400, 401, 403, 404]) {
      const f = vi.fn(async () => res(status, { error: { message: "x" } }));
      await expect(callGemini({ ...base, fetchImpl: f as unknown as typeof fetch, sleep: async () => {} })).rejects.toMatchObject({ kind: "http", status });
      expect(f).toHaveBeenCalledTimes(1);
    }
  });
  it("si el modelo principal sigue saturado, usa el de respaldo y lo deja anotado", async () => {
    const answer = { terminosProducto: ["wein"], empresas: [cand({ nombre: "Weinhandel Ficticio GmbH", web: "weinhandel-ficticio.test" })] };
    const f = vi.fn(async (_u: string, init: RequestInit) => JSON.parse(init.body as string).model === "principal" ? res(503, {}) : okJson(answer));
    const msgs: string[] = [];
    const { set, stats } = await generatePistas(q, { apiKey: KEY, model: "principal", fallbackModel: "respaldo", fetchImpl: f as unknown as typeof fetch, fetchPage, now: () => day, sleep: async () => {}, onProgress: (m) => msgs.push(m) });
    expect(set.modelo).toBe("respaldo");
    expect(stats.modelsTried).toEqual(["principal", "respaldo"]);
    expect(set.companies[0].ia?.modelo).toBe("respaldo");
    expect(msgs.join("\n")).toMatch(/respaldo/);
    expect(msgs.join("\n")).toMatch(/\(1\/1\) Weinhandel Ficticio GmbH/);
  });
  it("sin respaldo, o con un error no pasajero, no se cambia de modelo", async () => {
    const sat = vi.fn(async () => res(503, {}));
    await expect(generatePistas(q, { apiKey: KEY, model: "principal", fallbackModel: null, fetchImpl: sat as unknown as typeof fetch, fetchPage, sleep: async () => {} })).rejects.toMatchObject({ status: 503 });
    const notFound = vi.fn(async () => res(404, {}));
    await expect(generatePistas(q, { apiKey: KEY, model: "principal", fallbackModel: "respaldo", fetchImpl: notFound as unknown as typeof fetch, fetchPage, sleep: async () => {} })).rejects.toMatchObject({ status: 404 });
    expect(notFound).toHaveBeenCalledTimes(1);
  });
});

describe("auditoría: nombres y webs", () => {
  it("las palabras distintivas ignoran formas legales y palabras genéricas del sector", () => {
    expect(nameTokens("Weinhandel Ficticio GmbH & Co. KG")).toEqual(["weinhandel", "ficticio"]);
    expect(nameTokens("Wein & Vinos GmbH")).toEqual([]); // todo genérico: se exige la frase completa
    expect(nameTokens("Hanseatisches Wein (Marca Ficticia)")).toEqual(["hanseatisches"]);
  });
  it("la web debe contener TODAS las palabras distintivas (o el dominio)", () => {
    expect(nameMatchesPage("Weinhandel Ficticio GmbH", "Willkommen bei Weinhandel Ficticio", "x.test")).toBe(true);
    expect(nameMatchesPage("Weinhandel Ficticio GmbH", "Willkommen bei Weinhandel Otro", "x.test")).toBe(false);
    expect(nameMatchesPage("Müller Weine", "Mueller? no: Muller Weine", "x.test")).toBe(true); // acentos y ß/ss
    expect(nameMatchesPage("", "cualquier texto", "x.test")).toBe(false);
    // nombre solo genérico: una web de vino cualquiera NO basta, hace falta la frase completa
    expect(nameMatchesPage("Wein & Vinos GmbH", "Wein aus Spanien. Vinos de España. Weine.", "tienda.test")).toBe(false);
    expect(nameMatchesPage("Wein & Vinos GmbH", "Impressum: Wein & Vinos GmbH, Berlin", "tienda.test")).toBe(true);
  });
  it("normaliza webs y rechaza hosts internos, directorios y brokers", () => {
    expect(normalizeWeb("www.Empresa-Ficticia.test/inicio?x=1")).toEqual({ ok: true, url: "https://www.empresa-ficticia.test/" });
    for (const bad of [null, "", "no es una web", "http://127.0.0.1/", "localhost", "https://www.zoominfo.com/c/x", "https://www.europages.com/x", "https://www.indeed.com/x"]) expect(normalizeWeb(bad).ok).toBe(false);
  });
});

describe("auditoría: verificada o pista sin verificar", () => {
  it("web real que nombra a la empresa y habla del producto → verificada, con contacto solo desde la web", async () => {
    const { companies } = await auditCandidates([cand({ nombre: "Weinhandel Ficticio GmbH", web: "weinhandel-ficticio.test", senalEspana: "si", confianza: "alta" })], ctx, deps);
    const c = companies[0];
    expect(c.ia).toMatchObject({ verificacion: "verificada", modelo: "modelo-de-prueba", senalEspana: "en_web" });
    expect(c.website).toBe("https://weinhandel-ficticio.test/");
    expect(c.evidence[0]).toMatchObject({ howConsulted: "pagina_leida", sourceType: "corporativa", claims: ["categoria"] });
    expect(c.contact).toMatchObject({ email: "info@weinhandel-ficticio.test", emailScope: "general" });
    expect(companyInputSchema.safeParse(c).success).toBe(true);
  });
  it("web que no responde → pista sin verificar, sin enlace y sin pruebas", async () => {
    const { companies } = await auditCandidates([cand({ nombre: "Inexistente Ficticia GmbH", web: "inexistente-ficticia.test", senalEspana: "si" })], ctx, deps);
    const c = companies[0];
    expect(c.ia).toMatchObject({ verificacion: "sin_verificar", senalEspana: "segun_ia" });
    expect(c.website).toBeNull();
    expect(c.evidence).toEqual([]);
    expect(c.ia?.auditoria.join(" ")).toMatch(/no comprobado/);
    expect(companyInputSchema.safeParse(c).success).toBe(true);
  });
  it("la web existe pero es de otra empresa → no se enlaza (caso real: un dominio atribuido a varias empresas)", async () => {
    const r = await auditCandidates([
      cand({ nombre: "Portal Ficticio", web: "portal-ficticio.test" }),
      cand({ nombre: "Bremer Ficticio Kolleg", web: "portal-ficticio.test" }),
      cand({ nombre: "Otra Ficticia Import", web: "https://www.portal-ficticio.test/" }),
    ], ctx, deps);
    const [a, b, c] = r.companies;
    expect(a.ia?.verificacion).toBe("verificada"); // la web sí nombra a «Portal Ficticio»
    expect(b.ia?.verificacion).toBe("sin_verificar");
    expect(c.ia?.verificacion).toBe("sin_verificar");
    expect(b.website).toBeNull();
    expect(b.ia?.auditoria.join(" ")).toMatch(/no nombra/);
    expect(b.ia?.auditoria.join(" ")).toMatch(/mismo dominio/);
  });
  it("la web nombra a la empresa pero no habla del producto → sin verificar", async () => {
    const { companies } = await auditCandidates([cand({ nombre: "Sinvino Ficticio GmbH", web: "sinvino-ficticio.test" })], ctx, deps);
    expect(companies[0].ia?.verificacion).toBe("sin_verificar");
    expect(companies[0].ia?.auditoria.join(" ")).toMatch(/no menciona el producto/);
  });
  it("sin web sugerida → pista sin verificar; las duplicadas se descartan", async () => {
    const r = await auditCandidates([cand({ nombre: "Sin Web Ficticia" }), cand({ nombre: "Sin Web Ficticia" })], ctx, deps);
    expect(r.companies).toHaveLength(1);
    expect(r.discarded).toHaveLength(1);
    expect(r.companies[0].ia?.verificacion).toBe("sin_verificar");
  });
  it("lee cada dominio una sola vez", async () => {
    const f = vi.fn(fetchPage);
    await auditCandidates([cand({ nombre: "Portal Ficticio", web: "portal-ficticio.test" }), cand({ nombre: "Otra Cosa Ficticia", web: "portal-ficticio.test" })], ctx, { fetchPage: f, now: () => day });
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("la señal de producto español solo es «en_web» si la web leída la menciona", async () => {
    const { companies } = await auditCandidates([cand({ nombre: "Weinhandel Ficticio GmbH", web: "weinhandel-ficticio.test", senalEspana: "no" })], ctx, deps);
    expect(companies[0].ia?.senalEspana).toBe("en_web");
    const sin = await auditCandidates([cand({ nombre: "Portal Ficticio", web: "portal-ficticio.test", senalEspana: "desconocida" })], { ...ctx, terms: ["weine"] }, { fetchPage: async () => ({ ok: true, html: html("Portal Ficticio", "<p>Portal Ficticio vende Weine.</p>"), finalUrl: "https://portal-ficticio.test/" }), now: () => day });
    expect(sin.companies[0].ia?.senalEspana).toBe("desconocida");
  });
});

describe("generación de punta a punta (Gemini simulado)", () => {
  const answer = { terminosProducto: ["Wein", "Weine", "wine"], empresas: [
    cand({ nombre: "Weinhandel Ficticio GmbH", web: "weinhandel-ficticio.test", confianza: "alta" }),
    cand({ nombre: "Inventada Ficticia AG", web: "inventada-ficticia.test", confianza: "alta" }),
  ] };
  const gem = () => vi.fn(async () => new Response(JSON.stringify({ output_text: JSON.stringify(answer) }), { status: 200 })) as unknown as typeof fetch;
  it("devuelve una lista válida con sus estadísticas y nunca asciende a «confirmado»", async () => {
    const { set, stats } = await generatePistas(q, { apiKey: KEY, fetchImpl: gem(), baseUrl: "https://mock.test", fetchPage, now: () => day });
    expect(stats).toMatchObject({ suggested: 2, verified: 1, unverified: 1 });
    expect(iaSetFileSchema.safeParse(set).success).toBe(true);
    expect(set).toMatchObject({ hs6: "220421", country: "DE", generadoEn: "2026-10-29" });
    const r = await searchBuyers(q, { provider: null, iaSets: [set] });
    expect(r.companies.map((c) => [c.name, c.evidenceLevel, c.ia?.verificacion])).toEqual([
      ["Weinhandel Ficticio GmbH", "probable", "verificada"],
      ["Inventada Ficticia AG", "insuficiente", "sin_verificar"],
    ]);
    expect(r.companies.some((c) => c.evidenceLevel === "confirmado")).toBe(false);
  });
  it("una respuesta que no cumple el formato falla con un mensaje claro", async () => {
    const bad = vi.fn(async () => new Response(JSON.stringify({ output_text: '{"empresas":"no"}' }), { status: 200 })) as unknown as typeof fetch;
    await expect(generatePistas(q, { apiKey: KEY, fetchImpl: bad, fetchPage })).rejects.toThrow(/formato esperado/);
  });
  it("sin clave no se hace ninguna lectura de webs", async () => {
    const f = vi.fn(fetchPage);
    await expect(generatePistas(q, { apiKey: undefined, fetchPage: f })).rejects.toMatchObject({ kind: "config" });
    expect(f).not.toHaveBeenCalled();
  });
});

describe("integración en el servicio, el CSV y los datos guardados", () => {
  const set = async () => (await generatePistas(q, { apiKey: KEY, baseUrl: "https://mock.test", fetchPage, now: () => day,
    fetchImpl: (async () => new Response(JSON.stringify({ output_text: JSON.stringify({ terminosProducto: ["wein"], empresas: [cand({ nombre: "Weinhandel Ficticio GmbH", web: "weinhandel-ficticio.test" }), cand({ nombre: "Pista Ficticia", web: null })] }) }), { status: 200 })) as unknown as typeof fetch })).set;
  it("avisa de que la lista es de IA, cuenta verificadas y pistas, y no mezcla combinaciones", async () => {
    const s = await set();
    const r = await searchBuyers(q, { provider: null, iaSets: [s] });
    expect(r.info.origins).toEqual(["ia"]);
    expect(r.summary).toMatchObject({ total: 2, iaVerificadas: 1, iaSinVerificar: 1, confirmado: 0 });
    expect(r.info.warnings.join(" ")).toMatch(/generada con IA/i);
    expect(r.info.warnings.join(" ")).toMatch(/sin verificar/);
    const otro = await searchBuyers({ hs6: "220421", country: "FR" }, { provider: null, iaSets: [s] });
    expect(otro.noData).toBe(true);
  });
  it("el CSV marca el origen IA, la verificación y la auditoría", async () => {
    const r = await searchBuyers(q, { provider: null, iaSets: [await set()] });
    const csv = buyersToCsv(r);
    expect(csv).toContain("sugerida por IA (sin revision humana)");
    expect(csv).toContain("IA · pista sin verificar");
    expect(csv).toContain("IA · web verificada");
    expect(csv.split("\r\n")[0]).toContain("auditoria_ia");
  });
  it("los ficheros de pistas guardados en el repo son válidos y no tienen empresas confirmadas ni datos personales", () => {
    const { sets, errors } = loadIaSets(IA_DATA_FILES);
    expect(errors).toEqual([]);
    for (const s of sets) for (const c of s.companies) {
      expect(c.origin).toBe("ia");
      expect(c.people).toEqual([]);
      expect(c.evidence.every((e) => e.howConsulted === "pagina_leida")).toBe(true);
    }
  });
  it("un fichero inválido no rompe la búsqueda: se omite con aviso", () => {
    const { sets, errors } = loadIaSets([{ hs6: "x" }]);
    expect(sets).toEqual([]);
    expect(errors[0]).toMatch(/no válido/);
  });
  it("las empresas de IA exigen sus metadatos y las curadas no pueden llevarlos", () => {
    const base = { id: "x1", name: "N", country: "DE", website: null, websiteStatus: "sin_verificar", type: "otro", evidence: [], reason: "r" };
    expect(companyInputSchema.safeParse({ ...base, origin: "ia" }).success).toBe(false);
    expect(companyInputSchema.safeParse({ ...base, origin: "curado" }).success).toBe(false); // sin pruebas
  });
});

describe("términos de importación en idiomas europeos", () => {
  it("reconoce alemán, francés, italiano y portugués", () => {
    for (const t of ["Wir sind Importeur von Wein", "Großhandel für Getränke", "grossiste en vins", "importatore di vini", "importadora de vinhos", "Vertrieb von Weinen"]) {
      expect(extractSignals(`<p>${t}</p>`, "https://x.test", ["x"]).importTerm, t).toBe(true);
    }
  });
});
