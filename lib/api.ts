import { SourceError } from "@/lib/sources/types";

export function errorResponse(e: unknown): Response {
  if (e instanceof SourceError) {
    console.error("[smartrade] fuente:", e.kind, e.status ?? "");
    const status = e.kind === "config" ? 400 : e.kind === "rate_limit" ? 429 : e.kind === "pending" ? 503 : 502;
    return Response.json({ error: e.message, kind: e.kind }, { status });
  }
  console.error("[smartrade] error interno:", e instanceof Error ? e.message : "desconocido");
  return Response.json({ error: "Error interno" }, { status: 500 });
}
