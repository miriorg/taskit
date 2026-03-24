import { ProjectService } from "@/lib/services";
import { toErrorResponse } from "@/lib/utils/api-error";
import { getExpectedRevision } from "@/lib/utils/request-revision";

export async function GET() {
  try {
    const projectService = new ProjectService();
    return Response.json(await projectService.list());
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const projectService = new ProjectService();
    return Response.json(await projectService.create(await request.json(), getExpectedRevision(request)), { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
