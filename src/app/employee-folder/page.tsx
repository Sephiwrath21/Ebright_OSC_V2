import { auth } from "@/auth";
import { redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import EmployeeOverviewView from "@/app/components/EmployeeOverviewView";
import { getCurrentEmployeeScope } from "@/lib/employeeScope";
import { getEmployeeOverviewData } from "@/lib/careerApplicationSync";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Employee Folder",
};

export default async function EmployeeFolderPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  // Individual staff logins (ownUserId scope) skip this dashboard entirely —
  // straight to their own Employee Record (the same consolidated Personal
  // Info/HR Info/Finance/Active Employment/Disciplinary/Task view every
  // "Employee Records" table row links to — see EmployeeOverviewView.tsx —
  // not the stage-flow profile template), same as clicking any stage nav
  // link (see [stage]/page.tsx). /employee-record/[id] already applies this
  // same ownUserId scope check itself (via getEmployeeOverviewRowById), so
  // there's nothing more to validate here before redirecting. A dashboard
  // of cards/records showing just one row isn't a meaningful landing page
  // for an individual login anyway. Checked here, before the heavier
  // getEmployeeOverviewData() call below, so a staff login redirects
  // immediately instead of paying for a computation it'll never render.
  const scope = await getCurrentEmployeeScope();
  if (scope?.ownUserId != null) redirect(`/employee-record/${scope.ownUserId}`);

  const { rows, counts, overdueTaskCounts, probationReminders } = await getEmployeeOverviewData();

  const userEmail = session.user.email;
  const userRole = (session.user as { role?: string }).role ?? "";
  const userName = session.user.name ?? null;

  // CEO-only "view my own profile" shortcut (2026-08-28, see conversation) —
  // fresh DB lookup, not session.user.role, same reasoning as canEditProfile
  // (a session issued before this account's role existed would otherwise
  // silently carry an empty role). CEO's own scope is fullAccess with
  // ownUserId: null (see employeeScope.ts), so unlike a plain staff login
  // they never redirect straight to their own record above — this gives
  // them a way to jump there anyway while still browsing everyone else.
  const me = await prisma.users.findUnique({
    where: { email: userEmail },
    select: { user_id: true, role: { select: { role_type: true } } },
  });
  const ceoOwnUserId = me?.role?.role_type?.toLowerCase() === "ceo" ? me.user_id : null;

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <EmployeeOverviewView
        rows={rows}
        counts={counts}
        userName={userName}
        overdueTaskCounts={overdueTaskCounts}
        probationReminderNames={probationReminders.map((r) => ({ name: r.fullName, endDate: r.endDate }))}
        ceoOwnUserId={ceoOwnUserId}
      />
    </AppShell>
  );
}
