import { PostgresBootstrapService } from "@/lib/services";
import { getOptionalSession } from "@/lib/auth/session";
import { TaskWorkspaceClient } from "@/components/task/task-workspace-client";

type ProjectPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { projectId } = await params;
  const session = await getOptionalSession();

  if (session) {
    const bootstrapService = new PostgresBootstrapService();
    await bootstrapService.execute();
  }

  return <TaskWorkspaceClient projectId={projectId} />;
}
