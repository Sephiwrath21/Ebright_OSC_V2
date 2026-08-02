import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { queryEbrightHrfs } from "@/lib/ebright-hrfs";
import AppShell from "@/app/components/AppShell";
import JustificationApprovalsView, {
  type ApprovalRow,
} from "@/app/components/JustificationApprovalsView";
import { ShieldAlert } from "lucide-react";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set([
  "superadmin", "super_admin", "admin", "ceo", "hr", "hod",
]);

export default async function JustificationApprovalsPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const me = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: { role: { select: { role_type: true } } },
  });

  const userEmail = session.user.email;
  const userName = session.user.name ?? null;
  const userRole = (session.user as { role?: string } | undefined)?.role ?? "USER";
  const roleType = me?.role?.role_type?.toLowerCase() ?? "";

  if (!ALLOWED_ROLES.has(roleType)) {
    return (
      <AppShell email={userEmail} role={userRole} name={userName}>
        <div className="min-h-full bg-slate-50 flex items-center justify-center p-8">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-rose-50 flex items-center justify-center mb-5">
              <ShieldAlert className="w-7 h-7 text-rose-600" aria-hidden="true" />
            </div>
            <h1 className="text-xl font-semibold text-slate-900">Restricted Access</h1>
            <p className="mt-2 text-sm text-slate-600">
              Attendance justifications are available to HR, HOD and admin roles only.
            </p>
            <Link
              href="/home"
              className="mt-6 inline-flex items-center h-10 px-4 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-all duration-200"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  let rows: ApprovalRow[] = [];
  try {
    const res = await queryEbrightHrfs<ApprovalRow>(
      `SELECT id::text,
              emp_no, emp_name, branch,
              to_char(just_date, 'YYYY-MM-DD') AS just_date,
              reason, status, source, justified_by, reviewed_by, review_note,
              to_char(reviewed_at, 'YYYY-MM-DD HH24:MI') AS reviewed_at
         FROM public.attendance_justification
        WHERE just_date >= (current_date - interval '60 days')
        ORDER BY (status = 'pending') DESC, just_date DESC, emp_name ASC`,
    );
    rows = res.rows;
  } catch {
    rows = [];
  }

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <JustificationApprovalsView rows={rows} />
    </AppShell>
  );
}
