import { ViewService } from "@/lib/services";
import { toErrorResponse } from "@/lib/utils/api-error";

type RouteContext = {
  params: Promise<{
    viewId: string;
  }>;
};

export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const viewService = new ViewService();
    const { viewId } = await params;
    const requestBody = await _request.text();
    const payload = requestBody ? (JSON.parse(requestBody) as { query?: string }) : undefined;
    return Response.json(await viewService.query(viewId, payload));
  } catch (error) {
    return toErrorResponse(error);
  }
}
