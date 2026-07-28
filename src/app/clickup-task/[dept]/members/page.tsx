import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import DepartmentMembers from "@/app/components/DepartmentMembers";
import { getDepartment } from "@/lib/departments";
import { resolveAllowedDepartments } from "@/lib/department-access";
import { getDepartmentDataset } from "@/lib/clickup-api";

export const dynamic = "force-dynamic";

export default async function DepartmentMembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ dept: string }>;
  searchParams: Promise<{ member?: string }>;
}) {
  const { dept } = await params;
  const { member } = await searchParams;
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const department = getDepartment(dept);
  if (!department) notFound();

  const userEmail = session.user?.email ?? "";
  const userRole = (session.user as { role?: string } | undefined)?.role ?? "";
  const userName = session.user?.name ?? null;

  const allowed = await resolveAllowedDepartments(userEmail, userRole);
  if (!allowed.some((d) => d.slug === department.slug)) {
    redirect("/clickup-task");
  }

  const dataset = await getDepartmentDataset(department.slug);

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <DepartmentMembers
        departmentName={department.name}
        slug={department.slug}
        dataset={dataset}
        initialMember={member ?? null}
        userName={userName}
        userEmail={userEmail}
      />
    </AppShell>
  );
}
