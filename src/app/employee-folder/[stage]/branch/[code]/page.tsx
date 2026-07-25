import { auth } from "@/auth";
import { notFound, redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import EmployeeNamelistView from "@/app/components/EmployeeNamelistView";
import {
  filterStageByLocation,
  isEmployeeStage,
  listBranches,
  listEmployeeOverviewRows,
  listExitTypesByUserId,
} from "@/lib/employeeQueries";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ stage: string; code: string }>;
}

export default async function EmployeeFolderBranchNamelistPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const { stage, code } = await params;
  if (!isEmployeeStage(stage)) notFound();

  const [rows, branches] = await Promise.all([listEmployeeOverviewRows(), listBranches()]);
  const branch = branches.find((b) => b.code === code);
  if (!branch) notFound();

  const namelistRows = filterStageByLocation(rows, stage, "branch", code);
  const exitTypeByUserId =
    stage === "exit" ? await listExitTypesByUserId(namelistRows.map((r) => r.id)) : undefined;

  const userEmail = session.user.email;
  const userRole = (session.user as { role?: string }).role ?? "";
  const userName = session.user.name ?? null;

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <EmployeeNamelistView
        stage={stage}
        groupBy="branch"
        locationCode={code}
        locationName={branch.name}
        rows={namelistRows}
        exitTypeByUserId={exitTypeByUserId}
      />
    </AppShell>
  );
}
