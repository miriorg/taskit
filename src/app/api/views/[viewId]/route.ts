import { ViewService } from "@/lib/services";
import { ApiRouteError, toErrorResponse } from "@/lib/utils/api-error";
import { getExpectedRevision } from "@/lib/utils/request-revision";

type RouteContext = {
  params: Promise<{
    viewId: string;
  }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const viewService = new ViewService();
    const { viewId } = await params;
    const view = await viewService.get(viewId);

    if (!view) {
      throw new ApiRouteError("View not found", 404, "not_found");
    }

    return Response.json(view);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const viewService = new ViewService();
    const { viewId } = await params;
    return Response.json(await viewService.update(viewId, await request.json(), getExpectedRevision(request)));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const viewService = new ViewService();
    const { viewId } = await params;
    await viewService.delete(viewId, getExpectedRevision(request));
    return new Response(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
