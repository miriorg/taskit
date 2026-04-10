import { PostgresProjectService } from "@/lib/services";
import { ApiRouteError, toErrorResponse } from "@/lib/utils/api-error";
import { getExpectedRevision } from "@/lib/utils/request-revision";

type RouteContext = {
  params: Promise<{
    projectId: string;
  }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const projectService = new PostgresProjectService();
    const { projectId } = await params;
    const project = await projectService.get(projectId);

    if (!project) {
      throw new ApiRouteError("Project not found", 404, "not_found");
    }

    return Response.json(project);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const projectService = new PostgresProjectService();
    const { projectId } = await params;
    return Response.json(await projectService.update(projectId, await request.json(), getExpectedRevision(request)));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const projectService = new PostgresProjectService();
    const { projectId } = await params;
    return Response.json(await projectService.delete(projectId));
  } catch (error) {
    return toErrorResponse(error);
  }
}
