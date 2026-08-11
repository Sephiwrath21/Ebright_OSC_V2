// Branch Package Schedule (2026-08-07): the Package Table page's data
// layer — a durable (branch, weekday) → Package config, backed by
// automatic recurring task assignment via the existing engine. See
// BranchPackageSchedule's schema comment for the model. Deliberately
// separate from template-groups.ts's applyTemplateGroup/listTemplateGroups
// (which are per-creator-owned, createdById-scoped) — packages are
// org-wide-visible here by design (confirmed 2026-08-07), so this file's
// own group lookups do NOT filter by createdById, and its own fan-out
// logic is a parallel, independent implementation of applyTemplateGroup's
// shape rather than a call to it — see requireEditAccess/requireViewAccess
// still gating WHO may call these functions, same as everywhere else; only
// the group VISIBILITY differs.
import { z } from "zod";
import { prisma } from "../prisma";
import { ApiHttpError } from "../lib/api-server";
import { native, requireUserByEmail } from "./core";
import { canManageTaskTemplateGroups, taskManagerNavAccess } from "../role-views";
import { cancelPendingTemplateRuns } from "./templates-internal";
import { assignFlowTaskCore } from "./tasks-internal";
import type { FlowAssignInput } from "../ui/types";

export const PACKAGE_TABLE_WEEKDAYS = ["Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export type PackageTableWeekday = (typeof PACKAGE_TABLE_WEEKDAYS)[number];

const WEEKDAY_TO_PRISMA: Record<PackageTableWeekday, "WED" | "THU" | "FRI" | "SAT" | "SUN"> = {
  Wed: "WED",
  Thu: "THU",
  Fri: "FRI",
  Sat: "SAT",
  Sun: "SUN",
};
const PRISMA_TO_WEEKDAY: Record<"WED" | "THU" | "FRI" | "SAT" | "SUN", PackageTableWeekday> = {
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
  SAT: "Sat",
  SUN: "Sun",
};
// JS Date.getDay() values, matching tasks-internal.ts's DAY_INDEX.
const WEEKDAY_TO_JS_DAY: Record<PackageTableWeekday, number> = {
  Sun: 0,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

async function requireViewAccess(email: string) {
  const user = await requireUserByEmail(email);
  if (!taskManagerNavAccess(user).packageTable) {
    throw new ApiHttpError(403, "You don't have access to view the package table");
  }
  return user;
}

async function requireEditAccess(email: string) {
  const user = await requireUserByEmail(email);
  if (!canManageTaskTemplateGroups(user)) {
    throw new ApiHttpError(403, "Only Super Admin and Operations can manage the package table");
  }
  return user;
}

export interface BranchPackageOption {
  id: string;
  name: string;
}

export interface BranchPackageScheduleCell {
  branch: string;
  weekday: PackageTableWeekday;
  /** Every Package currently configured for this (branch, weekday) cell —
   *  empty array (never null) when nothing is configured. A cell may now
   *  hold more than one Package (2026-08-08 multi-select reversal — see
   *  file header). */
  packages: BranchPackageOption[];
}

export interface BranchPackageScheduleData {
  branches: string[];
  weekdays: readonly PackageTableWeekday[];
  cells: BranchPackageScheduleCell[];
  packages: BranchPackageOption[];
}

/** Full grid data: canonical branch list (distinct role=BRANCH users'
 *  `branch` field), every non-archived Package org-wide (see file
 *  header — deliberately not createdById-scoped), and the current
 *  (branch, weekday) -> package config. A cell may now be backed by
 *  MULTIPLE `BranchPackageSchedule` rows (2026-08-08 multi-select
 *  reversal — see file header and the model's schema comment), so every
 *  matching row is grouped into that cell's `packages` array rather than
 *  assuming at most one. */
export function listBranchPackageSchedule(email: string): Promise<BranchPackageScheduleData> {
  return native(async () => {
    await requireViewAccess(email);

    const branchUsers = await prisma.user.findMany({
      where: { role: "BRANCH", branch: { not: null } },
      select: { branch: true },
      distinct: ["branch"],
      orderBy: { branch: "asc" },
    });
    const branches = branchUsers.map((u) => u.branch as string);

    const packageGroups = await prisma.taskTemplateGroup.findMany({
      where: { scope: "PACKAGE", archivedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    const existing = await prisma.branchPackageSchedule.findMany({
      include: { packageGroup: { select: { name: true } } },
      orderBy: { packageGroup: { name: "asc" } },
    });
    const existingByKey = new Map<string, BranchPackageOption[]>();
    for (const row of existing) {
      const key = `${row.branch}:${row.weekday}`;
      const option: BranchPackageOption = { id: row.packageGroupId, name: row.packageGroup.name };
      const list = existingByKey.get(key);
      if (list) list.push(option);
      else existingByKey.set(key, [option]);
    }

    const cells: BranchPackageScheduleCell[] = [];
    for (const branch of branches) {
      for (const weekday of PACKAGE_TABLE_WEEKDAYS) {
        const packages = existingByKey.get(`${branch}:${WEEKDAY_TO_PRISMA[weekday]}`) ?? [];
        cells.push({ branch, weekday, packages });
      }
    }

    return { branches, weekdays: PACKAGE_TABLE_WEEKDAYS, cells, packages: packageGroups };
  }, "listBranchPackageSchedule");
}

const setCellSchema = z.object({
  branch: z.string().trim().min(1).max(100),
  weekday: z.enum(PACKAGE_TABLE_WEEKDAYS),
  // FULL desired set of package ids for this cell (not a single delta) —
  // 20 is a sanity cap, matching GROUP_TASK_MAX-style caps elsewhere in
  // this module.
  packageGroupIds: z.array(z.string().min(1)).max(20),
});
export type SetBranchPackageScheduleCellInput = z.input<typeof setCellSchema>;

/** Resolve exactly one Branch Manager for `branch` — errors (never
 *  guesses) if zero or more than one exist. */
async function requireSingleBranchManager(branch: string) {
  const managers = await prisma.user.findMany({
    where: { branch, role: "BRANCH" },
    select: { id: true, name: true },
  });
  if (managers.length === 0) {
    throw new ApiHttpError(400, `No branch manager found for ${branch}`);
  }
  if (managers.length > 1) {
    throw new ApiHttpError(
      400,
      `Multiple branch managers found for ${branch} — resolve this before scheduling`,
    );
  }
  return managers[0];
}

/** Cancel the OLD package's recurring assignment for this manager, scoped
 *  to exactly this weekday (see file header + templates-internal.ts's
 *  cancelPendingTemplateRuns for why the weekday filter is required —
 *  without it this would also cancel the same manager's OTHER-weekday
 *  assignment of the same package). Loops over every member TaskTemplate
 *  of the old package group, same shape as template-groups.ts's
 *  removeGroupAssignee, but weekday-scoped.
 *
 *  Note the group lookup below has NO createdById filter — same org-wide
 *  visibility reasoning as the rest of this file (see file header), but
 *  called out again here specifically: removeGroupAssignee (the function
 *  this one otherwise mirrors) DOES filter by createdById, so a future
 *  maintainer "fixing" this to match that precedent more closely would
 *  silently reintroduce ownership-scoping and break cancellation for
 *  packages this manager's assignment used that this actor didn't create
 *  — leaving it inconsistent with assignWeekday/listBranchPackageSchedule
 *  below, which are already deliberately unscoped. */
async function cancelWeekdayAssignment(
  actorId: string,
  packageGroupId: string,
  assigneeId: string,
  weekday: PackageTableWeekday,
) {
  const group = await prisma.taskTemplateGroup.findFirst({
    where: { id: packageGroupId, scope: "PACKAGE" },
    include: { templates: { select: { id: true } } },
  });
  if (!group) return; // old package was deleted already — nothing to cancel
  for (const t of group.templates) {
    await cancelPendingTemplateRuns(
      actorId,
      t.id,
      "branch-package-schedule-cell-changed",
      assigneeId,
      WEEKDAY_TO_JS_DAY[weekday],
    );
  }
}

/** Assign the NEW package to this manager for this weekday, via the
 *  existing recurring-assignment engine (cadence:"daily" + a single day
 *  = an auto-perpetuating weekly series, see engine/recurrence.ts).
 *  Deliberately does NOT call template-groups.ts's applyTemplateGroup —
 *  that function's group lookup is createdById-scoped (per-creator
 *  ownership), but Branch Package Schedule's packages are org-wide
 *  visible (see file header) — this is a parallel implementation of the
 *  same fan-out shape, without the ownership filter. */
async function assignWeekday(
  actor: { id: string; role: string; department: string | null },
  packageGroupId: string,
  managerId: string,
  weekday: PackageTableWeekday,
) {
  const group = await prisma.taskTemplateGroup.findFirst({
    where: { id: packageGroupId, scope: "PACKAGE" },
    include: { templates: { orderBy: { groupPosition: "asc" } } },
  });
  if (!group) throw new ApiHttpError(404, "Package not found");
  for (const t of group.templates) {
    const subtasks = Array.isArray(t.subtasks) ? (t.subtasks as string[]) : [];
    await assignFlowTaskCore(actor, {
      title: t.title,
      subtasks: subtasks.length > 0 ? subtasks : undefined,
      userIds: [managerId],
      days: [weekday],
      cadence: "daily",
      fromTemplateId: t.id,
    } satisfies FlowAssignInput);
  }
}

/** Set one grid cell to the FULL desired set of packages
 *  (`packageGroupIds` — an empty array clears the cell entirely, never
 *  `null`). CONFIG ONLY as of 2026-08-11 (Save/Assign split) for
 *  ADDITIONS — a newly-added package's `BranchPackageSchedule` row is
 *  created with `assignedAt` left null; the real recurring task isn't
 *  created until the separate `assignSavedPackages` action runs. REMOVALS
 *  are the one asymmetric exception and are UNCHANGED — a removed
 *  package's real assignment is still cancelled immediately below, same
 *  as before the split (an already-configured-then-unwanted recurring
 *  task should stop right away, not wait for someone to remember to
 *  re-run Assign). The rest of this comment (diffing, retry-safety
 *  asymmetry between add/remove) still describes the REMOVAL path
 *  accurately; for the ADDITION path, see assignSavedPackages below,
 *  which now owns the assignWeekday-retry-duplication risk this comment
 *  used to describe for this function.
 *
 *  This is a DIFF against what's currently configured for this
 *  (branch, weekday), not a wholesale replace: resolves the branch's
 *  single Branch Manager, fetches the CURRENTLY-configured rows fresh
 *  from the DB, and computes `toRemove`/`toAdd` against the caller's
 *  desired set. Any package id present in BOTH sets is left completely
 *  untouched — no cancel, no reassign, no DB write for it — only genuine
 *  additions/removals reuse `cancelWeekdayAssignment`/`assignWeekday`
 *  (verbatim, unmodified, called once per package) plus the matching
 *  `BranchPackageSchedule` row delete/create.
 *
 *  Not wrapped in a transaction across its steps (find manager -> find
 *  current rows -> per-removed-package cancel+delete -> per-added-package
 *  assign+create) — same accepted trade-off as
 *  template-groups.ts's editTemplateGroup/deleteTemplateGroup/
 *  applyTemplateGroup, whose multi-step writes are documented the same
 *  way. This is the first place in this file where a SINGLE call can
 *  touch MULTIPLE packages: a crash partway through a multi-item cell
 *  change (e.g. after cancelling/removing package A but before
 *  assigning/creating package B) leaves the cell in a partially-applied
 *  state — some packages changed, others not — rather than all-or-
 *  nothing. Callers should treat a thrown error as "re-fetch and
 *  re-check, then retry with the still-desired set," not "nothing
 *  happened" — same guidance as template-groups.ts's callers, extended
 *  here to cover partial application across several packages in one
 *  call, not just a single package's multi-step write.
 *
 *  That retry guidance is NOT symmetric between removals and additions,
 *  though, and a caller that doesn't know this can duplicate live tasks:
 *  `cancelWeekdayAssignment` (via `cancelPendingTemplateRuns`) is
 *  idempotent — it only acts on runs that aren't already CANCELLED — so
 *  if a removal's cancel succeeds but the following row `delete` fails,
 *  a naive retry safely re-runs both and self-heals. `assignWeekday`
 *  (via `assignFlowTaskCore`) has NO such guard: if an addition's
 *  `assignWeekday` succeeds but the following row `create` fails, the
 *  config row is never written, so `currentIds` still won't contain that
 *  package id on a retry — the id lands back in `toAdd` and
 *  `assignWeekday` fires a SECOND time, creating a duplicate live
 *  assignment. Do not blindly retry a failed add with the same desired
 *  set — first verify (e.g. a `getGroupAssignees`-style check against
 *  the actual RunBlock/FlowRun state for that package+weekday+manager)
 *  whether the assignment was already created before deciding whether to
 *  retry `assignWeekday` again.
 *
 *  Re-including a package id the cell ALREADY holds in the desired set
 *  leaves it untouched (it's in both `currentIds` and `desiredIds`) —
 *  unlike the old single-select version, re-setting an unchanged package
 *  no longer discards and recreates its in-progress occurrence; this is
 *  the direct consequence of true diffing rather than always
 *  cancel-then-reassign. */
export function setBranchPackageScheduleCell(
  email: string,
  input: SetBranchPackageScheduleCellInput,
): Promise<{ ok: true }> {
  return native(async () => {
    const actor = await requireEditAccess(email);
    const body = setCellSchema.parse(input);
    const manager = await requireSingleBranchManager(body.branch);
    const prismaWeekday = WEEKDAY_TO_PRISMA[body.weekday];

    const existingRows = await prisma.branchPackageSchedule.findMany({
      where: { branch: body.branch, weekday: prismaWeekday },
    });
    const currentIds = existingRows.map((r) => r.packageGroupId);
    // Caller may submit the same id twice; dedupe so it's not
    // double-processed (a repeated id would otherwise fire a second
    // assignWeekday — a duplicate live assignment — followed by a second
    // branchPackageSchedule.create that throws on the unique constraint).
    const currentSet = new Set(currentIds);
    const desiredSet = new Set(body.packageGroupIds);

    const toRemove = currentIds.filter((id) => !desiredSet.has(id));
    const toAdd = [...desiredSet].filter((id) => !currentSet.has(id));

    for (const id of toRemove) {
      await cancelWeekdayAssignment(actor.id, id, manager.id, body.weekday);
      await prisma.branchPackageSchedule.delete({
        where: {
          branch_weekday_packageGroupId: { branch: body.branch, weekday: prismaWeekday, packageGroupId: id },
        },
      });
    }

    for (const id of toAdd) {
      // 2026-08-11 Save/Assign split: Save no longer calls assignWeekday
      // here — the config row is created with assignedAt left null (the
      // column's default), and the separate "Assign" action (see
      // assignSavedPackages below) is what actually creates the real
      // recurring task, once the user explicitly clicks it.
      await prisma.branchPackageSchedule.create({
        data: { branch: body.branch, weekday: prismaWeekday, packageGroupId: id, createdById: actor.id },
      });
    }

    return { ok: true };
  }, "setBranchPackageScheduleCell");
}

export interface AssignSavedPackagesResult {
  assigned: number;
  skippedBranches: { branch: string; reason: string }[];
}

/** Processes every `BranchPackageSchedule` row where `assignedAt IS NULL`
 *  (i.e. configured via Save but not yet really-assigned) into a real
 *  recurring task assignment, then stamps `assignedAt`. 2026-08-11
 *  Save/Assign split — see setBranchPackageScheduleCell's doc comment and
 *  this module's file header.
 *
 *  Per-branch partial success, not all-or-nothing: resolves each distinct
 *  branch's single Branch Manager once (same `requireSingleBranchManager`
 *  check Save already uses); a branch with zero or 2+ managers has ALL of
 *  its currently-unassigned rows skipped and reported back, but every
 *  OTHER branch in the same call still gets processed. A caller cannot
 *  tell from the return value alone which SPECIFIC rows within a
 *  successfully-resolved branch failed at the `assignWeekday` step itself
 *  (that would require the same kind of per-package try/catch
 *  `setBranchPackageScheduleCell` deliberately does NOT have, for the
 *  same accepted "partial application, re-fetch and retry" trade-off
 *  documented there) — an error thrown by `assignWeekday` for one row
 *  inside an otherwise-healthy branch propagates and aborts the WHOLE
 *  call, same as any other unhandled error in this codebase's `native()`
 *  wrapper. This is a deliberate, narrower partial-success boundary than
 *  per-row: it exists specifically to let the KNOWN, EXPECTED failure mode
 *  (manager conflicts, same as Save already handles) degrade gracefully,
 *  not to paper over arbitrary mid-batch failures.
 *
 *  Retry-safety: re-calling this after a full or partial success is safe
 *  and does NOT create duplicates for rows that already got assigned —
 *  the `assignedAt IS NULL` filter means an already-stamped row is never
 *  reprocessed. A row that failed mid-branch (the whole-branch abort case
 *  above) keeps `assignedAt` null and IS correctly retried on the next
 *  call — but if THAT retry hits the exact same "assignWeekday succeeded,
 *  the following stamp-update never ran" gap `setBranchPackageScheduleCell`'s
 *  own doc comment warns about for its add path, it carries the same
 *  duplicate-assignment risk. This is accepted for the same reason it's
 *  accepted there: making it fully safe requires a live RunBlock-existence
 *  check this codebase doesn't have yet (see that comment's closing
 *  paragraph), and this function is a low-frequency, explicit user action
 *  (not an automatic retry loop), not a background job. */
export function assignSavedPackages(email: string): Promise<AssignSavedPackagesResult> {
  return native(async () => {
    const actor = await requireEditAccess(email);

    const rows = await prisma.branchPackageSchedule.findMany({
      where: { assignedAt: null },
      orderBy: [{ branch: "asc" }, { weekday: "asc" }],
    });

    const byBranch = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = byBranch.get(row.branch);
      if (list) list.push(row);
      else byBranch.set(row.branch, [row]);
    }

    let assigned = 0;
    const skippedBranches: { branch: string; reason: string }[] = [];

    for (const [branch, branchRows] of byBranch) {
      let manager: { id: string; name: string };
      try {
        manager = await requireSingleBranchManager(branch);
      } catch (err) {
        skippedBranches.push({
          branch,
          reason: err instanceof ApiHttpError ? err.message : "Could not resolve a branch manager",
        });
        continue;
      }
      for (const row of branchRows) {
        const weekday = PRISMA_TO_WEEKDAY[row.weekday];
        await assignWeekday(actor, row.packageGroupId, manager.id, weekday);
        await prisma.branchPackageSchedule.update({
          where: { id: row.id },
          data: { assignedAt: new Date() },
        });
        assigned += 1;
      }
    }

    return { assigned, skippedBranches };
  }, "assignSavedPackages");
}
