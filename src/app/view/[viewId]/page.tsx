import { TaskWorkspaceClient } from "@/components/task/task-workspace-client";

type ViewPageProps = {
  params: Promise<{
    viewId: string;
  }>;
};

export default async function ViewPage({ params }: ViewPageProps) {
  const { viewId } = await params;

  return <TaskWorkspaceClient viewId={viewId} />;
}
