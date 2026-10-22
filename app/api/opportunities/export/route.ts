import { errorResponse } from "@/lib/api";
import { parseQuery } from "@/lib/schemas/query";
import { getFullRanking } from "@/lib/service";
import { opportunitiesToCsv } from "@/lib/trade/csv";

export const dynamic = "force-dynamic";
const MAX_ROWS = 5000;

export async function GET(req: Request) {
  const parsed = parseQuery(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return Response.json({ error: "Parámetros inválidos" }, { status: 400 });
  try {
    const { ranked } = await getFullRanking(parsed.data);
    return new Response(opportunitiesToCsv(ranked.slice(0, MAX_ROWS)), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="smartrade-oportunidades.csv"' },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
