import { errorResponse } from "@/lib/api";
import { getFilters } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(getFilters());
  } catch (e) {
    return errorResponse(e);
  }
}
