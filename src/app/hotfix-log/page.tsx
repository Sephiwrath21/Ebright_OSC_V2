import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { buildAccess } from "@/lib/access/engine";
import AppShell from "@/app/components/AppShell";
import HotfixLogView from "./HotfixLogView";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Hotfix · Ebright HR System",
};

export default async function HotfixLogPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const access = await buildAccess(session.user.email);
  if (!access) redirect("/login");

  // Superadmin only — ACTION_CEILINGS makes can() return isSuper for every
  // hotfix_log action, ahead of the CEO view short-circuit. The sidebar hides
  // the link for everyone else, but this is the gate that matters.
  if (!access.can("hotfix_log", "view")) redirect("/home");

  return (
    <AppShell
      email={session.user.email}
      role={(session.user as { role?: string } | undefined)?.role ?? ""}
      name={session.user?.name ?? null}
    >
      {/* Entries come from commits; the only thing a person does here is
          curate — reword a title or hide an entry. */}
      <HotfixLogView canCurate={access.can("hotfix_log", "update")} />
    </AppShell>
  );
}
