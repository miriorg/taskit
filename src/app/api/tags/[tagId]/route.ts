import { TagService } from "@/lib/services";
import { ApiRouteError, toErrorResponse } from "@/lib/utils/api-error";
import { getExpectedRevision } from "@/lib/utils/request-revision";

type RouteContext = {
  params: Promise<{
    tagId: string;
  }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const tagService = new TagService();
    const { tagId } = await params;
    const tag = await tagService.get(tagId);

    if (!tag) {
      throw new ApiRouteError("Tag not found", 404, "not_found");
    }

    return Response.json(tag);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const tagService = new TagService();
    const { tagId } = await params;
    return Response.json(await tagService.update(tagId, await request.json(), getExpectedRevision(request)));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const tagService = new TagService();
    const { tagId } = await params;
    await tagService.delete(tagId, getExpectedRevision(request));
    return new Response(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
