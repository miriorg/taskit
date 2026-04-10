import { PostgresTaskService } from "@/lib/services";
import { toErrorResponse } from "@/lib/utils/api-error";
import { getExpectedRevision } from "@/lib/utils/request-revision";

export async function GET(request: Request) {
  try {
    const taskService = new PostgresTaskService();
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId") ?? undefined;
    const includeProjectDescendants = searchParams.get("includeProjectDescendants") === "true";

    return Response.json(await taskService.list({ projectId, includeProjectDescendants }));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const taskService = new PostgresTaskService();
    return Response.json(await taskService.create(await request.json()), { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
