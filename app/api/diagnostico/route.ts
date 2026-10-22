import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";

/**
 * Diagnóstico TEMPORAL de conectividad con Eurostat desde el servidor (p. ej. Vercel). No devuelve secretos:
 * solo estado HTTP, algunas cabeceras públicas y los primeros caracteres del cuerpo. Eliminar tras resolver el problema.
 */
export const dynamic = "force-dynamic";

async function probe(label: string, url: string, headers?: Record<string, string>) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(20_000) });
    const body = (await res.text()).replace(/\s+/g, " ").slice(0, 300);
    return {
      label, status: res.status, ms: Date.now() - t0,
      contentType: res.headers.get("content-type"), server: res.headers.get("server"),
      via: res.headers.get("via"), bodyStart: body,
    };
  } catch (e) {
    return { label, error: e instanceof Error ? `${e.name}: ${e.message}` : "error desconocido", ms: Date.now() - t0 };
  }
}

export async function GET() {
  const cfg = getConfig();
  const base = `${cfg.comextBase.replace(/\/$/, "")}/${cfg.comextDataset}`;
  const mini = `${base}?format=JSON&lang=EN&freq=A&reporter=ES&partner=WORLD&product=220421&flow=2&indicators=VALUE_IN_EUROS&time=2023`;
  const multi = `${base}?format=JSON&lang=EN&freq=A&reporter=DE&reporter=FR&reporter=IT&partner=WORLD&partner=ES&product=220421&flow=1&indicators=VALUE_IN_EUROS&indicators=QUANTITY_IN_100KG&time=2022&time=2023&time=2024`;
  const results = [
    await probe("1) mínima, sin cabeceras propias", mini),
    await probe("2) mínima, con User-Agent de SmarTrade", mini, { accept: "application/json", "user-agent": "SmarTrade/0.1 (proyecto académico de comercio internacional)" }),
    await probe("3) multi-país como la app, sin cabeceras propias", multi),
  ];
  return NextResponse.json({
    mode: cfg.mode,
    region: process.env.VERCEL_REGION ?? null,
    node: process.version,
    results,
  });
}
