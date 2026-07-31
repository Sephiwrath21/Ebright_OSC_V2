import { auth } from "@/auth";
import { notFound, redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import EmployeeNamelistView from "@/app/components/EmployeeNamelistView";
import ExitListView from "@/app/components/ExitListView";
import {
  filterStageByLocation,
  isEmployeeStage,
  listBranches,
  listEmployeeOverviewRows,
  listResignationExitTypesByUserId,
  listLastWorkingDatesByUserId,
  getOverdueTaskCounts,
} from "@/lib/employeeQueries";
import { getCurrentEmployeeScope } from "@/lib/employeeScope";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ stage: string; code: string }>;
}

export default async function EmployeeFolderBranchNamelistPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const { stage, code } = await params;
  if (!isEmployeeStage(stage)) notFound();

  // Block direct-URL access to another branch's namelist for a scoped
  // account — this account's own scope key isn't "this branch" (either
  // they're department-scoped, branch-scoped to a different branch, or
  // scoped to nothing), so there's nothing here for them to legitimately
  // browse to, not just an empty list.
  const scope = await getCurrentEmployeeScope();
  if (!scope) redirect("/login");
  if (!scope.fullAccess && scope.branchCode !== code) notFound();

  const [rows, branches] = await Promise.all([listEmployeeOverviewRows(), listBranches()]);
  const branch = branches.find((b) => b.code === code);
  if (!branch) notFound();

  const namelistRows = filterStageByLocation(rows, stage, "branch", code);
  const [exitTypeByUserId, lastWorkingDateByUserId] =
    stage === "exit"
      ? await Promise.all([
          listResignationExitTypesByUserId(namelistRows.map((r) => r.id)),
          listLastWorkingDatesByUserId(namelistRows.map((r) => r.id)),
        ])
      : [undefined, undefined];
  const overdueTaskCounts = await getOverdueTaskCounts(namelistRows.map((r) => r.id));

  const userEmail = session.user.email;
  const userRole = (session.user as { role?: string }).role ?? "";
  const userName = session.user.name ?? null;

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      {stage === "exit" ? (
        <ExitListView
          rows={namelistRows}
          exitTypeByUserId={exitTypeByUserId}
          lastWorkingDateByUserId={lastWorkingDateByUserId}
          showLocation={false}
          locationContext={{ groupBy: "branch", code, name: branch.name }}
          overdueTaskCounts={overdueTaskCounts}
        />
      ) : (
        <EmployeeNamelistView
          stage={stage}
          groupBy="branch"
          locationCode={code}
          locationName={branch.name}
          rows={namelistRows}
          overdueTaskCounts={overdueTaskCounts}
        />
      )}
    </AppShell>
  );
}
