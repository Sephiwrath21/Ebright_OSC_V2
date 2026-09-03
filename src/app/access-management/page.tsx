import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import AppShell from "@/app/components/AppShell";
import AccessManagementView from "@/app/components/AccessManagementView";
import { ROLE_OPTIONS } from "@/lib/employeeQueries";
import { ShieldAlert } from "lucide-react";

export const dynamic = "force-dynamic";

const ALLOWED_ROLE_TYPES = new Set(["superadmin", "ceo"]);

export default async function AccessManagementPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const me = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: {
      user_id: true,
      email: true,
      role: { select: { role_type: true } },
    },
  });

  const userEmail = session.user.email;
  const userName = session.user.name ?? null;
  const userRoleHeader =
    (session.user as { role?: string } | undefined)?.role ?? "USER";

  const roleType = me?.role?.role_type?.toLowerCase() ?? "";
  if (!ALLOWED_ROLE_TYPES.has(roleType)) {
    return (
      <AppShell email={userEmail} role={userRoleHeader} name={userName}>
        <div className="min-h-full bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-8">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center dark:bg-slate-900 dark:border-slate-800 dark:ring-1 dark:ring-white/10">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-rose-50 flex items-center justify-center mb-5 dark:bg-rose-900">
              <ShieldAlert className="w-7 h-7 text-rose-600 dark:text-rose-300" aria-hidden="true" />
            </div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
              Restricted Access
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Access management is available to superadmin and CEO roles only.
            </p>
            <Link
              href="/home"
              className="mt-6 inline-flex items-center h-10 px-4 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-all duration-200 dark:bg-slate-700 dark:hover:bg-slate-600"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  // Live roles from the DB — the matrix dropdown reflects whatever is actually
  // in the `role` table (superadmin is excluded in the view as always-full).
  const [roles, departments] = await Promise.all([
    prisma.role.findMany({
      select: { role_id: true, role_type: true },
      orderBy: { role_id: "asc" },
    }),
    prisma.department.findMany({
      select: { department_id: true, department_code: true, department_name: true },
      orderBy: { department_name: "asc" },
    }),
  ]);

  // Only superadmin may edit; CEO (and anyone else with view) sees it read-only.
  const canEdit = roleType === "superadmin";

  return (
    <AppShell email={userEmail} role={userRoleHeader} name={userName}>
      <AccessManagementView
        roles={roles}
        departments={departments}
        positions={[...ROLE_OPTIONS]}
        canEdit={canEdit}
      />
    </AppShell>
  );
}
