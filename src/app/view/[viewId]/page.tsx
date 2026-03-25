import { BootstrapService } from "@/lib/services";
import { getOptionalSession } from "@/lib/auth/session";
import { TaskWorkspaceClient } from "@/components/task/task-workspace-client";

type ViewPageProps = {
  params: Promise<{
    viewId: string;
  }>;
};

export default async function ViewPage({ params }: ViewPageProps) {
  const { viewId } = await params;
  const session = await getOptionalSession();

  if (session) {
    const bootstrapService = new BootstrapService();
    await bootstrapService.execute();
  }

  return <TaskWorkspaceClient viewId={viewId} />;
}
