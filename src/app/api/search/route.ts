import { TaskService } from "@/lib/services";
import { toErrorResponse } from "@/lib/utils/api-error";

export async function GET(request: Request) {
  try {
    const taskService = new TaskService();
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query") ?? undefined;
    const projectId = searchParams.get("projectId") ?? undefined;
    const tagIds = searchParams.getAll("tagId");
    const includeCompleted = searchParams.get("includeCompleted") === "true";

    return Response.json(
      await taskService.list({
        projectId,
        query,
        tagIds,
        includeCompleted,
      }),
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
