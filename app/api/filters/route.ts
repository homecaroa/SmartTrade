import { errorResponse } from "@/lib/api";
import { getConfig } from "@/lib/config";
import { getFilters } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const fuente = new URL(req.url).searchParams.get("fuente") ?? undefined;
    return Response.json(getFilters(getConfig(process.env, fuente)));
  } catch (e) {
    return errorResponse(e);
  }
}
