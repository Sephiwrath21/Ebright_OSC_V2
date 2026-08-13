import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import AppShell from "@/app/components/AppShell";
import AccountManagementView, {
  type AccountData,
} from "@/app/components/AccountManagementView";
import { ShieldAlert } from "lucide-react";

export const dynamic = "force-dynamic";

const ALLOWED_ROLE_TYPES = new Set(["superadmin", "ceo"]);

export default async function AccountManagementPage() {
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
        <div className="min-h-full bg-slate-50 flex items-center justify-center p-8 dark:bg-slate-950">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center dark:bg-slate-900 dark:border-slate-800">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-rose-50 flex items-center justify-center mb-5 dark:bg-rose-900">
              <ShieldAlert
                className="w-7 h-7 text-rose-600 dark:text-rose-300"
                aria-hidden="true"
              />
            </div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
              Restricted Access
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Account management is available to superadmin and CEO roles only.
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

  const [users, branches, departments, roles] = await Promise.all([
    prisma.users.findMany({
      where: { deleted_at: null },
      select: {
        user_id: true,
        email: true,
        status: true,
        last_login: true,
        created_at: true,
        role: { select: { role_id: true, role_type: true } },
        user_profile: { select: { full_name: true } },
        employment: {
          select: {
            position: true,
            branch: { select: { branch_id: true, branch_name: true } },
            department: {
              select: { department_id: true, department_name: true },
            },
          },
          take: 1,
        },
      },
      orderBy: [{ user_id: "asc" }],
    }),
    prisma.branch.findMany({
      select: { branch_id: true, branch_name: true },
      orderBy: { branch_name: "asc" },
    }),
    prisma.department.findMany({
      select: { department_id: true, department_name: true },
      orderBy: { department_name: "asc" },
    }),
    prisma.role.findMany({
      select: { role_id: true, role_type: true },
      orderBy: { role_id: "asc" },
    }),
  ]);

  const data: AccountData = {
    users: users.map((u) => ({
      user_id: u.user_id,
      email: u.email,
      full_name: u.user_profile?.full_name ?? null,
      role_id: u.role.role_id,
      role_type: u.role.role_type,
      status: u.status ?? "active",
      last_login: u.last_login ? u.last_login.toISOString() : null,
      created_at: u.created_at.toISOString(),
      branch_id: u.employment[0]?.branch?.branch_id ?? null,
      branch_name: u.employment[0]?.branch?.branch_name ?? null,
      department_id: u.employment[0]?.department?.department_id ?? null,
      department_name: u.employment[0]?.department?.department_name ?? null,
      position: u.employment[0]?.position ?? null,
    })),
    branches,
    departments,
    roles,
  };

  return (
    <AppShell email={userEmail} role={userRoleHeader} name={userName}>
      <AccountManagementView data={data} />
    </AppShell>
  );
}
