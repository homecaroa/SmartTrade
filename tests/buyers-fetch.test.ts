import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPageSafe, isBlockedHost, robotsAllows } from "@/lib/buyers/fetch-page";

afterEach(() => vi.restoreAllMocks());
const html = (body: string, init: ResponseInit = {}) => new Response(body, { status: 200, headers: { "content-type": "text/html" }, ...init });

describe("hosts bloqueados (SSRF)", () => {
  it("bloquea localhost, redes privadas y enlace local; permite dominios públicos", () => {
    for (const h of ["localhost", "127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.0.1", "169.254.169.254", "0.0.0.0", "servidor.local", "[::1]"]) expect(isBlockedHost(h)).toBe(true);
    for (const h of ["example.com", "www.empresa.co.jp", "8.8.8.8", "172.32.0.1"]) expect(isBlockedHost(h)).toBe(false);
  });
});

describe("robots.txt", () => {
  it("respeta Disallow, gana la regla más específica y el grupo propio sobre «*»", () => {
    const r = "User-agent: *\nDisallow: /privado/\nAllow: /privado/publico\n";
    expect(robotsAllows(r, "/privado/x")).toBe(false);
    expect(robotsAllows(r, "/privado/publico/a")).toBe(true);
    expect(robotsAllows(r, "/otra")).toBe(true);
    expect(robotsAllows("User-agent: SmarTradeBot\nDisallow: /\n\nUser-agent: *\nAllow: /\n", "/x")).toBe(false);
    expect(robotsAllows("User-agent: *\nDisallow:\n", "/x")).toBe(true);
  });
});

describe("fetchPageSafe", () => {
  it("una web que rechaza robots (401/403/429) se distingue de un error genérico y se lee una sola vez", async () => {
    for (const status of [401, 403, 429]) {
      const f = vi.spyOn(globalThis, "fetch").mockImplementation(async (u) => String(u).endsWith("/robots.txt") ? new Response("", { status: 404 }) : new Response("no", { status }));
      expect(await fetchPageSafe("https://empresa.test/")).toEqual({ ok: false, reason: "forbidden" });
      expect(f.mock.calls.filter(([u]) => !String(u).endsWith("/robots.txt"))).toHaveLength(1);
      f.mockRestore();
    }
    vi.spyOn(globalThis, "fetch").mockImplementation(async (u) => String(u).endsWith("/robots.txt") ? new Response("", { status: 404 }) : new Response("x", { status: 404 }));
    expect(await fetchPageSafe("https://empresa.test/")).toEqual({ ok: false, reason: "http_error" });
  });
  it("no hace ninguna petición a hosts internos", async () => {
    const f = vi.spyOn(globalThis, "fetch");
    expect(await fetchPageSafe("http://127.0.0.1/admin")).toEqual({ ok: false, reason: "blocked_host" });
    expect(await fetchPageSafe("ftp://x.test/")).toMatchObject({ ok: false });
    expect(f).not.toHaveBeenCalled();
  });
  it("respeta robots.txt: prohibido o inaccesible (5xx) no se descarga", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockImplementation(async (u) => String(u).endsWith("/robots.txt") ? new Response("User-agent: *\nDisallow: /", { status: 200 }) : html("x"));
    expect(await fetchPageSafe("https://empresa.test/a")).toEqual({ ok: false, reason: "robots" });
    expect(f).toHaveBeenCalledTimes(1);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (u) => String(u).endsWith("/robots.txt") ? new Response("", { status: 503 }) : html("x"));
    expect(await fetchPageSafe("https://empresa.test/a")).toEqual({ ok: false, reason: "robots" });
  });
  it("descarga HTML permitido y descarta lo que no es HTML", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (u) => String(u).endsWith("/robots.txt") ? new Response("", { status: 404 }) : html("<p>hola</p>"));
    expect(await fetchPageSafe("https://empresa.test/a")).toMatchObject({ ok: true, html: "<p>hola</p>" });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (u) => String(u).endsWith("/robots.txt") ? new Response("", { status: 404 }) : new Response("%PDF", { status: 200, headers: { "content-type": "application/pdf" } }));
    expect(await fetchPageSafe("https://empresa.test/a.pdf")).toEqual({ ok: false, reason: "not_html" });
  });
  it("no sigue redirecciones hacia hosts internos", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (u) => String(u).endsWith("/robots.txt") ? new Response("", { status: 404 }) : new Response("", { status: 302, headers: { location: "http://169.254.169.254/latest" } }));
    expect(await fetchPageSafe("https://empresa.test/a")).toEqual({ ok: false, reason: "blocked_host" });
  });
  it("rechaza respuestas demasiado grandes", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (u) => String(u).endsWith("/robots.txt") ? new Response("", { status: 404 }) : html("x", { headers: { "content-type": "text/html", "content-length": "9999999" } }));
    expect(await fetchPageSafe("https://empresa.test/a")).toEqual({ ok: false, reason: "too_large" });
  });
});
