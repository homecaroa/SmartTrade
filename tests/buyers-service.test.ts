import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCache } from "@/lib/cache/ttl-cache";
import { buyersToCsv } from "@/lib/buyers/csv";
import { MAX_LIVE_FETCHES, buildQueries, discoverLive, searchBuyers, validateBuyerQuery } from "@/lib/buyers/service";
import { SourceError } from "@/lib/sources/types";
import type { SearchHit, SearchProvider } from "@/lib/buyers/types";

beforeEach(() => clearCache());
afterEach(() => vi.restoreAllMocks());

// Fixtures FICTICIOS: nada de esto es una empresa real.
const hits: SearchHit[] = [
  { title: "Ficticia Wine Trading - Japan importer", url: "https://ficticia-wine.test/", snippet: "wine importer and distributor in Japan" },
  { title: "Perfil Ficticio", url: "https://www.zoominfo.com/c/ficticia", snippet: "wine importer Japan" },
  { title: "Oferta Ficticia", url: "https://www.careercross.com/job/1", snippet: "wine importer Japan" },
  { title: "Solo blog ficticio", url: "https://blog-ficticio.test/post", snippet: "recetas de cocina" },
];
const provider = (h: SearchHit[] = hits): SearchProvider & { calls: number } => { const p = { id: "fake", calls: 0, async search() { p.calls++; return h; } }; return p; };
const page = async (url: string) => url.includes("blog-ficticio")
  ? { ok: true as const, finalUrl: url, html: "<title>Blog</title><p>recetas de cocina</p>" }
  : { ok: true as const, finalUrl: "https://ficticia-wine.test/", html: `<title>Ficticia</title><p>wine importer</p><a href="/contact">Contact</a><a href="mailto:info@ficticia-wine.test">m</a><a href="mailto:ana.garcia@ficticia-wine.test">p</a>` };
const q = { hs6: "220421", country: "JP" };

describe("validación de la consulta", () => {
  it("exige HS6 numérico y un país del catálogo", () => {
    expect(validateBuyerQuery({ hs6: "220421", country: "jp" })).toMatchObject({ ok: true, query: { hs6: "220421", country: "JP" } });
    expect(validateBuyerQuery({ hs6: "2204", country: "JP" }).ok).toBe(false);
    expect(validateBuyerQuery({ hs6: "220421", country: "ZZ" }).ok).toBe(false);
    expect(validateBuyerQuery({ hs6: "220421", country: "JP", keywords: "a, b,c,d,e,f,g" })).toMatchObject({ query: { keywords: ["a", "b", "c", "d", "e"] } });
  });
  it("las consultas de búsqueda se limitan a 3 y usan los términos del producto", () => {
    const qs = buildQueries(q);
    expect(qs.length).toBeLessThanOrEqual(3);
    expect(qs[0]).toMatch(/wine.*Japón|wine.*Japan/i);
    expect(buildQueries({ hs6: "999999", country: "JP" })).toEqual([]);
  });
});

describe("modo curado (sin API de búsqueda)", () => {
  it("vino embotellado en Japón devuelve el piloto y avisa de que la búsqueda en vivo no está configurada", async () => {
    const r = await searchBuyers(q, { provider: null });
    expect(r.summary).toMatchObject({ total: 9, confirmado: 2, probable: 7, insuficiente: 0, withVerifiedContact: 2 });
    expect(r.info.origins).toEqual(["curado"]);
    expect(r.info.providerConfigured).toBe(false);
    expect(r.info.warnings.join(" ")).toMatch(/TAVILY_API_KEY/);
    expect(r.companies[0].evidenceLevel).toBe("confirmado");
  });
  it("otra combinación sin datos devuelve «sin datos suficientes», no resultados inventados", async () => {
    const r = await searchBuyers({ hs6: "150920", country: "US" }, { provider: null });
    expect(r.noData).toBe(true);
    expect(r.companies).toEqual([]);
    expect(r.info.warnings.join(" ")).toMatch(/No hay datos curados/);
  });
});

describe("descubrimiento en vivo (proveedor y páginas simulados)", () => {
  it("descarta brokers de datos y ofertas de empleo, y nunca marca más que «probable»", async () => {
    const r = await discoverLive(q, { provider: provider(), fetchPage: page, now: () => new Date("2026-10-28T10:00:00Z") });
    expect(r.companies.map((c) => c.id)).toEqual(["live-ficticia-wine.test"]);
    const c = r.companies[0];
    expect(c.evidenceLevel).toBe("probable");
    expect(c.origin).toBe("busqueda_en_vivo");
    expect(c.evidence[0]).toMatchObject({ howConsulted: "pagina_leida", consultedAt: "2026-10-28" });
  });
  it("solo guarda correos genéricos con su URL de origen; nunca personales", async () => {
    const [c] = (await discoverLive(q, { provider: provider(), fetchPage: page, now: () => new Date() })).companies;
    expect(c.contact).toMatchObject({ email: "info@ficticia-wine.test", emailSourceUrl: "https://ficticia-wine.test/", emailScope: "general" });
    expect(JSON.stringify(c)).not.toContain("ana.garcia");
  });
  it("limita el número de páginas leídas", async () => {
    const many: SearchHit[] = Array.from({ length: 12 }, (_, i) => ({ title: `Empresa ${i}`, url: `https://empresa${i}.test/`, snippet: "wine importer" }));
    const fetchPage = vi.fn(page);
    await discoverLive(q, { provider: provider(many), fetchPage, now: () => new Date() });
    expect(fetchPage.mock.calls.length).toBeLessThanOrEqual(MAX_LIVE_FETCHES);
  });
  it("si no se puede leer la página usa el extracto solo si menciona producto e importación", async () => {
    const r = await discoverLive(q, { provider: provider(), fetchPage: async () => ({ ok: false, reason: "robots" }), now: () => new Date() });
    expect(r.companies[0].evidence[0].howConsulted).toBe("extracto_buscador");
    expect(r.companies[0].evidenceLevel).toBe("insuficiente"); // fuente «otra» solo con extracto
    expect(r.warnings.join(" ")).toMatch(/robots/);
  });
});

describe("servicio completo", () => {
  it("combina curado y en vivo sin mezclar orígenes y cachea la búsqueda en vivo", async () => {
    const p = provider();
    const a = await searchBuyers(q, { provider: p, fetchPage: page });
    const b = await searchBuyers(q, { provider: p, fetchPage: page });
    expect(a.info.origins).toEqual(["curado", "busqueda_en_vivo"]);
    expect(a.companies.filter((c) => c.origin === "busqueda_en_vivo")).toHaveLength(1);
    expect(a.companies.filter((c) => c.origin === "curado")).toHaveLength(9);
    expect(p.calls).toBe(3); // 3 consultas la primera vez; la segunda sale de caché
    expect(b.summary.total).toBe(a.summary.total);
  });
  it("un fallo del proveedor no rompe el servicio: se muestran los datos curados con un aviso", async () => {
    const failing: SearchProvider = { id: "fake", async search() { throw new SourceError("rate_limit", "Se agotó la cuota de la API de búsqueda."); } };
    const r = await searchBuyers(q, { provider: failing, fetchPage: page });
    expect(r.summary.total).toBe(9);
    expect(r.info.warnings.join(" ")).toMatch(/cuota/);
  });
});

describe("exportación CSV", () => {
  it("incluye nivel, fuentes y fechas, una fila por empresa, y neutraliza fórmulas", async () => {
    const r = await searchBuyers(q, { provider: null });
    const csv = buyersToCsv(r);
    const lines = csv.replace("\uFEFF", "").trim().split("\r\n");
    expect(lines).toHaveLength(10);
    expect(lines[0]).toContain("nivel_evidencia");
    expect(csv).toContain("https://www.nishuhan.co.jp/news/2021/20210423.html");
    expect(csv).toContain("curado a mano");
    const evil = { ...r, companies: [{ ...r.companies[0], name: "=HYPERLINK(\"http://x\")" }] };
    expect(buyersToCsv(evil)).not.toMatch(/,"?=HYPERLINK/);
  });
});
