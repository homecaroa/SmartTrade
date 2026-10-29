/** Descarga segura y respetuosa de una página pública: sin hosts internos, con robots.txt, tiempo y tamaño limitados. */
const UA = "SmarTradeBot/0.1 (investigacion academica de comercio internacional)";
const MAX_BYTES = 500_000;

export type FetchPageResult =
  | { ok: true; html: string; finalUrl: string }
  | { ok: false; reason: "blocked_host" | "robots" | "forbidden" | "http_error" | "not_html" | "too_large" | "timeout" | "network" | "bad_url" };

export function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h === "[::1]" || h === "::1" || h === "0.0.0.0") return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  return h.startsWith("[") || /^[0-9a-f:]+$/.test(h) && h.includes(":");
}

/** Reglas de robots.txt (RFC 9309, simplificado): el grupo propio o «*»; gana la coincidencia más larga; empate favorece Allow. */
export function robotsAllows(robotsTxt: string, path: string): boolean {
  const groups: { agents: string[]; rules: { allow: boolean; p: string }[] }[] = [];
  let cur: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const raw of robotsTxt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const i = line.indexOf(":");
    if (i < 0) continue;
    const k = line.slice(0, i).trim().toLowerCase();
    const v = line.slice(i + 1).trim();
    if (k === "user-agent") {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(v.toLowerCase());
      lastWasAgent = true;
    } else if ((k === "allow" || k === "disallow") && cur) {
      lastWasAgent = false;
      if (v) cur.rules.push({ allow: k === "allow", p: v });
    }
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && UA.toLowerCase().includes(a)));
  const use = mine.length ? mine : groups.filter((g) => g.agents.includes("*"));
  let best: { allow: boolean; len: number } | null = null;
  for (const g of use) for (const r of g.rules) {
    const pat = r.p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$");
    if (new RegExp("^" + pat).test(path) && (!best || r.p.length > best.len || (r.p.length === best.len && r.allow))) best = { allow: r.allow, len: r.p.length };
  }
  return best ? best.allow : true;
}

async function get(url: string, timeoutMs: number): Promise<Response> {
  return fetch(url, { headers: { "user-agent": UA, accept: "text/html,text/plain" }, redirect: "manual", signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
}

export async function fetchPageSafe(url: string, timeoutMs = 8000): Promise<FetchPageResult> {
  let u: URL;
  try { u = new URL(url); } catch { return { ok: false, reason: "bad_url" }; }
  try {
    let current = u;
    for (let hop = 0; hop < 4; hop++) {
      if (!/^https?:$/.test(current.protocol) || isBlockedHost(current.hostname)) return { ok: false, reason: "blocked_host" };
      const rob = await get(`${current.origin}/robots.txt`, 5000).catch(() => null);
      if (rob && rob.status >= 500) return { ok: false, reason: "robots" }; // inaccesible: se asume prohibido
      if (rob && rob.status === 200 && !robotsAllows(await rob.text(), current.pathname + current.search)) return { ok: false, reason: "robots" };
      const res = await get(current.toString(), timeoutMs);
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return { ok: false, reason: "http_error" };
        current = new URL(loc, current);
        continue;
      }
      // 401/403/429: la web rechaza lecturas automáticas (protección anti-bots). Se respeta: no se reintenta ni se cambia
      // de identidad. Se distingue de un error genérico porque la web SÍ existe y una persona puede comprobarla.
      if (res.status === 401 || res.status === 403 || res.status === 429) return { ok: false, reason: "forbidden" };
      if (!res.ok) return { ok: false, reason: "http_error" };
      if (!/text\/html|application\/xhtml/i.test(res.headers.get("content-type") ?? "")) return { ok: false, reason: "not_html" };
      if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) return { ok: false, reason: "too_large" };
      return { ok: true, html: (await res.text()).slice(0, MAX_BYTES), finalUrl: current.toString() };
    }
    return { ok: false, reason: "http_error" };
  } catch (e) {
    return { ok: false, reason: e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError") ? "timeout" : "network" };
  }
}
