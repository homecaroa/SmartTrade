import { errorResponse } from "@/lib/api";
import { getConfig } from "@/lib/config";
import { idSchema } from "@/lib/schemas/query";
import { getOpportunityDetail } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) return Response.json({ error: "Identificador inválido" }, { status: 400 });
  const q = new URL(req.url).searchParams.get("q") ?? undefined;
  try {
    const d = await getOpportunityDetail(id, q?.slice(0, 80), getConfig(process.env, new URL(req.url).searchParams.get("fuente") ?? undefined));
    return d ? Response.json(d) : Response.json({ error: "Oportunidad no encontrada" }, { status: 404 });
  } catch (e) {
    return errorResponse(e);
  }
}
