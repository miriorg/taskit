import { TagService } from "@/lib/services";
import { toErrorResponse } from "@/lib/utils/api-error";

export async function GET() {
  try {
    const tagService = new TagService();
    return Response.json(await tagService.list());
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const tagService = new TagService();
    return Response.json(await tagService.create(await request.json()), { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
