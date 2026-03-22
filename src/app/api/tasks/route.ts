import { TaskService } from "@/lib/services";
import { toErrorResponse } from "@/lib/utils/api-error";
import { getExpectedRevision } from "@/lib/utils/request-revision";

export async function GET(request: Request) {
  try {
    const taskService = new TaskService();
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId") ?? undefined;

    return Response.json(await taskService.list(projectId));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const taskService = new TaskService();
    return Response.json(await taskService.create(await request.json(), { expectedRevision: getExpectedRevision(request) }), { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
