import { auth } from "@/auth";
import { redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import EmployeeOverviewView from "@/app/components/EmployeeOverviewView";
import { listEmployeeOverviewRows, countEmployeeStages, getOverdueTaskCounts } from "@/lib/employeeQueries";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Employee Folder",
};

export default async function EmployeeFolderPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const rows = await listEmployeeOverviewRows();
  const counts = countEmployeeStages(rows);
  // Candidates (isCandidate) have a negative sentinel id, not a real
  // user_id — no Task Manager/hrfs account exists for them to look up.
  const overdueTaskCounts = await getOverdueTaskCounts(rows.filter((r) => !r.isCandidate).map((r) => r.id));

  const userEmail = session.user.email;
  const userRole = (session.user as { role?: string }).role ?? "";
  const userName = session.user.name ?? null;

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <EmployeeOverviewView rows={rows} counts={counts} userName={userName} overdueTaskCounts={overdueTaskCounts} />
    </AppShell>
  );
}
