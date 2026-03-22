import { ViewService } from "@/lib/services";
import { toErrorResponse } from "@/lib/utils/api-error";
import { getExpectedRevision } from "@/lib/utils/request-revision";

export async function GET() {
  try {
    const viewService = new ViewService();
    return Response.json(await viewService.list());
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const viewService = new ViewService();
    return Response.json(await viewService.create(await request.json(), getExpectedRevision(request)), { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
