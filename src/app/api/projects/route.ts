import { ProjectService } from "@/lib/services";
import { toErrorResponse } from "@/lib/utils/api-error";

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
    return Response.json(await projectService.create(await request.json()), { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
