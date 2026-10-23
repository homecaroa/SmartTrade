import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACCESS_LINKS, buildMarketAccess, STATUS_LABEL } from "@/lib/market-access";

const eu = () => buildMarketAccess({ marketCode: "DE", marketName: "Alemania", productCode: "220421", synthetic: false });
const third = () => buildMarketAccess({ marketCode: "US", marketName: "Estados Unidos", productCode: "220421", synthetic: false });
const item = (i: ReturnType<typeof eu>, t: string) => i.items.find((x) => x.topic === t)!;

describe("acceso al mercado", () => {
  it("identifica origen (España) y destino con el HS6 analizado", () => {
    const i = eu();
    expect([i.originCode, i.originName, i.destinationCode, i.destinationName, i.hs6]).toEqual(["ES", "España", "DE", "Alemania", "220421"]);
  });
  it("UE: regla general marcada como parcial, nunca como verificada", () => {
    const i = eu();
    expect(i.scope).toBe("eu");
    expect(item(i, "arancel").status).toBe("partial");
    expect(i.items.some((x) => x.status === "verified")).toBe(false);
  });
  it("tercer país: aranceles pendientes y sin valor (no cero)", () => {
    const i = third();
    expect(i.scope).toBe("third");
    expect(item(i, "arancel")).toMatchObject({ value: null, status: "pending" });
    expect(item(i, "origen").value).toBeNull();
    for (const x of i.items) expect(x.value === null || !/^0(\D|$)/.test(x.value)).toBe(true);
  });
  it("mercado no clasificado: todo pendiente y con aviso", () => {
    const i = buildMarketAccess({ marketCode: "ZZ", marketName: "Desconocido", productCode: "220421", synthetic: false });
    expect(i.scope).toBe("unknown");
    expect(item(i, "arancel").status).toBe("pending");
    expect(i.limitations.some((l) => l.includes("no está clasificado"))).toBe(true);
  });
  it("separa aranceles, impuestos, requisitos y logística", () => {
    const i = third();
    expect(i.items.map((x) => x.topic)).toEqual(["arancel", "origen", "impuestos", "requisitos", "logistica"]);
    expect(item(i, "logistica").status).toBe("unavailable");
    expect(item(i, "logistica").label).not.toMatch(/arancel/i);
    expect(item(i, "impuestos").label).not.toMatch(/arancel/i);
  });
  it("cada dato indica su fuente y no hay fecha de consulta inventada", () => {
    const i = eu();
    expect(i.items.every((x) => x.source.length > 0 && STATUS_LABEL[x.status])).toBe(true);
    expect(i.checkedAt).toBeNull();
    expect(i.validity).toBeNull();
  });
  it("solo enlaza a las fuentes oficiales conocidas, por https", () => {
    expect(ACCESS_LINKS.map((l) => new URL(l.url).hostname).sort()).toEqual(["trade.ec.europa.eu", "www.icex.es"]);
    expect(ACCESS_LINKS.every((l) => l.url.startsWith("https://"))).toBe(true);
  });
  it("marca los datos de demostración sin mezclarlos con datos reales", () => {
    expect(buildMarketAccess({ marketCode: "US", marketName: "Estados Unidos", productCode: "220421", synthetic: true }).demo).toBe(true);
    expect(eu().demo).toBe(false);
  });
  it("no influye en la puntuación: no importa nada de scoring ni de oportunidades", () => {
    const src = readFileSync("lib/market-access.ts", "utf8");
    expect(src).not.toMatch(/scoring|opportunities|ranking/);
    expect(src).toMatch(/no altera la puntuación/i);
  });
});
