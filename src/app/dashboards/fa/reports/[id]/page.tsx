import { auth } from "@/auth";
import { redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import FAReportFormClient from "./FAReportFormClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  return (
    <AppShell
      email={session.user.email}
      role={(session.user as { role?: string }).role ?? ""}
      name={session.user.name ?? null}
    >
      <FAReportFormClient />
    </AppShell>
  );
}
