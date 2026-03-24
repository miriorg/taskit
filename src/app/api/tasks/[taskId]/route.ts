import { TaskService } from "@/lib/services";
import { ApiRouteError, toErrorResponse } from "@/lib/utils/api-error";
import { getExpectedRevision } from "@/lib/utils/request-revision";

type RouteContext = {
  params: Promise<{
    taskId: string;
  }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const taskService = new TaskService();
    const { taskId } = await params;
    const task = await taskService.get(taskId);

    if (!task) {
      throw new ApiRouteError("Task not found", 404, "not_found");
    }

    return Response.json(task);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const taskService = new TaskService();
    const { taskId } = await params;
    return Response.json(await taskService.update(taskId, await request.json(), { expectedRevision: getExpectedRevision(request) }));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const taskService = new TaskService();
    const { taskId } = await params;
    await taskService.delete(taskId, { expectedRevision: getExpectedRevision(request) });
    return new Response(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
