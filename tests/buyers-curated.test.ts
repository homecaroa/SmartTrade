import { describe, expect, it } from "vitest";
import { classifyEvidence, enrich } from "@/lib/buyers/rules";
import { WINE_JP } from "@/lib/buyers/curated/wine-jp";
import { companyInputSchema } from "@/lib/buyers/types";

const all = WINE_JP.map(enrich);

describe("piloto vino en Japón: integridad del conjunto curado (datos reales con fuente)", () => {
  it("todas las empresas cumplen el esquema y están marcadas como curadas, no como demostración", () => {
    expect(WINE_JP.length).toBeGreaterThanOrEqual(9);
    for (const c of WINE_JP) { expect(companyInputSchema.safeParse(c).success).toBe(true); expect(c.origin).toBe("curado"); expect(c.country).toBe("JP"); }
    expect(JSON.stringify(WINE_JP)).not.toMatch(/ficticio|demo/i);
  });
  it("cada prueba tiene URL http(s), fecha ISO no futura y un resumen", () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const c of WINE_JP) for (const e of c.evidence) {
      expect(e.url).toMatch(/^https?:\/\//);
      expect(e.consultedAt <= today).toBe(true);
      expect(e.summary.length).toBeGreaterThan(10);
    }
  });
  it("no hay correos ni personas sin fuente pública, ni correos personales", () => {
    for (const c of WINE_JP) {
      if (c.contact.email) { expect(c.contact.emailSourceUrl).toBeTruthy(); expect(c.contact.emailScope).not.toBe("personal"); }
      if (c.contact.phone) expect(c.contact.phoneSourceUrl).toBeTruthy();
      for (const p of c.people) expect(p.sourceUrl).toBeTruthy();
    }
  });
  it("«confirmado» solo con una página leída de la propia empresa que afirma la categoría", () => {
    for (const c of all) {
      const strong = c.evidence.some((e) => e.sourceType === "corporativa" && e.howConsulted === "pagina_leida" && e.claims.includes("categoria"));
      expect(c.evidenceLevel === "confirmado").toBe(strong);
      expect(classifyEvidence(c.evidence, c.origin).level).toBe(c.evidenceLevel);
    }
  });
  it("resultado del piloto: 2 confirmados, 7 probables, 2 con contacto oficial verificable y ninguno con correo", () => {
    expect(all.filter((c) => c.evidenceLevel === "confirmado").map((c) => c.id).sort()).toEqual(["jp-mikuni-wine", "jp-nihon-shurui-hanbai"]);
    expect(all.filter((c) => c.evidenceLevel === "probable")).toHaveLength(7);
    expect(all.filter((c) => c.contactVerified).map((c) => c.id).sort()).toEqual(["jp-mikuni-wine", "jp-nihon-shurui-hanbai"]);
    expect(all.some((c) => c.contact.email)).toBe(false);
  });
  it("las empresas solo respaldadas por un listado no se presentan con origen español verificado", () => {
    for (const id of ["jp-mottox", "jp-enoteca", "jp-yamaya", "jp-kokubu", "jp-pieroth-japan", "jp-para-japan"]) expect(all.find((c) => c.id === id)!.spainOriginVerified).toBe(false);
    expect(all.find((c) => c.id === "jp-nihon-shurui-hanbai")!.spainOriginVerified).toBe(true);
  });
});
