import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import AppShell from "@/app/components/AppShell";
import WorkingHoursEditorView, {
  type StaffOption,
  type ScheduleVersion,
} from "@/app/components/WorkingHoursEditorView";
import { ShieldAlert } from "lucide-react";
import { getVersionsForEmployment } from "@/lib/schedule-history";

export const dynamic = "force-dynamic";

const ALLOWED_ROLE_TYPES = new Set(["superadmin", "ceo", "hr"]);

interface PageProps {
  searchParams: Promise<{ staffId?: string }>;
}

export default async function WorkingHoursPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const me = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: { role: { select: { role_type: true } } },
  });
  const roleType = me?.role?.role_type?.toLowerCase() ?? "";
  const allowed = ALLOWED_ROLE_TYPES.has(roleType);

  const userEmail = session.user.email;
  const userName = session.user.name ?? null;
  const userRole = (session.user as { role?: string } | undefined)?.role ?? "USER";

  if (!allowed) {
    return (
      <AppShell email={userEmail} role={userRole} name={userName}>
        <div className="min-h-full bg-slate-50 flex items-center justify-center p-8">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-rose-50 flex items-center justify-center mb-5">
              <ShieldAlert className="w-7 h-7 text-rose-600" aria-hidden="true" />
            </div>
            <h1 className="text-xl font-semibold text-slate-900">Restricted Access</h1>
            <p className="mt-2 text-sm text-slate-600">
              The working-hours editor is available to HR, CEO, and superadmin roles only.
            </p>
            <Link
              href="/attendance"
              className="mt-6 inline-flex items-center h-10 px-4 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
            >
              Back to Attendance
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  // Local source of truth: active employments with a person attached.
  // Source: src/lib/schedule-history.ts now reads from this table.
  const employments = await prisma.employment.findMany({
    where: {
      status: "active",
      employee_id: { not: null },
      users: { status: "active", deleted_at: null },
    },
    orderBy: [{ branch: { branch_code: "asc" } }, { users: { user_profile: { full_name: "asc" } } }],
    select: {
      employment_id: true,
      employee_id: true,
      position: true,
      working_hours_json: true,
      branch: { select: { branch_code: true, branch_name: true } },
      users: { select: { user_profile: { select: { full_name: true } } } },
    },
  });

  const staff: StaffOption[] = employments.map((e) => ({
    id: e.employment_id,
    name: e.users.user_profile?.full_name ?? `Emp #${e.employment_id}`,
    branch: e.branch?.branch_code ?? null,
    employeeId: e.employee_id,
    position: e.position,
    currentSchedule:
      (e.working_hours_json as Record<string, unknown> | null) ?? null,
  }));

  const sp = await searchParams;
  const requestedId = sp.staffId ? Number(sp.staffId) : NaN;
  const selectedId = Number.isFinite(requestedId)
    ? staff.find((s) => s.id === requestedId)?.id ?? null
    : staff[0]?.id ?? null;

  const versions: ScheduleVersion[] = selectedId !== null
    ? await getVersionsForEmployment(selectedId)
    : [];

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <WorkingHoursEditorView
        staff={staff}
        selectedId={selectedId}
        versions={versions as unknown as ScheduleVersion[]}
      />
    </AppShell>
  );
}
