import { redirect } from "next/navigation";

import { TestDataGeneratorClient } from "@/components/settings/test-data-generator-client";
import { getOptionalSession } from "@/lib/auth/session";

export default async function SettingsPage() {
  const session = await getOptionalSession();

  if (!session) {
    redirect("/api/auth/signin");
  }

  return <TestDataGeneratorClient />;
}
