import { describe, expect, it } from "vitest";
import { classifyEvidence, dedupeCompanies, enrich, filterCompanies, guessSourceType, isBrokerHost, sortCompanies } from "@/lib/buyers/rules";
import type { CompanyInput, Evidence } from "@/lib/buyers/types";

// Fixtures FICTICIOS para pruebas: no son empresas reales.
const ev = (o: Partial<Evidence> = {}): Evidence => ({ url: "https://ejemplo-ficticio.test/a", title: "FICTICIO", sourceType: "corporativa", howConsulted: "pagina_leida", consultedAt: "2026-01-01", claims: ["categoria"], summary: "FICTICIO", ...o });
const co = (o: Partial<CompanyInput> = {}): CompanyInput => ({ id: "ficticia-1", name: "Empresa Ficticia", country: "JP", website: "https://ejemplo-ficticio.test", websiteStatus: "verificada", type: "importador", brands: [], evidence: [ev()], contact: {}, people: [], reason: "FICTICIO", pending: [], notes: [], origin: "curado", ...o });

describe("nivel de evidencia: se deduce de las pruebas", () => {
  it("confirmado: página leída de la propia empresa que afirma la categoría", () => {
    expect(classifyEvidence([ev()]).level).toBe("confirmado");
  });
  it("un extracto del buscador de la web de la empresa no basta para confirmar", () => {
    expect(classifyEvidence([ev({ howConsulted: "extracto_buscador" })]).level).toBe("probable");
  });
  it("directorio, fuente oficial o prensa → probable", () => {
    for (const t of ["directorio", "gobierno", "prensa", "feria", "asociacion"] as const) expect(classifyEvidence([ev({ sourceType: t })]).level).toBe("probable");
  });
  it("solo ofertas de empleo, otras fuentes o ninguna afirmación → insuficiente", () => {
    expect(classifyEvidence([ev({ sourceType: "empleo" })]).level).toBe("insuficiente");
    expect(classifyEvidence([ev({ sourceType: "otra" })]).level).toBe("insuficiente");
    expect(classifyEvidence([ev({ claims: [] })]).level).toBe("insuficiente");
  });
  it("los resultados de búsqueda automática nunca superan «probable»", () => {
    expect(classifyEvidence([ev()], "busqueda_en_vivo").level).toBe("probable");
  });
  it("el origen español solo se verifica con fuentes primarias u oficiales, no con un directorio", () => {
    expect(classifyEvidence([ev({ claims: ["categoria", "origen_espana"] })]).spainOriginVerified).toBe(true);
    expect(classifyEvidence([ev({ sourceType: "directorio", claims: ["categoria", "origen_espana"] })]).spainOriginVerified).toBe(false);
  });
});

describe("empresas y contacto", () => {
  it("el contacto solo cuenta como verificado con una URL pública", () => {
    expect(enrich(co()).contactVerified).toBe(false);
    expect(enrich(co({ contact: { contactPageUrl: "https://ejemplo-ficticio.test/contacto" } })).contactVerified).toBe(true);
  });
  it("fusiona duplicados por dominio, une pruebas y conserva el nivel más alto", () => {
    const a = enrich(co({ evidence: [ev({ sourceType: "directorio", url: "https://x.test/1" })] }));
    const b = enrich(co({ evidence: [ev({ url: "https://x.test/2" })] }));
    const out = dedupeCompanies([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0].evidence).toHaveLength(2);
    expect(out[0].evidenceLevel).toBe("confirmado");
  });
  it("ordena por nivel y después por contacto verificado", () => {
    const p = enrich(co({ id: "p", name: "P", website: "https://p.test", evidence: [ev({ sourceType: "directorio" })] }));
    const c = enrich(co({ id: "c", name: "C", website: "https://c.test" }));
    expect(sortCompanies([p, c]).map((x) => x.id)).toEqual(["c", "p"]);
  });
  it("filtra por tipo y nivel e ignora valores no válidos", () => {
    const list = [enrich(co({ type: "importador" })), enrich(co({ id: "2", name: "Dos", website: "https://dos.test", type: "mayorista", evidence: [ev({ sourceType: "directorio" })] }))];
    expect(filterCompanies(list, { tipo: "mayorista" })).toHaveLength(1);
    expect(filterCompanies(list, { nivel: "confirmado" })).toHaveLength(1);
    expect(filterCompanies(list, { tipo: "inventado", nivel: "x" })).toHaveLength(2);
  });
});

describe("clasificación de fuentes", () => {
  it("descarta brokers de datos y reconoce empleo, directorios y fuentes oficiales", () => {
    expect(isBrokerHost("https://www.zoominfo.com/c/x")).toBe(true);
    expect(isBrokerHost("https://prospeo.io/c/x")).toBe(true);
    expect(isBrokerHost("https://empresa.test")).toBe(false);
    expect(guessSourceType("https://www.careercross.com/job/1")).toBe("empleo");
    expect(guessSourceType("https://www.inshokuten.com/supplier/company/650")).toBe("directorio");
    expect(guessSourceType("https://www.jetro.go.jp/x.pdf")).toBe("gobierno");
    expect(guessSourceType("https://ejapo.cancilleria.gob.ar/x.pdf")).toBe("gobierno");
    expect(guessSourceType("https://empresa.test")).toBe("otra");
  });
});
