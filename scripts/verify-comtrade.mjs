// Diagnóstico de UN Comtrade. Ejecutar:  npm run verify:comtrade
// Sin COMTRADE_API_KEY solo prueba la API de vista previa (sin clave, muy limitada). No imprime la clave.
import dns from "node:dns/promises";

try { process.loadEnvFile(".env.local"); } catch { /* sin .env.local */ }
try { process.loadEnvFile(".env"); } catch { /* sin .env */ }

const baseHost = process.env.COMTRADE_BASE_URL ?? "https://comtradeapi.un.org";
const key = process.env.COMTRADE_API_KEY?.trim();
const inQuery = process.env.COMTRADE_KEY_IN_QUERY === "true";
let fails = 0;
const ok = (m) => console.log("  ✔", m);
const bad = (m) => { fails++; console.log("  ✘", m); };

// Importante en Windows: no se usa process.exit() (con conexiones abiertas provoca un cierre brusco 0xC0000409).
// El código de salida se asigna a process.exitCode y Node termina solo al vaciar el bucle de eventos.
async function main() {
  console.log("SmarTrade · verificación de UN Comtrade");
  console.log(`  COMTRADE_API_KEY: ${key ? "configurada (oculta)" : "NO configurada (solo vista previa)"} · envío de clave: ${inQuery ? "parámetro subscription-key" : "cabecera Ocp-Apim-Subscription-Key"}`);

  try { const a = await dns.lookup(new URL(baseHost).hostname); ok(`DNS → ${a.address}`); }
  catch { bad("DNS: no se resuelve el host. Sin internet no se puede continuar."); return 1; }

  async function probe(label, path, params, auth) {
    const u = new URL(baseHost + path);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    if (auth && inQuery) u.searchParams.set("subscription-key", key);
    console.log(`\n▶ ${label}\n  GET ${u.origin}${u.pathname}?${[...u.searchParams.keys()].filter((k) => k !== "subscription-key").map((k) => `${k}=${u.searchParams.get(k)}`).join("&")}${auth && inQuery ? "&subscription-key=***" : ""}`);
    let res;
    try { res = await fetch(u, { headers: auth && !inQuery ? { "Ocp-Apim-Subscription-Key": key } : {}, signal: AbortSignal.timeout(60_000) }); }
    catch (e) { bad(`Fallo de red (${e?.cause?.code ?? e?.name}). Revisa conexión/proxy/firewall.`); return; }
    const text = await res.text();
    console.log(`  HTTP ${res.status} · ${text.length} bytes`);
    if (res.status === 401 || res.status === 403) return bad("Acceso denegado: clave inválida/caducada o sin permiso para este endpoint (la clave gratuita no cubre todos los endpoints).");
    if (res.status === 429) return bad("Límite de consultas alcanzado (HTTP 429). Espera y reintenta.");
    if (!res.ok) return bad(`Error HTTP ${res.status}: ${text.slice(0, 200).replace(key ?? "§", "***")}`);
    let j; try { j = JSON.parse(text); } catch { return bad("La respuesta no es JSON."); }
    const rows = j.data ?? [];
    if (!Array.isArray(rows) || rows.length === 0) return bad("Respuesta sin filas (revisa códigos de país/producto/periodo).");
    ok(`${rows.length} filas`);
    const r = rows[0];
    const expected = ["period", "reporterISO", "partnerISO", "cmdCode", "flowCode", "primaryValue", "netWgt", "classificationCode"];
    const miss = expected.filter((f) => !(f in r));
    miss.length ? bad(`Campos esperados ausentes en la fila: ${miss.join(", ")} → ajusta rowSchema en lib/sources/comtrade.ts`) : ok("Campos esperados presentes");
    console.log("  · Campos recibidos:", Object.keys(r).join(", "));
    console.log("  · Ejemplo:", JSON.stringify({ reporterISO: r.reporterISO, partnerISO: r.partnerISO, cmdCode: r.cmdCode, flowCode: r.flowCode, period: r.period, primaryValue: r.primaryValue }));
    if (rows.length >= 500) console.log("  · AVISO: 500 filas = límite por llamada; el adaptador trocea las consultas y rechaza respuestas truncadas.");
  }

  await probe("1) Vista previa sin clave (importaciones de Alemania, HS 220421)", "/public/v1/preview/C/A/HS", { flowCode: "M", reporterCode: "276", cmdCode: "220421", period: "2023", partnerCode: "0" }, false);
  if (key) await probe("2) Endpoint con clave (data/v1/get)", "/data/v1/get/C/A/HS", { flowCode: "M", reporterCode: "276", cmdCode: "220421", period: "2023", partnerCode: "0,724", maxrecords: "500" }, true);
  else console.log("\n(2) Prueba con clave omitida: define COMTRADE_API_KEY en .env.local para ejecutarla.");

  console.log(`\nResumen: ${fails ? fails + " fallo(s)" : "sin fallos"}.`);
  return fails ? 1 : 0;
}

process.exitCode = await main();
