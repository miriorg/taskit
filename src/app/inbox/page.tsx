import { PostgresBootstrapService } from "@/lib/services";
import { getOptionalSession } from "@/lib/auth/session";
import { TaskWorkspaceClient } from "@/components/task/task-workspace-client";

export default async function InboxPage() {
  const session = await getOptionalSession();

  if (session) {
    const bootstrapService = new PostgresBootstrapService();
    await bootstrapService.execute();
  }

  return <TaskWorkspaceClient />;
}
