import type { ReactNode } from "react";

export function AppShell({ sidebar, children, detail }: { sidebar?: ReactNode; children: ReactNode; detail?: ReactNode }) {
  return (
    <div>
      <aside>{sidebar}</aside>
      <main>{children}</main>
      <section>{detail}</section>
    </div>
  );
}
