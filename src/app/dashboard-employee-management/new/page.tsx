import { auth } from "@/auth";
import { redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import EmployeeForm from "@/app/components/EmployeeForm";
import { listBranches, listDepartments } from "@/lib/employeeQueries";
import { listInductionEligibleEmployees } from "@/app/induction/queries";
import { createEmployee } from "@/app/dashboard-employee-management/actions";

export default async function AddEmployeePage() {
  const session = await auth();
  
  if (!session) redirect("/login");

  const [branches, departments, buddyOptions] = await Promise.all([
    listBranches(),
    listDepartments(),
    listInductionEligibleEmployees(),
  ]);

  const userEmail = session.user?.email ?? "";
  const userRole = (session.user as { role?: string } | undefined)?.role ?? "";
  const userName = session.user?.name ?? null;

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <EmployeeForm
        branches={branches}
        departments={departments}
        mode="create"
        action={createEmployee}
        buddyOptions={buddyOptions}
      />
    </AppShell>
  );
}
