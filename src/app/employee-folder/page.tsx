import { auth } from "@/auth";
import { redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import EmployeeOverviewView from "@/app/components/EmployeeOverviewView";
import { getCurrentEmployeeScope } from "@/lib/employeeScope";
import { getEmployeeOverviewData } from "@/lib/careerApplicationSync";

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

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <EmployeeOverviewView
        rows={rows}
        counts={counts}
        userName={userName}
        overdueTaskCounts={overdueTaskCounts}
        probationReminderNames={probationReminders.map((r) => ({ name: r.fullName, endDate: r.endDate }))}
      />
    </AppShell>
  );
}
