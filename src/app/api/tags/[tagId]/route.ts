import { TagService } from "@/lib/services";
import { ApiRouteError, toErrorResponse } from "@/lib/utils/api-error";

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
    return Response.json(await tagService.update(tagId, await request.json()));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const tagService = new TagService();
    const { tagId } = await params;
    await tagService.delete(tagId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
