// /task-manager/package-table — placeholder (2026-08-06). Sidebar sub-item
// under Task Manager; label "Package Table" is a temporary placeholder name
// per the user, content and final naming to be specified separately.
//
// Access (2026-08-07 View/Edit tier split, see role-views.ts): this page has
// no data model of its own yet, so — unlike template/page.tsx and
// package/page.tsx, whose View-tier gate is a side effect of their first
// data fetch (listTemplateGroups's requireGroupViewAccess) — the View-tier
// check here is done directly via getMyRole + taskManagerNavAccess. Package
// Table's View tier matches Package's: Super Admin, elevated
// Operations/Optimisation dept-site, HOD, CEO, and Branch Manager. Same
// three-way SetupPendingError/NoAccountError/generic-error card handling as
// the other two pages for the getMyRole call itself.
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import AppShell from "@/app/components/AppShell";
import { taskManagerNavAccess } from "@/task-manager/role-views";
import { getMyRole, FlowBridgeError, NoAccountError, SetupPendingError } from "@/task-manager/data";
import {
  NoAccountCard,
  SetupPendingCard,
  TaskManagerErrorCard,
} from "@/task-manager/ui/status-cards";

export const dynamic = "force-dynamic";

const FALLBACK_MESSAGE = "Something went wrong — please try again";

export default async function TaskManagerPackageTablePage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  const su = session.user as { email: string; name?: string | null; role?: string };
  const email = su.email;

  let role: { role: string; department: string | null };
  try {
    role = await getMyRole(email);
  } catch (err) {
    let card;
    if (err instanceof SetupPendingError) {
      card = <SetupPendingCard />;
    } else if (err instanceof NoAccountError) {
      card = <NoAccountCard email={email} />;
    } else {
      card = (
        <TaskManagerErrorCard message={err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE} />
      );
    }
    return (
      <AppShell email={su.email} role={su.role} name={su.name}>
        <div className="mx-auto max-w-[1400px] p-6">{card}</div>
      </AppShell>
    );
  }

  // Genuine "account exists but has no View access to Package Table" bounces
  // to /task-manager — everything else (setup pending, no account, other
  // errors) renders its status card in place above.
  if (!taskManagerNavAccess(role).packageTable) redirect("/task-manager");

  // When real content replaces this placeholder, gate its create/edit/
  // delete actions behind canManageTaskTemplateGroups(role) — same Edit
  // tier as Template/Package (see role-views.ts).

  return (
    <AppShell email={su.email} role={su.role} name={su.name}>
      <div className="mx-auto max-w-[1400px] p-6">
        <h1 className="text-2xl font-bold">Package Table</h1>
        <p className="mt-2 text-sm text-gray-500">Coming soon.</p>
      </div>
    </AppShell>
  );
}
