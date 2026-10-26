import { errorResponse } from "@/lib/api";
import { getConfig } from "@/lib/config";
import { parseQuery } from "@/lib/schemas/query";
import { getRanking } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const parsed = parseQuery(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return Response.json({ error: "Parámetros inválidos", issues: parsed.error.issues.map((i) => i.path.join(".") + ": " + i.message) }, { status: 400 });
  try {
    return Response.json(await getRanking(parsed.data, getConfig(process.env, parsed.data.fuente)));
  } catch (e) {
    return errorResponse(e);
  }
}
