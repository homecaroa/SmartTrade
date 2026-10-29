import { errorResponse } from "@/lib/api";
import { buyersToCsv } from "@/lib/buyers/csv";
import { filterCompanies } from "@/lib/buyers/rules";
import { searchBuyers, validateBuyerQuery } from "@/lib/buyers/service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const p = new URL(req.url).searchParams;
    const v = validateBuyerQuery({ hs6: p.get("hs") ?? "", country: p.get("pais") ?? "", keywords: p.get("kw") ?? "" });
    if (!v.ok) return Response.json({ error: v.error }, { status: 400 });
    const r = await searchBuyers(v.query);
    const filtered = { ...r, companies: filterCompanies(r.companies, { tipo: p.get("tipo") ?? undefined, nivel: p.get("nivel") ?? undefined }) };
    return new Response(buyersToCsv(filtered), {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="importadores-${v.query.hs6}-${v.query.country}.csv"` },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
