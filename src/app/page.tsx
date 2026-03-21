import Link from "next/link";
import { redirect } from "next/navigation";

import { getOptionalSession } from "@/lib/auth/session";
import { BootstrapService } from "@/lib/services";

export default async function HomePage() {
  const session = await getOptionalSession();

  if (session) {
    const bootstrapService = new BootstrapService();
    await bootstrapService.execute();
    redirect("/inbox");
  }

  return (
    <main>
      <h1>Taskit</h1>
      <p>Google でログインしてタスク管理を開始します。</p>
      <Link href="/api/auth/signin">Sign in with Google</Link>
    </main>
  );
}
