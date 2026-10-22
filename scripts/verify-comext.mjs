// Diagnóstico reproducible de la API de Eurostat Comext. Ejecutar con internet:  npm run verify:comext
// Salida: 0 = todo coherente con los supuestos del adaptador · 1 = fallo o discrepancia · 2 = no concluyente (asíncrono)
// No imprime claves (Comext no usa clave). Puede apuntar a un servidor de prueba con COMEXT_BASE_URL.
import dns from "node:dns/promises";

try { process.loadEnvFile(".env.local"); } catch { /* sin .env.local */ }
try { process.loadEnvFile(".env"); } catch { /* sin .env */ }

const base = (process.env.COMEXT_BASE_URL ?? "https://ec.europa.eu/eurostat/api/comext/dissemination/statistics/1.0/data").replace(/\/$/, "");
const dataset = process.env.COMEXT_DATASET ?? "ds-045409";
const world = process.env.COMEXT_WORLD_CODE ?? "WORLD";
const YEAR = process.env.VERIFY_YEAR ?? "2023";
const P = process.env.VERIFY_PRODUCT ?? "220421"; // HS6 vigente en HS2022 (el 150910 se eliminó en HS2022)
const results = [];
const ok = (m) => { results.push(["OK", m]); console.log("  ✔", m); };
const bad = (m) => { results.push(["FAIL", m]); console.log("  ✘", m); };
const note = (m) => console.log("  ·", m);

function url(params) {
  const u = new URL(`${base}/${encodeURIComponent(dataset)}`);
  u.searchParams.set("format", "JSON");
  u.searchParams.set("lang", "EN");
  for (const [k, vs] of Object.entries(params)) for (const v of [].concat(vs)) u.searchParams.append(k, v);
  return u;
}

async function get(u, label) {
  console.log(`\n▶ ${label}\n  GET ${u}`);
  let res;
  try {
    res = await fetch(u, { signal: AbortSignal.timeout(60_000) });
  } catch (e) {
    const cause = e?.cause?.code ?? e?.name;
    bad(`Fallo de red (${cause ?? "desconocido"}). ` + ({
      ENOTFOUND: "El nombre de host no se resuelve: revisa DNS/conexión.",
      ECONNREFUSED: "Conexión rechazada: revisa COMEXT_BASE_URL o el firewall.",
      ETIMEDOUT: "Tiempo agotado: red lenta o bloqueada por proxy/firewall.",
      TimeoutError: "Tiempo agotado (60 s).",
    }[cause] ?? "Revisa conexión, proxy y certificados."));
    return null;
  }
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* no JSON */ }
  console.log(`  HTTP ${res.status} · ${res.headers.get("content-type") ?? "sin content-type"} · ${text.length} bytes`);
  return { status: res.status, json, text };
}

function classify(r) {
  if (r.json?.warning && (Number(r.json.warning.status) === 413 || /asynchronous/i.test(r.json.warning.label ?? ""))) return "pending";
  if (r.json?.error || r.status >= 400) return /no results/i.test(r.json?.error?.label ?? "") || /^100\b/.test(r.json?.error?.label ?? "") ? "empty" : "error";
  return r.json?.id && r.json?.dimension ? "data" : "unknown";
}

function nValues(js) {
  const v = js?.value;
  return Array.isArray(v) ? v.filter((x) => x !== null).length : Object.keys(v ?? {}).length;
}

function codes(js, dim) {
  const idx = js.dimension?.[dim]?.category?.index ?? {};
  return Array.isArray(idx) ? idx : Object.keys(idx);
}

// Importante en Windows: no se usa process.exit() (con conexiones abiertas provoca un cierre brusco 0xC0000409).
// El código de salida se asigna a process.exitCode y Node termina solo al vaciar el bucle de eventos.
async function main() {
  console.log("SmarTrade · verificación de Eurostat Comext");
  console.log(`  Dataset: ${dataset}\n  Base:    ${base}\n  Código 'mundo' esperado: ${world}\n  Año de prueba: ${YEAR}`);

  // 0) DNS
  try { const h = new URL(base).hostname; const a = await dns.lookup(h); ok(`DNS: ${h} → ${a.address}`); }
  catch { bad("DNS: no se resuelve el host. Sin acceso a internet no se puede continuar."); return 1; }

  // 1) Descubrimiento: solo reporter + product + time (descubre dimensiones y códigos reales)
  const disc = await get(url({ reporter: "DE", product: P, time: YEAR }), `1) Descubrimiento de dimensiones (reporter=DE, product=${P})`);
  if (!disc) return 1;
  const k1 = classify(disc);
  if (k1 === "pending") { note("Respuesta asíncrona (HTTP 413 documentado). Repite el comando en unos minutos."); return 2; }
  if (k1 === "empty") bad(`Sin resultados para esa combinación (${disc.json?.error?.label}). Prueba con VERIFY_YEAR=2022 o COMEXT_DATASET distinto.`);
  else if (k1 === "error") bad(`Eurostat rechazó la consulta: ${disc.json?.error?.label ?? "HTTP " + disc.status}. Si menciona una dimensión desconocida, los ids de dimensión del adaptador no coinciden: edita COMEXT.dims en lib/sources/comext.ts.`);
  else if (k1 === "unknown") bad("La respuesta no es JSON-stat (faltan 'id'/'dimension'). Primeros bytes: " + disc.text.slice(0, 200));
  else {
    const js = disc.json;
    ok(`JSON-stat recibido. Dimensiones: ${js.id.join(", ")}`);
    const need = ["reporter", "partner", "product", "flow", "indicators", "time"];
    const missing = need.filter((d) => !js.id.includes(d));
    missing.length ? bad(`Faltan dimensiones esperadas: ${missing.join(", ")} → corrige COMEXT.dims en lib/sources/comext.ts`) : ok("Todas las dimensiones esperadas existen");
    for (const d of js.id) note(`${d}: ${codes(js, d).slice(0, 12).join(", ")}${codes(js, d).length > 12 ? ` … (${codes(js, d).length})` : ""}`);
    if (js.id.includes("partner")) {
      const p = codes(js, "partner");
      p.includes(world) ? ok(`Código de socio 'mundo' encontrado: ${world}`) : bad(`'${world}' no está entre los socios. Candidatos: ${p.filter((c) => /WORLD|TOTAL|EXTRA|INTRA|EU/i.test(c)).join(", ") || "(ninguno evidente)"} → fija COMEXT_WORLD_CODE`);
      p.includes("ES") ? ok("Socio 'ES' presente") : bad("Socio 'ES' no encontrado (¿usa otro código para España?)");
    }
    if (js.id.includes("flow")) { const f = codes(js, "flow"); ["1", "2"].every((c) => f.includes(c)) ? ok("Flujos '1' (importación) y '2' (exportación) presentes") : bad(`Flujos recibidos: ${f.join(", ")} → corrige COMEXT.flowImport/flowExport`); }
    if (js.id.includes("indicators")) { const i = codes(js, "indicators"); for (const c of ["VALUE_IN_EUROS", "QUANTITY_IN_100KG"]) i.includes(c) ? ok(`Indicador ${c} presente`) : bad(`Indicador ${c} ausente. Disponibles: ${i.join(", ")} → corrige COMEXT.indValue/indWeight`); }
    if (js.id.includes("product")) { const lbl = js.dimension.product.category.label ?? {}; note(`Etiqueta producto ${P}: ${lbl[P] ?? "(sin etiqueta)"}`); }
  }

  // 1b) Sondeo: ¿en qué combinaciones hay valores? (la API real puede devolver "value":{} si no hay datos)
  console.log("\n▶ 1b) Sondeo de combinaciones con datos (importaciones, socio mundo, valor en euros)");
  const base1 = { reporter: "DE", partner: world, flow: "1", indicators: "VALUE_IN_EUROS" };
  const probes = [
    [`DE · ${P} · freq=A · time=2023`, { ...base1, product: P, freq: "A", time: "2023" }],
    [`DE · ${P} · freq=A · time=2022`, { ...base1, product: P, freq: "A", time: "2022" }],
    [`DE · ${P} · freq=A · time=2021`, { ...base1, product: P, freq: "A", time: "2021" }],
    [`DE · ${P} · freq=A · lastTimePeriod=3`, { ...base1, product: P, freq: "A", lastTimePeriod: "3" }],
    [`DE · ${P} · freq=M · lastTimePeriod=2`, { ...base1, product: P, freq: "M", lastTimePeriod: "2" }],
    [`DE · HS4 ${P.slice(0, 4)} · freq=A · time=2023`, { ...base1, product: P.slice(0, 4), freq: "A", time: "2023" }],
    [`ES · ${P} · exportación · freq=A · time=2023`, { ...base1, reporter: "ES", flow: "2", product: P, freq: "A", time: "2023" }],
    [`FR · ${P} · freq=A · time=2023`, { ...base1, reporter: "FR", product: P, freq: "A", time: "2023" }],
    [`DE ← ES (bilateral) · ${P} · freq=A · time=2023`, { ...base1, partner: "ES", product: P, freq: "A", time: "2023" }],
    ["DE · 150910 (eliminado en HS2022) · A · 2023 → se espera SIN valores", { ...base1, product: "150910", freq: "A", time: "2023" }],
    ["DE · 150910 (HS2017) · A · 2021 → se espera CON valores", { ...base1, product: "150910", freq: "A", time: "2021" }],
    ["DE · 150920 (HS2022, aceite virgen extra) · A · 2023", { ...base1, product: "150920", freq: "A", time: "2023" }],
  ];
  let working = 0;
  for (const [label, params] of probes) {
    const r = await get(url(params), label);
    if (!r) continue;
    const k = classify(r);
    if (k === "data") {
      const n = nValues(r.json);
      console.log(`  → ${n} celdas con valor · time devuelto: ${codes(r.json, "time").slice(0, 4).join(", ") || "-"}`);
      if (n > 0) working++;
      if (n > 0) note("Ejemplo de valores: " + JSON.stringify(r.json.value).slice(0, 160));
    } else console.log(`  → ${k}${r.json?.error?.label ? ": " + r.json.error.label : ""}`);
  }
  note("Los códigos HS6 siguen la nomenclatura de cada año: un código eliminado en una revisión (p. ej. 150910 en HS2022) devuelve vacío en los años posteriores; eso NO es un error de la API.");
  working > 0 ? ok(`${working} combinaciones del sondeo devolvieron valores`) : bad("NINGUNA combinación del sondeo devolvió valores: pega la salida completa para diagnosticarlo");

  // 2) Consulta exacta del adaptador (importaciones) y 3) exportaciones españolas
  const q2 = await get(url({ freq: "A", reporter: "DE", partner: [world, "ES"], product: P, flow: "1", indicators: ["VALUE_IN_EUROS", "QUANTITY_IN_100KG"], time: YEAR }), "2) Consulta de importaciones como la del adaptador");
  if (q2) {
    const k = classify(q2);
    if (k === "data") {
      const n = Array.isArray(q2.json.value) ? q2.json.value.filter((v) => v !== null).length : Object.keys(q2.json.value ?? {}).length;
      n > 0 ? ok(`${n} celdas con valor`) : bad("Respuesta válida pero sin valores");
    } else if (k === "pending") note("Asíncrona: repite más tarde");
    else bad(`Resultado: ${k}. ${q2.json?.error?.label ?? ""}`);
  }
  const q3 = await get(url({ freq: "A", reporter: "ES", partner: world, product: P, flow: "2", indicators: "VALUE_IN_EUROS", time: YEAR }), "3) Exportaciones de España al mundo");
  if (q3) { const k = classify(q3); k === "data" ? (nValues(q3.json) > 0 ? ok(`Exportaciones de España: ${nValues(q3.json)} celdas con valor`) : bad("Exportaciones de España: respuesta válida pero SIN valores")) : k === "pending" ? note("Asíncrona: repite más tarde") : bad(`Resultado: ${k}. ${q3.json?.error?.label ?? ""}`); }

  const fails = results.filter(([t]) => t === "FAIL").length;
  console.log(`\nResumen: ${results.length - fails} correctas, ${fails} fallos.`);
  console.log(fails ? "→ Pega esta salida completa para corregir el adaptador." : "→ Los supuestos del adaptador coinciden con la API. Ejecuta la app con SMARTRADE_DATA_MODE=comext y q=220421.");
  return fails ? 1 : 0;
}

process.exitCode = await main();
