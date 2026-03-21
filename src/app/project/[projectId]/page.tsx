import { TaskWorkspaceClient } from "@/components/task/task-workspace-client";

type ProjectPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { projectId } = await params;

  return <TaskWorkspaceClient projectId={projectId} />;
}
