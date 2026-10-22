import http from "node:http";
import type { AddressInfo } from "node:net";

/**
 * SERVIDOR SIMULADO que imita el formato documentado de la API Statistics de Eurostat (JSON-stat 2.0, error 400
 * "No results found", respuesta asíncrona 413). Los VALORES son sintéticos y las dimensiones/códigos son los SUPUESTOS
 * del adaptador: sirve para probar el código, NO prueba que la API real use esos ids.
 */
export type MockMode = "ok" | "async" | "empty" | "error500" | "badrequest";

const DIM_ORDER = ["freq", "reporter", "partner", "product", "flow", "indicators", "time"];
const DEFAULTS: Record<string, string[]> = {
  freq: ["A"],
  partner: ["WORLD", "ES", "FR", "IT", "CN"],
  flow: ["1", "2"],
  indicators: ["VALUE_IN_EUROS", "QUANTITY_IN_100KG"],
  time: ["2023"],
};

export function makeJsonStat(params: URLSearchParams) {
  const cats = DIM_ORDER.map((d) => {
    const given = params.getAll(d).concat(d === "time" ? params.getAll("time_period") : []);
    return given.length ? given : DEFAULTS[d] ?? ["X"];
  });
  const size = cats.map((c) => c.length);
  const value: Record<string, number> = {};
  const total = size.reduce((a, b) => a * b, 1);
  for (let flat = 0; flat < total; flat++) {
    let rem = flat;
    const pos: number[] = [];
    for (let i = size.length - 1; i >= 0; i--) { pos[i] = rem % size[i]; rem = Math.floor(rem / size[i]); }
    const reporter = cats[1][pos[1]], partner = cats[2][pos[2]], ind = cats[5][pos[5]], year = Number(cats[6][pos[6]]);
    if (reporter === "FR" && partner === "ES") continue; // celda ausente a propósito (ausente ≠ 0)
    const base = (reporter.charCodeAt(0) + reporter.charCodeAt(1)) * 1000;
    const v = (partner === "WORLD" ? base * 100 : partner === "ES" ? base * 10 : base) * (1 + 0.1 * (year - 2021));
    value[String(flat)] = ind === "VALUE_IN_EUROS" ? Math.round(v) : Math.round(v / 20);
  }
  return {
    version: "2.0", class: "dataset", label: "SIMULATED fixture (not Eurostat data)",
    id: DIM_ORDER, size,
    dimension: Object.fromEntries(DIM_ORDER.map((d, i) => [d, { label: d, category: { index: Object.fromEntries(cats[i].map((c, k) => [c, k])), label: d === "product" ? Object.fromEntries(cats[i].map((c) => [c, `SIMULATED product ${c}`])) : undefined } }])),
    value,
  };
}

export async function startMock(mode: MockMode = "ok", opts: { asyncCalls?: number } = {}) {
  const requests: URL[] = [];
  let asyncLeft = opts.asyncCalls ?? Infinity;
  const server = http.createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://localhost");
    requests.push(u);
    const send = (status: number, body: unknown) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (mode === "error500") return send(500, { error: { status: "500", label: "Internal error" } });
    if (mode === "badrequest") return send(400, { error: { status: "400", label: "140 Syntax error: unknown dimension" } });
    if (mode === "empty") return send(400, { error: { status: "400", label: "100 No results found" } });
    if (mode === "async" && asyncLeft-- > 0) return send(200, { warning: { status: 413, label: "ASYNCHRONOUS_RESPONSE. Your request will be treated asynchronously. Please try again later." } });
    return send(200, makeJsonStat(u.searchParams));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  return { base: `http://127.0.0.1:${port}/data`, requests, close: () => new Promise<void>((r) => server.close(() => r())) };
}
