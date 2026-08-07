// /task-manager/package-table — Branch Package Schedule grid (2026-08-07):
// Branches (rows) x Wed-Sun (columns), each cell a Package selector; see
// task-manager/data/branch-package-schedule.ts for the data layer this
// wires into.
//
// Access (2026-08-07 View/Edit tier split, see role-views.ts): mirrors
// template/page.tsx and package/page.tsx exactly — the View-tier gate is a
// side effect of the first fetch (listBranchPackageSchedule's own internal
// requireViewAccess), not a separate direct check. getMyRole and
// listBranchPackageSchedule are fetched together via Promise.all (both are
// needed regardless of outcome, so there's no reason to serialize them or
// have each independently re-derive the same View-tier gate); a genuine 403
// from either redirects to /task-manager, same three-way
// SetupPendingError/NoAccountError/generic-error card handling as the other
// two pages otherwise. Package Table's View tier matches Package's: Super
// Admin, elevated Operations/Optimisation dept-site, HOD, CEO, and Branch
// Manager.
//
// Edit tier (the only tier that can set/clear cells) is
// canManageTaskTemplateGroups(role) — same Edit tier as Template/Package —
// computed from the SAME `role` value the View-tier gate above already
// fetched (not fetched twice). `canEdit` is passed to
// BranchPackageScheduleGrid to gate rendering interactive controls at all
// (view-only viewers get plain text, no disabled-but-visible <select>) —
// the real enforcement is branch-package-schedule.ts's requireEditAccess on
// setBranchPackageScheduleCell.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { requireLiveSession } from "@/task-manager/action-session";
import AppShell from "@/app/components/AppShell";
import { canManageTaskTemplateGroups } from "@/task-manager/role-views";
import {
  getMyRole,
  listBranchPackageSchedule,
  setBranchPackageScheduleCell,
  FlowBridgeError,
  NoAccountError,
  SetupPendingError,
} from "@/task-manager/data";
import type { BranchPackageScheduleData, PackageTableWeekday } from "@/task-manager/data/branch-package-schedule";
import { BranchPackageScheduleGrid } from "@/task-manager/ui/branch-package-schedule-grid";
import type { ActionResult } from "@/task-manager/ui/types";
import {
  NoAccountCard,
  SetupPendingCard,
  TaskManagerErrorCard,
} from "@/task-manager/ui/status-cards";

export const dynamic = "force-dynamic";

const FALLBACK_MESSAGE = "Something went wrong — please try again";

export default async function TaskManagerPackageTablePage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  const su = session.user as { email: string; name?: string | null; role?: string };
  const email = su.email;

  let role: { role: string; department: string | null };
  let data: BranchPackageScheduleData;
  try {
    const [roleResult, dataResult] = await Promise.all([
      getMyRole(email),
      listBranchPackageSchedule(email),
    ]);
    role = roleResult;
    data = dataResult;
  } catch (err) {
    // Genuine "no View access" (403 from listBranchPackageSchedule's
    // requireViewAccess) bounces to /task-manager — everything else renders
    // in place, same as template/page.tsx and package/page.tsx.
    if (err instanceof FlowBridgeError && err.status === 403) redirect("/task-manager");
    let card;
    if (err instanceof SetupPendingError) {
      card = <SetupPendingCard />;
    } else if (err instanceof NoAccountError) {
      card = <NoAccountCard email={email} />;
    } else {
      card = (
        <TaskManagerErrorCard message={err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE} />
      );
    }
    return (
      <AppShell email={su.email} role={su.role} name={su.name}>
        <div className="mx-auto max-w-[1400px] p-6">{card}</div>
      </AppShell>
    );
  }

  async function setCell(
    branch: string,
    weekday: PackageTableWeekday,
    packageGroupId: string | null,
  ): Promise<ActionResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      await setBranchPackageScheduleCell(email, { branch, weekday, packageGroupId });
      revalidatePath("/task-manager/package-table");
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  return (
    <AppShell email={su.email} role={su.role} name={su.name}>
      <div className="mx-auto max-w-[1400px] p-6">
        <h1 className="text-2xl font-bold text-gray-900">Package Table</h1>
        <div className="mt-6">
          <BranchPackageScheduleGrid
            data={data}
            canEdit={canManageTaskTemplateGroups(role)}
            onSetCell={setCell}
          />
        </div>
      </div>
    </AppShell>
  );
}
