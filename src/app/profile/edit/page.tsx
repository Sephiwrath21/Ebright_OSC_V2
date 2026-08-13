import { auth } from "@/auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import AppShell from "@/app/components/AppShell";
import EmployeeForm from "@/app/components/EmployeeForm";
import { getEmployeeById, listBranches, listDepartments } from "@/lib/employeeQueries";
import { updateMyProfile } from "@/app/profile/actions";

export const dynamic = "force-dynamic";

export default async function EditMyProfilePage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const me = await prisma.users.findUnique({
    where: { email: session.user.email },
    include: { role: true },
  });
  if (!me) redirect("/login");
  if (me.role.role_type !== "staff") redirect("/profile");

  const [employee, branches, departments] = await Promise.all([
    getEmployeeById(me.user_id),
    listBranches(),
    listDepartments(),
  ]);

  const userEmail = me.email;
  const userRole = me.role.role_type;
  const userName = session.user.name ?? null;

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      {employee ? (
        <EmployeeForm
          branches={branches}
          departments={departments}
          mode="edit"
          employee={employee}
          action={updateMyProfile}
          isSelfEdit
        />
      ) : (
        <div className="min-h-full bg-slate-50 dark:bg-slate-950">
          <div className="max-w-xl mx-auto px-6 py-24 text-center">
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Profile not found</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">We couldn&apos;t load your profile right now.</p>
            <Link
              href="/profile"
              className="mt-6 inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              Back to Profile
            </Link>
          </div>
        </div>
      )}
    </AppShell>
  );
}
