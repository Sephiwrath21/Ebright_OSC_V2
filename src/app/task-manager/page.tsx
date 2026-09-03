// /task-manager — the role-scoped Task Manager view (replaces the old
// ClickUp Tasks feature). Wiring mirrors the donor's osc-demo page: this
// server component fetches all payloads, defines the server actions (each
// closing over the session email), and passes both down as props — the
// client components never fetch and never see an identity primitive.
//
// 2026-07-24 redesign: Superadmin gets a Department|Branch toggle + dropdown
// with the selected entity's full Daily+Monthly detail inline (the folded-in
// Department Overview page, generalized to branches); the elevated
// department sites (Operation/Optimisation — isElevatedDeptSite) get the
// department dropdown only; every other role keeps TaskManagerView, with
// HOD/DEPT_SITE's detail now inline there too. "+ Task" sits in the page
// header for superadmin + elevated sites.
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { ModeTabs } from "./mode-tabs";
import { auth } from "@/auth";
import { requireLiveSession } from "@/task-manager/action-session";
import AppShell from "@/app/components/AppShell";
import {
  assignFlowTask,
  completeFlowTask,
  createKanbanCard,
  createKanbanColumn,
  deleteKanbanCard,
  deleteKanbanColumn,
  getBranchAdhocAssigned,
  getBranchDetail,
  getBranchHodAssigned,
  getDepartmentCeoAssigned,
  getDepartmentDetail,
  getDepartmentHodAssigned,
  getFlowDetail,
  getFlowOverview,
  getFlowStaff,
  getHodKanban,
  getOrgMonthlyDepartments,
  getOrgMonthlyRegions,
  getMyManpowerSchedule,
  getNoClaimIncentiveList,
  moveKanbanCard,
  moveKanbanColumn,
  reassignFlowTask,
  recolorKanbanColumn,
  renameKanbanColumn,
  reopenFlowTask,
  archiveTemplateTasks,
  createTaskCategory,
  deleteTaskTemplate,
  editTaskTemplate,
  getTaskTemplate,
  getTemplateAssignees,
  getTemplateDeletionImpact,
  listActiveTaskCategories,
  listArchivedItems,
  listTaskTemplates,
  reassignTemplateTasks,
  removeTemplateAssignments,
  renameTaskTemplate,
  unarchiveTemplateTasks,
  skipFlowTask,
  uploadFlowTaskProof,
  removeFlowTaskProof,
  updateFlowTaskDueDate,
  FlowBridgeError,
  NoAccountError,
  SetupPendingError,
} from "@/task-manager/data";
import { isElevatedDeptSite } from "@/task-manager/analytics/_lib";
import {
  canManageTaskTemplateGroups,
  FINANCE_EMAIL,
  isPersonalAccountView,
  resolveViewRole,
  shows,
  showsAddTaskHeader,
  thisWeekDatesForRange,
  weekdayRangeOf,
} from "@/task-manager/role-views";
import { TaskManagerView } from "@/task-manager/ui/task-manager-view";
import { AddTaskButton } from "@/task-manager/ui/add-task-button";
import { PageSectionHeading } from "@/task-manager/ui/bits";
import { TaskOverviewStack } from "@/task-manager/ui/task-overview-stack";
import { AllDepartmentsSection } from "@/task-manager/ui/department-donut-overview";
import { CardModeProvider, CardModeToggle } from "@/task-manager/ui/card-mode-context";
import type { MyMonthConfig, MyWeekDay } from "@/task-manager/ui/entity-card-overview";
import type { MyManpowerActualSlot, NoClaimIncentivePayload } from "@/task-manager/ui/types";
import { NoClaimIncentiveMenu } from "@/task-manager/ui/no-claim-incentive-menu";
import {
  DailyDatePicker,
  EntityPicker,
  MonthDropdown,
  MonthRangeDropdown,
} from "@/task-manager/ui/entity-picker";
import {
  chunkLabel,
  defaultMonthRange,
  FLOW_BRANCH_REGIONS,
  FLOW_DEPARTMENTS,
  flowBucketize,
  monthDayChunks,
  type ActionResult,
  type AssignActionResult,
  type FlowAssignInput,
  type FlowEntityRollup,
  type FlowKanbanColumnColor,
  toSelfEntityDetail,
} from "@/task-manager/ui/types";
import {
  NoAccountCard,
  SetupPendingCard,
  TaskManagerErrorCard,
} from "@/task-manager/ui/status-cards";

export const dynamic = "force-dynamic";

const ALL_BRANCHES: string[] = FLOW_BRANCH_REGIONS.flatMap((r) => [...r.branches]);
/** Fullest demo roster — the least-empty default for the Branch mode. */
const DEFAULT_BRANCH = "Subang Taipan";

/** "All Departments" (2026-08-22) — sentinel value for the admin/OPS
 *  Department dropdown's EntityPicker, NOT a real FLOW_DEPARTMENTS entry.
 *  Selecting it fans out a full TaskOverviewStack per department instead
 *  of the usual single one — see buildEntityOverview's "view === department"
 *  branch. Kept distinct from any real department name so it can never
 *  collide with one. */
const ALL_DEPARTMENTS_VALUE = "All Departments";

/** "All Regions" (2026-08-25) — the Branch dropdown's own equivalent
 *  sentinel, same convention as ALL_DEPARTMENTS_VALUE above (not a real
 *  branch name, kept distinct so it can never collide with one). Selecting
 *  it shows one aggregated donut/list card per region — see
 *  buildEntityOverview's "view === branch" branch and sumRegionRollup
 *  below. */
const ALL_REGIONS_VALUE = "All Regions";

/** Sums one org.regions entry's branches into a single region-level
 *  FlowEntityRollup (2026-08-25 fix — this used to filter the FLAT
 *  org.branches by name instead; confirmed live that org.branches is
 *  task-derived only with no roster-first zero-fill, unlike
 *  org.departments' withAllDepartments wrapper — a branch with zero tasks
 *  that day was silently ABSENT rather than zero-filled, so on a day with
 *  zero branch-assigned tasks anywhere, org.branches was entirely empty
 *  and every region/branch card here showed 0/0/0/0 regardless of real
 *  data. org.regions (queries.ts's getOrgMonthlyRegions doc comment has
 *  the full story) is ALREADY correctly roster-first — every real branch
 *  always present, zero-filled — so this now just sums it, no filtering
 *  needed). region.branches carries bucket totals only (EntityCounts, not
 *  EntityCountsDetailed) — no `tasks` drill-down list, so click-to-drill
 *  is unavailable on cards built from this; an accepted trade-off for
 *  correct zero-filled data over a currently-broken drill feature. */
function sumRegionRollup(region: { name: string; branches: FlowEntityRollup[] }): FlowEntityRollup {
  const totals = region.branches.reduce(
    (acc, b) => ({
      completed: acc.completed + b.completed,
      pending: acc.pending + b.pending,
      na: acc.na + b.na,
    }),
    { completed: 0, pending: 0, na: 0 },
  );
  return { name: region.name, ...totals };
}

/** "All Region A" / "All Region B" / "All Region C" (2026-08-25, user
 *  request) — a THIRD granularity, distinct from both a single branch and
 *  "All Regions": every branch WITHIN one region gets its own card (same
 *  as "All Departments" shows one card per department), NOT summed into
 *  one region total (that's what ALL_REGIONS_VALUE/sumRegionRollup above
 *  are for) — this reads a region's own `branches` array directly (already
 *  the correct, roster-first per-branch list from org.regions), no
 *  summing at all. Generated from FLOW_BRANCH_REGIONS rather than three
 *  hardcoded constants, so a future Region D needs no new sentinel here. */
function allRegionValue(regionName: string): string {
  return `All ${regionName}`;
}

/** Reverse lookup: the FLOW_BRANCH_REGIONS entry an "All Region X" sentinel
 *  refers to, or undefined for anything else (a real branch name,
 *  ALL_REGIONS_VALUE, or garbage). */
function regionForAllRegionValue(value: string | undefined): (typeof FLOW_BRANCH_REGIONS)[number] | undefined {
  if (!value) return undefined;
  return FLOW_BRANCH_REGIONS.find((r) => allRegionValue(r.name) === value);
}

/** Every Branch dropdown's aggregate sentinels (2026-08-25, user request —
 *  bold them so they read as a distinct "view", not just another branch
 *  name buried alphabetically in their own region's optgroup). Shared by
 *  all three Branch EntityPicker call sites (All Regions/All Region X/
 *  single-branch) so the bold set can never drift between them. */
const ALL_BRANCH_BOLD_VALUES = [ALL_REGIONS_VALUE, ...FLOW_BRANCH_REGIONS.map((r) => allRegionValue(r.name))];

/** Strict YYYY-MM-DD or nothing — anything else falls back to today (the
 *  data layer's own default when `date` is omitted). */
const DATE_PARAM_RE = /^\d{4}-\d{2}-\d{2}$/;

/** ?mrange= — the Monthly 7-day chunk ("1-7" … "29-31"). Anything invalid
 *  falls back to Full month. */
const MRANGE_RE = /^(\d{1,2})-(\d{1,2})$/;

function parseMonthRange(raw?: string): { from: number; to: number } | undefined {
  const m = raw?.match(MRANGE_RE);
  if (!m) return undefined;
  const from = Number(m[1]);
  const to = Number(m[2]);
  return from >= 1 && from <= to && to <= 31 ? { from, to } : undefined;
}

export default async function TaskManagerPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    view?: string;
    department?: string;
    branch?: string;
    date?: string;
    mdate?: string;
    mrange?: string;
    hdate?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  const su = session.user as { email: string; name?: string | null; role?: string };
  const email = su.email;

  const sp = await searchParams;
  // Superadmin/elevated-site/CEO's Department|Branch toggle (ModeTabs)
  // remembers the last picked mode across visits (2026-08-26, user
  // request) — a cookie, not localStorage, since ModeTabs' own Links are
  // plain server-rendered navigation with no client JS otherwise; ?view=
  // still wins whenever present (an explicit navigation/bookmark), the
  // cookie only fills in when it's altogether absent. See ModeTabs' own
  // onClick below for where this gets written.
  const cookieEntityView = (await cookies()).get("tm_entity_view")?.value;
  const period = sp.period === "monthly" ? "monthly" : "daily";
  const href = (p: string) => `/task-manager?period=${p}`;
  // Date filters: ?date= drives every DAILY surface (entity Details AND the
  // personal Daily donut/list, 2026-07-28); ?mdate= drives the personal
  // Monthly pair (any picked date = that date's whole month). Undefined =
  // today / current month.
  const dailyDate = sp.date && DATE_PARAM_RE.test(sp.date) ? sp.date : undefined;
  const monthlyDate = sp.mdate && DATE_PARAM_RE.test(sp.mdate) ? sp.mdate : undefined;
  // Monthly 7-day chunk within the anchor month (2026-07-29 Monthly
  // selector redesign) — undefined = Full month.
  const monthlyRange = parseMonthRange(sp.mrange);
  // Three states, not two (2026-08-25 fix): undefined (?mrange= truly
  // absent — every "default to today's day-range chunk when unset" below
  // should kick in), "" (explicitly Full month — an EMPTY but PRESENT
  // ?mrange=, written by MonthRangeDropdown/selectMyMonthRange; must NOT
  // be defaulted away), or "d-d" (a real chunk). Collapsing "" and
  // undefined together (the old `monthlyRange ? ... : undefined`) made an
  // explicit Full month pick indistinguishable from "never chosen", so
  // every `monthlyRangeParam ?? defaultMonthRange(...)` fallback below
  // silently overrode it back to today's chunk on the current month.
  const monthlyRangeParam = monthlyRange
    ? `${monthlyRange.from}-${monthlyRange.to}`
    : sp.mrange !== undefined
      ? ""
      : undefined;
  // Every control carries the OTHER filters' raw params along unchanged,
  // so changing one date never resets the others. (Ad hoc is deliberately
  // NOT date-filtered — 2026-07-29 simplification: one-off tasks, plain
  // all-time list. "HOD Assigned Task" for individual staff was ALSO
  // date-filtered via its own ?hdate= until 2026-08-20 — removed then, to
  // match the department-wide "HOD Assigned Task" view's all-time
  // behavior; see myOverviewData.hodAssigned below.)
  const rawParams = {
    date: dailyDate,
    mdate: monthlyDate,
    mrange: monthlyRangeParam,
  };
  // v !== undefined (not the old truthy `v &&`, 2026-08-25 fix) — an
  // explicit Full month's mrange="" must still be carried along, or
  // switching the anchor month (MonthDropdown) while Full month is
  // selected would silently drop back to "unset" and re-default.
  const carryTM = (...except: string[]) =>
    Object.fromEntries(
      Object.entries(rawParams).filter(([k, v]) => v !== undefined && !except.includes(k)),
    ) as Record<string, string>;
  const monthlyCarry = carryTM("date");
  const dailyCarry = carryTM("mdate", "mrange");

  // Self-scoped sections (2026-08-12 stacked-sections redesign): a role
  // with no owned entity (OPS, CEO, and Monthly for every MEMBER-role
  // viewer) gets a synthetic one-member FlowEntityDetail built from data
  // ALREADY fetched (daily.me/monthly.me's FlowPersonal), not a new query.
  // FlowDrillTask rows here always carry the viewer's own name in
  // assigneeName already (see types.ts's comment on FlowPersonal.tasks).

  // Expected errors are RETURNED, never thrown: Next.js masks thrown
  // server-action error messages in production, so every action here catches
  // and maps to { ok:false, message } instead of letting the framework
  // swallow it. revalidatePath only runs on the success path.
  const FALLBACK_MESSAGE = "Something went wrong — please try again";

  async function assign(input: FlowAssignInput): Promise<AssignActionResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      const result = await assignFlowTask(email, input);
      revalidatePath("/task-manager");
      return { ok: true, created: result.created };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  // "No Claim/Incentive" list (2026-08-18, month filter added same day):
  // fetched fresh each time the ⋮ menu opens OR the month is changed — see
  // NoClaimIncentiveMenu's own doc comment. Throws on failure/stale session
  // rather than returning an ActionResult — the client component's own
  // .catch() handles it, matching its no-wrapper fetchList prop type.
  async function loadNoClaimIncentiveList(month: string): Promise<NoClaimIncentivePayload> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) throw new Error("Session expired — please refresh.");
    return getNoClaimIncentiveList(email, month);
  }

  async function completeTask(runBlockId: string): Promise<ActionResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      await completeFlowTask(email, runBlockId);
      revalidatePath("/task-manager");
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  async function skipTask(runBlockId: string): Promise<ActionResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      await skipFlowTask(email, runBlockId);
      revalidatePath("/task-manager");
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  async function reopenTask(runBlockId: string): Promise<ActionResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      await reopenFlowTask(email, runBlockId);
      revalidatePath("/task-manager");
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  /** Editable Due Date (2026-08-19) — "Tasks I Assigned"/"CEO Assigned Task"
   *  only, see updateFlowTaskDueDate's own doc comment for the authorization
   *  rule (only the task's own starter). */
  async function updateDueDate(runBlockId: string, newDueAtIso: string): Promise<ActionResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      await updateFlowTaskDueDate(email, runBlockId, newDueAtIso);
      revalidatePath("/task-manager");
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  async function uploadProof(
    runBlockId: string,
    image: { mime: string; dataBase64: string },
  ): Promise<import("@/task-manager/ui/types").ProofUploadResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      const { proofId } = await uploadFlowTaskProof(email, runBlockId, image);
      revalidatePath("/task-manager");
      return { ok: true, proofId };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  async function removeProof(
    proofId: string,
  ): Promise<import("@/task-manager/ui/types").ProofRemoveResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      await removeFlowTaskProof(email, proofId);
      revalidatePath("/task-manager");
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  // Task Template actions (2026-07-31) — creation happens through assign's
  // saveAsTemplate flag; these cover load-for-prefill, rename, delete.
  async function loadTemplate(
    templateId: string,
  ): Promise<import("@/task-manager/ui/types").TemplateLoadResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      const template = await getTaskTemplate(email, templateId);
      return { ok: true, template: template as import("@/task-manager/ui/types").FlowTemplateDetail };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }
  async function renameTemplate(templateId: string, name: string): Promise<ActionResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      await renameTaskTemplate(email, templateId, name);
      revalidatePath("/task-manager");
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }
  async function templateImpact(
    templateId: string,
  ): Promise<import("@/task-manager/ui/types").TemplateImpactResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      const impact = await getTemplateDeletionImpact(email, templateId);
      return { ok: true, ...impact };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }
  async function deleteTemplate(templateId: string): Promise<ActionResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      await deleteTaskTemplate(email, templateId);
      // Cancelling pending assignments changes OTHER people's lists too —
      // refresh both task surfaces.
      revalidatePath("/task-manager");
      revalidatePath("/home");
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  // + Task hub actions (2026-07-31): Edit / Remove-in-bulk / Reassign.
  async function templateAssignees(
    templateId: string,
  ): Promise<import("@/task-manager/ui/types").TemplateAssigneesResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      const assignees = await getTemplateAssignees(email, templateId);
      return { ok: true, assignees };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }
  async function editTemplate(
    templateId: string,
    input: import("@/task-manager/ui/types").FlowTemplateEditInput,
  ): Promise<import("@/task-manager/ui/types").TemplateEditResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      const result = await editTaskTemplate(email, templateId, input);
      revalidatePath("/task-manager");
      revalidatePath("/home");
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }
  async function removeAssignments(
    templateId: string,
    alsoDeleteTemplate: boolean,
  ): Promise<ActionResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      await removeTemplateAssignments(email, templateId, { deleteTemplate: alsoDeleteTemplate });
      revalidatePath("/task-manager");
      revalidatePath("/home");
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }
  async function archiveTemplate(templateId: string, userId?: string): Promise<ActionResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      await archiveTemplateTasks(email, templateId, userId);
      revalidatePath("/task-manager");
      revalidatePath("/home");
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }
  async function unarchiveTemplate(templateId: string, userId?: string): Promise<ActionResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      await unarchiveTemplateTasks(email, templateId, userId);
      revalidatePath("/task-manager");
      revalidatePath("/home");
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }
  async function archivedItems(): Promise<import("@/task-manager/ui/types").ArchivedItemsResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      const items = await listArchivedItems(email);
      return { ok: true, ...items };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }
  async function reassignTemplate(
    templateId: string,
    fromUserId: string,
    toUserId: string,
  ): Promise<ActionResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      await reassignTemplateTasks(email, templateId, fromUserId, toUserId);
      revalidatePath("/task-manager");
      revalidatePath("/home");
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  // Inline "+ Add new type" (2026-08-12) — the assign form's Category
  // dropdown. Only ever passed to the client when canManageCategories is
  // true (below); createTaskCategory re-enforces the same
  // canManageTaskTemplateGroups gate server-side regardless.
  async function createCategory(
    name: string,
  ): Promise<import("@/task-manager/ui/types").CreateCategoryResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      const { id } = await createTaskCategory(email, { name });
      revalidatePath("/task-manager");
      return { ok: true, id, name };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  async function reassignTask(runBlockId: string, newAssigneeId: string): Promise<ActionResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      await reassignFlowTask(email, runBlockId, newAssigneeId);
      revalidatePath("/task-manager");
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  const hodKanbanActions = {
    async create(column: string, title: string): Promise<ActionResult> {
      "use server";
      const stale = await requireLiveSession(email);
      if (stale) return stale;
      try {
        await createKanbanCard(email, column, title);
        revalidatePath("/task-manager");
        return { ok: true };
      } catch (err) {
        return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
      }
    },
    async move(cardId: string, column: string, order: number): Promise<ActionResult> {
      "use server";
      const stale = await requireLiveSession(email);
      if (stale) return stale;
      try {
        await moveKanbanCard(email, cardId, column, order);
        revalidatePath("/task-manager");
        return { ok: true };
      } catch (err) {
        return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
      }
    },
    async remove(cardId: string): Promise<ActionResult> {
      "use server";
      const stale = await requireLiveSession(email);
      if (stale) return stale;
      try {
        await deleteKanbanCard(email, cardId);
        revalidatePath("/task-manager");
        return { ok: true };
      } catch (err) {
        return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
      }
    },
    async createColumn(label: string): Promise<ActionResult> {
      "use server";
      const stale = await requireLiveSession(email);
      if (stale) return stale;
      try {
        await createKanbanColumn(email, label);
        revalidatePath("/task-manager");
        return { ok: true };
      } catch (err) {
        return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
      }
    },
    async renameColumn(columnId: string, label: string): Promise<ActionResult> {
      "use server";
      const stale = await requireLiveSession(email);
      if (stale) return stale;
      try {
        await renameKanbanColumn(email, columnId, label);
        revalidatePath("/task-manager");
        return { ok: true };
      } catch (err) {
        return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
      }
    },
    async moveColumn(columnId: string, order: number): Promise<ActionResult> {
      "use server";
      const stale = await requireLiveSession(email);
      if (stale) return stale;
      try {
        await moveKanbanColumn(email, columnId, order);
        revalidatePath("/task-manager");
        return { ok: true };
      } catch (err) {
        return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
      }
    },
    async recolorColumn(columnId: string, color: FlowKanbanColumnColor | null): Promise<ActionResult> {
      "use server";
      const stale = await requireLiveSession(email);
      if (stale) return stale;
      try {
        await recolorKanbanColumn(email, columnId, color);
        revalidatePath("/task-manager");
        return { ok: true };
      } catch (err) {
        return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
      }
    },
    async deleteColumn(columnId: string): Promise<ActionResult> {
      "use server";
      const stale = await requireLiveSession(email);
      if (stale) return stale;
      try {
        await deleteKanbanColumn(email, columnId);
        revalidatePath("/task-manager");
        return { ok: true };
      } catch (err) {
        return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
      }
    },
  };

  let body: ReactNode;
  let headerAction: ReactNode = null;
  let noClaimMenu: ReactNode = null;
  try {
    const [daily, monthly, { staff }] = await Promise.all([
      getFlowDetail(email, "daily", dailyDate),
      getFlowDetail(email, "monthly", monthlyDate, monthlyRange ? { monthDays: monthlyRange } : undefined),
      getFlowStaff(),
    ]);
    const role = daily.me.me.role;
    const elevatedDeptSite = isElevatedDeptSite({
      role,
      department: daily.me.me.department ?? null,
    });
    // ALL role gates below read role-views.ts (the single source of truth,
    // 2026-07-29 centralization).
    const viewRole = resolveViewRole(daily.me.me);
    // "No Claim/Incentive" list (2026-08-18): Finance (finance@ebright.my)
    // and CEO only — see getNoClaimIncentiveList's own doc comment
    // (queries.ts) for why this check is narrower than canViewOrg.
    if (viewRole === "CEO" || email.toLowerCase() === FINANCE_EMAIL) {
      noClaimMenu = <NoClaimIncentiveMenu fetchList={loadNoClaimIncentiveList} />;
    }
    // myOverview's Daily View-toggle default (2026-08-15) — see
    // isPersonalAccountView's doc comment; every role that actually renders
    // myOverview is a personal account, so this is always true in practice,
    // but computed properly rather than hardcoded in case that changes.
    const defaultOnlyMe = isPersonalAccountView(viewRole);
    // My Week embedded view (2026-08-15): the viewer's own tasks for every
    // weekday in their role's range, WEEK-SYNCED to whatever date the
    // section's own DailyDatePicker currently shows (`daily.date` — the
    // resolved ?date=, defaulting to today when unset) rather than always
    // "today" — moving the picker to a different week recomputes the whole
    // tab list (dates AND counts) on the next server render, and clicking a
    // tab navigates via router.push to a new ?date= (EntityCardOverview),
    // which lands back here and does the same. Built once here and reused
    // by every "daily" SectionData this page (and TaskManagerView's own
    // Department/Branch Overview) constructs below — still just the
    // viewer's own tasks regardless of which section it appears in; only
    // `nav` (which URL the picker/tabs for THAT section navigate) differs
    // per site, via buildMyWeek.
    //
    // getFlowOverview (not getFlowDetail) with strictWindow:true — a real
    // DB connection timeout surfaced with getFlowDetail here (2026-08-15):
    // getFlowDetail's role branches ALSO pull org/department/branch-wide
    // payloads this view never reads, multiplied by up to 7 concurrent
    // calls (one per weekday) on top of the page's own daily/monthly/staff
    // fetches. getFlowOverview only runs getMePayload — the personal-only
    // piece this view actually needs — and strictWindow:true is essential
    // (without it every tab would show the SAME un-windowed task set
    // instead of that day's actual tasks; this is why the original
    // getFlowOverview swap on this branch was reverted before strictWindow
    // support existed here). Every day (including the picker's own
    // selected date) is now fetched uniformly through this lighter path —
    // no more special-casing/reusing the already-fetched `daily` object,
    // since that one's the heavy getFlowDetail result the others no longer
    // match the shape of.
    const [dailyDateY, dailyDateM, dailyDateD] = daily.date.split("-").map(Number);
    const myWeekDates = thisWeekDatesForRange(
      weekdayRangeOf(viewRole),
      new Date(dailyDateY, dailyDateM - 1, dailyDateD),
    );
    // Manpower Scheduling link (2026-08-18): Coach/Branch Full Time Exec
    // only — read-only display of the viewer's own ACTUAL time slot(s) for
    // each weekday tab above, pulled from Manpower Scheduling's separate
    // HRFS-side system (see getMyManpowerSchedule's own doc comment for the
    // full cross-database chain and its accepted scope/risks). Fetched
    // alongside the myWeek task overview rather than after it, so the two
    // don't serialize.
    const isScheduleLinkedRole = viewRole === "BRANCH_MEMBER" || viewRole === "COACH";
    const [myWeekResults, myWeekSchedule] = await Promise.all([
      Promise.all(myWeekDates.map((d) => getFlowOverview(email, "daily", d.date, { strictWindow: true }))),
      isScheduleLinkedRole
        ? getMyManpowerSchedule(
            email,
            myWeekDates.map((d) => d.date),
          )
        : Promise.resolve(new Map<string, MyManpowerActualSlot[]>()),
    ]);
    const myWeekResultByDate = new Map(myWeekResults.map((r) => [r.date, r]));
    const myWeekDays: MyWeekDay[] = myWeekDates.map((d) => ({
      weekday: d.weekday,
      date: d.date,
      tasks: myWeekResultByDate.get(d.date)?.tasks ?? [],
      schedule: myWeekSchedule.get(d.date) ?? [],
    }));
    const buildMyWeek = (nav: { basePath: string; extraParams?: Record<string, string> }) => ({
      days: myWeekDays,
      selectedDate: daily.date,
      nav,
    });
    // Every "personal" Daily section (myOverview, and TaskManagerView's own
    // departmentOverview/branchOverview) shares the SAME DailyDatePicker
    // wiring (personalDailyControl/departmentDailyControl, both built from
    // monthlyCarry below) — so they share this one nav config too.
    const personalMyWeek = buildMyWeek({ basePath: "/task-manager", extraParams: monthlyCarry });
    // "My Month" tab sidebar (2026-08-18, widened 2026-08-21) — matching
    // Home's own myMonth exactly (same monthDayChunks/chunkLabel day-range-
    // chunk shape, same "own card, alone on screen" gate in
    // EntityCardOverview). Covers every role whose personal Monthly section
    // actually renders one: Branch Manager's own "Klang — Monthly" card,
    // AND myOverview's Monthly section (OPS/DEPT_MEMBER — the only two
    // viewRoles that reach the `monthly: myOverviewData.monthly` branch
    // below; BRANCH_MEMBER/COACH/CEO have no Monthly section at all).
    // Department Overview and the org-wide entityDropdowns Monthly sections
    // are unaffected, still the plain Full-month/range-dropdown view. Gated
    // on viewRole so the 4 concurrent chunk fetches only run for roles that
    // actually use them.
    let personalMyMonth: MyMonthConfig | undefined;
    if (viewRole === "BRANCH_MANAGER" || viewRole === "OPS" || viewRole === "DEPT_MEMBER") {
      const [monthlyDateY, monthlyDateM] = monthly.date.split("-").map(Number);
      const monthChunks = monthDayChunks(monthlyDateY, monthlyDateM);
      // "Full month" is one of the tabs too (2026-08-18), not just the
      // heading dropdown's option — an unclamped fetch (no monthDays)
      // alongside the 4 day-range chunks, so both controls agree on what
      // "Full month" means and stay in sync via the same ?mrange=.
      const [myMonthResults, fullMonthResult] = await Promise.all([
        Promise.all(
          monthChunks.map((c) =>
            getFlowOverview(email, "monthly", monthly.date, { monthDays: c, strictWindow: true }),
          ),
        ),
        getFlowOverview(email, "monthly", monthly.date, { strictWindow: true }),
      ]);
      personalMyMonth = {
        chunks: [
          { label: "Full month", range: "", tasks: fullMonthResult.tasks },
          ...monthChunks.map((c, i) => ({
            label: chunkLabel(c),
            range: `${c.from}-${c.to}`,
            tasks: myMonthResults[i].tasks,
          })),
        ],
        // Default tab (2026-08-22): the week-range chunk containing TODAY,
        // not "Full month" — only when the anchor month being viewed is
        // the real current month (defaultMonthRange falls back to "" —
        // Full month — otherwise, e.g. viewing a past/future month).
        selectedRange: monthlyRangeParam ?? defaultMonthRange(monthlyDateY, monthlyDateM, new Date()),
        anchorMonth: monthly.date,
        nav: { basePath: "/task-manager", extraParams: monthlyCarry },
      };
    }
    // "Assign to Others" — same identities as the assign form MINUS the CEO
    // (2026-08-01: the CEO is view-only on the org-wide/department/branch
    // drill-downs — reassigning other people's existing tasks isn't part of
    // that role here, only creating new ones via "+ Task"). The data layer
    // re-checks (incl. HOD's own-department scoping) on every call.
    const canReassign = role === "ADMIN" || role === "OPS" || role === "HOD" || elevatedDeptSite;
    const reassign = canReassign ? { staff, action: reassignTask } : undefined;
    // Self-service "Assign to Others" for the TaskOverviewStack card grids
    // (2026-08-13) — DELIBERATELY unconditional/unrestricted-by-role,
    // unlike `reassign` above: reassignFlowTask's own self-service branch
    // only ever lets the caller hand off a task that's already THEIRS, so
    // every viewer gets this control regardless of role — the data layer
    // re-enforces the same-department/branch scope, this is purely "does
    // the trigger render" on the client. Reuses the same reassignTask
    // action as the manager-only `reassign` above — one server action,
    // two different authorization paths inside reassignFlowTask.
    const cardReassign = { staff, action: reassignTask };
    // Same gate as createTaskCategory's own server-side check — only these
    // viewers get the assign form's inline "+ Add new type" option
    // (2026-08-12; this is the ONLY way to create a category as of
    // 2026-08-15, the standalone admin page was removed).
    const canManageCategories = canManageTaskTemplateGroups({
      role,
      department: daily.me.me.department ?? null,
      email,
    });

    // "+ Task" lives in the PAGE HEADER (top-right) for every assign-capable
    // role per the config — layout reshuffles below the header can never
    // move it. Templates (2026-07-31) ride along: the saved list + its
    // load/rename/delete actions feed the form's "Start from a template"
    // picker and Manage panel.
    // Active categories — feeds AddTaskButton's picker AND, since the
    // 2026-08-12 entityDropdowns migration, EntityCardOverview's "Sort:
    // Type" mode in buildEntityOverview() below. Fetched once, unconditionally
    // (previously two separate fetches at different scopes); defensive
    // (empty on failure) since neither consumer should fail the whole page.
    const categoryList = await listActiveTaskCategories(email).catch(() => []);

    if (showsAddTaskHeader(viewRole)) {
      const templateList = await listTaskTemplates(email);
      headerAction = (
        <AddTaskButton
          staff={staff}
          action={assign}
          categories={categoryList}
          onCreateCategory={canManageCategories ? createCategory : undefined}
          // The CEO assigns to HODs ONLY (2026-08-01 rule restored) — the
          // picker restricts, and assignFlowTask re-enforces server-side.
          // quickSelfId adds the CEO's own "Myself" chip, since the CEO
          // isn't a HOD and would otherwise never appear in this list.
          recipientGroup={role === "CEO" ? "HOD" : undefined}
          quickSelfId={role === "CEO" ? daily.me.me.userId : undefined}
          // Cadence is meaningless for CEO-assigned tasks (2026-08-01):
          // they're categorized by WHO assigned them (the recipient's "CEO
          // Assigned" stream, or the CEO's own list for "Myself"), never by
          // a Daily/Monthly tag — so the field is hidden for the CEO only.
          hideCadence={role === "CEO"}
          templates={{
            list: templateList,
            load: loadTemplate,
            impact: templateImpact,
            rename: renameTemplate,
            remove: deleteTemplate,
            assignees: templateAssignees,
            edit: editTemplate,
            removeAssignments,
            reassignAll: reassignTemplate,
            archive: archiveTemplate,
            unarchive: unarchiveTemplate,
            archived: archivedItems,
          }}
        />
      );
    }

    // Dropdown-driven entity overview (Department | Branch toggle) —
    // superadmin/elevated sites' WHOLE page, and since 2026-08-01 also
    // appended BELOW the CEO's own sections (config: entityDropdowns).
    // Extracted into a builder so both render paths share one definition.
    const entityView: "department" | "branch" =
      sp.view === "branch" ? "branch" : sp.view === "department" ? "department" : cookieEntityView === "branch" ? "branch" : "department";
    // Manager mode for the View All card grid (2026-08-15): lets ADMIN and
    // elevated DEPT_SITE (Operations/Optimisation) reassign OTHER people's
    // tasks directly from a Person-sort card row, not just their own —
    // confirmed narrower than the existing `canReassign` (which also
    // includes OPS/HOD for the drill-down modal elsewhere) per the explicit
    // 2026-08-15 product decision. The server re-checks the actor's role
    // regardless (see reassignFlowTask); this only controls whether the
    // trigger renders.
    const canReassignOthersInGrid = viewRole === "ADMIN" || viewRole === "ELEVATED_DEPT_SITE";

    // Builds one department's TaskOverviewStack — extracted (2026-08-22) so
    // the single-department view and the new "All Departments" view (which
    // renders this once per department, stacked under its own heading)
    // share one definition instead of two copies that can drift.
    function renderDepartmentStack(
      department: string,
      dailyDetail: Awaited<ReturnType<typeof getDepartmentDetail>>,
      monthlyDetail: Awaited<ReturnType<typeof getDepartmentDetail>>,
      hodAssignedDetail: Awaited<ReturnType<typeof getDepartmentHodAssigned>> | null,
      ceoAssignedDetail: Awaited<ReturnType<typeof getDepartmentCeoAssigned>> | null,
    ): ReactNode {
      return (
        <TaskOverviewStack
          entityName={department}
          categories={categoryList}
          myUserId={daily.me.me.userId}
          daily={{
            entity: dailyDetail.department,
            dateControl: (
              <DailyDatePicker
                key="admin-dept-daily-picker"
                value={dailyDetail.date}
                basePath="/task-manager"
                extraParams={{ view: "department", department }}
              />
            ),
            showViewToggle: true,
            myWeek: buildMyWeek({ basePath: "/task-manager", extraParams: { view: "department", department } }),
          }}
          monthly={{
            entity: monthlyDetail.department,
            dateControl: (
              <div key="admin-dept-monthly-controls" className="flex items-center gap-1.5">
                <MonthDropdown
                  key="admin-dept-monthly-picker"
                  value={monthlyDetail.date}
                  basePath="/task-manager"
                  extraParams={{ view: "department", department }}
                />
                {/* Full month/1-7/8-14/15-21/22-{end} range dropdown
                    (2026-08-21) — this admin/OPS/elevated-dept-site
                    drill-down had no range filtering at all before;
                    getDepartmentDetail now threads monthDays into
                    getEntityPayload the same way getFlowDetail already
                    does for HOD/DEPT_SITE's own Department Overview. */}
                <MonthRangeDropdown
                  value={monthlyDetail.date}
                  range={monthlyRangeParam}
                  basePath="/task-manager"
                  extraParams={{ view: "department", department }}
                />
              </div>
            ),
            showViewToggle: true,
          }}
          hodAssigned={hodAssignedDetail ? { entity: hodAssignedDetail.department, showViewToggle: true } : undefined}
          ceoAssigned={ceoAssignedDetail ? { entity: ceoAssignedDetail.department, showViewToggle: true } : undefined}
          onComplete={completeTask}
          onSkip={skipTask}
          onReopen={reopenTask}
          onUploadProof={uploadProof}
          onRemoveProof={removeProof}
          reassign={cardReassign}
          canReassignOthers={canReassignOthersInGrid}
        />
      );
    }

    async function buildEntityOverview(): Promise<ReactNode> {
      const view = entityView;
      let overview: ReactNode;
      if (view === "department") {
        // "All Departments" (2026-08-22, rebuilt as a department-level donut
        // grid per user request — the earlier per-person-stack-per-
        // department version, and a separate donut-grid-replaces-it
        // iteration, were both tried and reverted same day before landing
        // here). One card per DEPARTMENT (aggregated across everyone in
        // it), not one per person — picking a single real department below
        // still gets the full per-person TaskOverviewStack, unchanged.
        // Fed by daily.org.departments/monthly.org.departments — already
        // computed by this page's own getFlowDetail() calls above (for
        // every ADMIN/OPS/elevated-dept-site/CEO viewer who can reach this
        // dropdown at all — see canViewOrg/isElevatedDeptSite in
        // getFlowDetail, queries.ts), so this needs no fetch of its own.
        // Sentinel dropdown value, not a real FLOW_DEPARTMENTS entry — see
        // the EntityPicker options below.
        if (sp.department === ALL_DEPARTMENTS_VALUE) {
          // Default Monthly range to the week-chunk containing TODAY, not
          // "Full month" (2026-08-22, user request — same default the
          // personal Monthly section already uses, defaultMonthRange,
          // types.ts) — only when the anchor month being viewed is the real
          // current month; defaultMonthRange itself falls back to "" (Full
          // month) otherwise.
          const [allDeptsMonthlyY, allDeptsMonthlyM] = monthly.date.split("-").map(Number);
          const allDeptsDefaultRange = defaultMonthRange(allDeptsMonthlyY, allDeptsMonthlyM, new Date());
          const allDeptsMonthlyRange = monthlyRangeParam ?? allDeptsDefaultRange;
          // The page's shared top-level `monthly` fetch above was clamped
          // to ?mrange= when present, else left UNCLAMPED (Full month) — so
          // when the dropdown's default just switched to today's chunk but
          // the URL still has no ?mrange=, `monthly.org.departments` is
          // stale (Full month totals, not this chunk's). Re-fetch ONLY in
          // that one case; every other case (an explicit ?mrange=, or a
          // past/future anchor month with no "today chunk" at all) reuses
          // the shared fetch unchanged — no extra request.
          const allDeptsMonthDepartments =
            monthlyRangeParam === undefined && allDeptsDefaultRange
              ? await getOrgMonthlyDepartments(email, monthlyDate, parseMonthRange(allDeptsDefaultRange)!)
              : monthly.org?.departments ?? [];
          overview = (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <EntityPicker
                  label="Department"
                  value={ALL_DEPARTMENTS_VALUE}
                  groups={[{ options: [ALL_DEPARTMENTS_VALUE, ...FLOW_DEPARTMENTS] }]}
                  param="department"
                  basePath="/task-manager"
                  extraParams={{ view: "department", ...(dailyDate ? { date: dailyDate } : {}) }}
                  boldValues={[ALL_DEPARTMENTS_VALUE]}
                  userId={daily.me.me.userId}
                  hasExplicitValue={sp.department === ALL_DEPARTMENTS_VALUE}
                />
                <CardModeToggle />
              </div>
              <AllDepartmentsSection
                sectionLabel="Daily"
                departments={daily.org?.departments ?? []}
                dateControl={
                  <DailyDatePicker
                    key="all-departments-daily-picker"
                    value={daily.date}
                    basePath="/task-manager"
                    extraParams={{ view: "department", department: ALL_DEPARTMENTS_VALUE }}
                  />
                }
              />
              <AllDepartmentsSection
                sectionLabel="Monthly"
                departments={allDeptsMonthDepartments}
                dateControl={
                  <div key="all-departments-monthly-controls" className="flex items-center gap-1.5">
                    <MonthDropdown
                      key="all-departments-monthly-picker"
                      value={monthly.date}
                      basePath="/task-manager"
                      extraParams={{ view: "department", department: ALL_DEPARTMENTS_VALUE }}
                    />
                    <MonthRangeDropdown
                      value={monthly.date}
                      range={allDeptsMonthlyRange}
                      basePath="/task-manager"
                      extraParams={{ view: "department", department: ALL_DEPARTMENTS_VALUE }}
                    />
                  </div>
                }
              />
            </>
          );
          return overview;
        }

        // Default to the ACCOUNT'S OWN department when it has one — the
        // elevated sites always do, and od@ (Superadmin = the Optimisation
        // Department's login) carries Optimisation since the 2026-07-25
        // decision. First list item only as the last resort.
        const own = daily.me.me.department;
        const fallback =
          own && (FLOW_DEPARTMENTS as readonly string[]).includes(own)
            ? own
            : FLOW_DEPARTMENTS[0];
        const department =
          sp.department && (FLOW_DEPARTMENTS as readonly string[]).includes(sp.department)
            ? sp.department
            : fallback;
        const [dailyDetail, monthlyDetail, hodAssignedDetail, ceoAssignedDetail] = await Promise.all([
          getDepartmentDetail(email, department, "daily", dailyDate),
          getDepartmentDetail(email, department, "monthly", monthlyDate, monthlyRange ?? undefined),
          getDepartmentHodAssigned(email, department).catch(() => null),
          getDepartmentCeoAssigned(email, department).catch(() => null),
        ]);
        overview = (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <EntityPicker
                label="Department"
                value={department}
                groups={[{ options: [ALL_DEPARTMENTS_VALUE, ...FLOW_DEPARTMENTS] }]}
                param="department"
                basePath="/task-manager"
                extraParams={{ view: "department", ...(dailyDate ? { date: dailyDate } : {}) }}
                boldValues={[ALL_DEPARTMENTS_VALUE]}
                userId={daily.me.me.userId}
                hasExplicitValue={sp.department === department}
              />
              <CardModeToggle />
            </div>
            {renderDepartmentStack(department, dailyDetail, monthlyDetail, hodAssignedDetail, ceoAssignedDetail)}
          </>
        );
      } else {
        // "All Regions" (2026-08-25, user request) — mirrors the "All
        // Departments" branch above: one donut/list card per region
        // instead of the usual single-branch TaskOverviewStack.
        // org.regions is already fetched by the SAME top-level
        // getFlowDetail() calls as everything else on this page (already
        // roster-first — see sumRegionRollup's own doc comment for why
        // this reads org.regions and NOT org.branches) — no new fetch for
        // Daily. Monthly reuses the SAME "default to today's chunk" fix
        // All Departments has — getOrgMonthlyRegions only runs in the one
        // case the shared top-level `monthly` fetch doesn't already cover
        // (see that branch's own comment above for the full reasoning).
        if (sp.branch === ALL_REGIONS_VALUE) {
          const [allRegionsMonthlyY, allRegionsMonthlyM] = monthly.date.split("-").map(Number);
          const allRegionsDefaultRange = defaultMonthRange(allRegionsMonthlyY, allRegionsMonthlyM, new Date());
          const allRegionsMonthlyRange = monthlyRangeParam ?? allRegionsDefaultRange;
          const allRegionsMonthlyRegions =
            monthlyRangeParam === undefined && allRegionsDefaultRange
              ? await getOrgMonthlyRegions(email, monthlyDate, parseMonthRange(allRegionsDefaultRange)!)
              : monthly.org?.regions ?? [];
          overview = (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <EntityPicker
                  label="Branch"
                  value={ALL_REGIONS_VALUE}
                  groups={[
                    { options: [ALL_REGIONS_VALUE] },
                    ...FLOW_BRANCH_REGIONS.map((r) => ({
                      label: r.name,
                      options: [allRegionValue(r.name), ...r.branches],
                    })),
                  ]}
                  param="branch"
                  basePath="/task-manager"
                  extraParams={{ view: "branch", ...(dailyDate ? { date: dailyDate } : {}) }}
                  boldValues={ALL_BRANCH_BOLD_VALUES}
                  userId={daily.me.me.userId}
                  hasExplicitValue={sp.branch === ALL_REGIONS_VALUE}
                />
                <CardModeToggle />
              </div>
              <AllDepartmentsSection
                groupLabel="All Regions"
                sectionLabel="Daily"
                departments={(daily.org?.regions ?? []).map(sumRegionRollup)}
                dateControl={
                  <DailyDatePicker
                    key="all-regions-daily-picker"
                    value={daily.date}
                    basePath="/task-manager"
                    extraParams={{ view: "branch", branch: ALL_REGIONS_VALUE }}
                  />
                }
              />
              <AllDepartmentsSection
                groupLabel="All Regions"
                sectionLabel="Monthly"
                departments={allRegionsMonthlyRegions.map(sumRegionRollup)}
                dateControl={
                  <div key="all-regions-monthly-controls" className="flex items-center gap-1.5">
                    <MonthDropdown
                      key="all-regions-monthly-picker"
                      value={monthly.date}
                      basePath="/task-manager"
                      extraParams={{ view: "branch", branch: ALL_REGIONS_VALUE }}
                    />
                    <MonthRangeDropdown
                      value={monthly.date}
                      range={allRegionsMonthlyRange}
                      basePath="/task-manager"
                      extraParams={{ view: "branch", branch: ALL_REGIONS_VALUE }}
                    />
                  </div>
                }
              />
            </>
          );
          return overview;
        }

        // "All Region A" / "All Region B" / "All Region C" (2026-08-25) —
        // every branch WITHIN the selected region as its own card (see
        // allRegionValue's own doc comment for how this differs from "All
        // Regions" above). Same zero-new-fetch-for-Daily /
        // getOrgMonthlyRegions-only-when-defaulting pattern as "All
        // Regions" — just a filter down to this one region's branch names
        // instead of sumRegionRollup's sum — this region's own `branches`
        // array (from org.regions, already the correct roster-first
        // per-branch list) is used AS-IS, no filtering needed.
        const selectedAllRegion = regionForAllRegionValue(sp.branch);
        if (selectedAllRegion) {
          const branchesOf = (regions: { name: string; branches: FlowEntityRollup[] }[]) =>
            regions.find((r) => r.name === selectedAllRegion.name)?.branches ?? [];
          const [oneRegionMonthlyY, oneRegionMonthlyM] = monthly.date.split("-").map(Number);
          const oneRegionDefaultRange = defaultMonthRange(oneRegionMonthlyY, oneRegionMonthlyM, new Date());
          const oneRegionMonthlyRange = monthlyRangeParam ?? oneRegionDefaultRange;
          const oneRegionMonthlyRegions =
            monthlyRangeParam === undefined && oneRegionDefaultRange
              ? await getOrgMonthlyRegions(email, monthlyDate, parseMonthRange(oneRegionDefaultRange)!)
              : monthly.org?.regions ?? [];
          overview = (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <EntityPicker
                  label="Branch"
                  value={allRegionValue(selectedAllRegion.name)}
                  groups={[
                    { options: [ALL_REGIONS_VALUE] },
                    ...FLOW_BRANCH_REGIONS.map((r) => ({
                      label: r.name,
                      options: [allRegionValue(r.name), ...r.branches],
                    })),
                  ]}
                  param="branch"
                  basePath="/task-manager"
                  extraParams={{ view: "branch", ...(dailyDate ? { date: dailyDate } : {}) }}
                  boldValues={ALL_BRANCH_BOLD_VALUES}
                  userId={daily.me.me.userId}
                  hasExplicitValue={sp.branch === allRegionValue(selectedAllRegion.name)}
                />
                <CardModeToggle />
              </div>
              <AllDepartmentsSection
                groupLabel={selectedAllRegion.name}
                sectionLabel="Daily"
                departments={branchesOf(daily.org?.regions ?? [])}
                dateControl={
                  <DailyDatePicker
                    key="all-region-daily-picker"
                    value={daily.date}
                    basePath="/task-manager"
                    extraParams={{ view: "branch", branch: allRegionValue(selectedAllRegion.name) }}
                  />
                }
              />
              <AllDepartmentsSection
                groupLabel={selectedAllRegion.name}
                sectionLabel="Monthly"
                departments={branchesOf(oneRegionMonthlyRegions)}
                dateControl={
                  <div key="all-region-monthly-controls" className="flex items-center gap-1.5">
                    <MonthDropdown
                      key="all-region-monthly-picker"
                      value={monthly.date}
                      basePath="/task-manager"
                      extraParams={{ view: "branch", branch: allRegionValue(selectedAllRegion.name) }}
                    />
                    <MonthRangeDropdown
                      value={monthly.date}
                      range={oneRegionMonthlyRange}
                      basePath="/task-manager"
                      extraParams={{ view: "branch", branch: allRegionValue(selectedAllRegion.name) }}
                    />
                  </div>
                }
              />
            </>
          );
          return overview;
        }

        const branch =
          sp.branch && ALL_BRANCHES.includes(sp.branch) ? sp.branch : DEFAULT_BRANCH;
        // No ceoAssigned/hodAssigned fetch here (2026-08-18, fixed
        // 2026-08-22) — branches have no HOD, so both would always be
        // structurally empty (getBranchHodAssigned WAS still being called
        // until 2026-08-22, a leftover bug: it zero-filled the whole branch
        // roster into a section that could never show real data, since no
        // branch is ever assigned tasks by an HOD). "Ad hoc Task" replaces
        // it instead — the section branches actually have, scoped to just
        // the Branch Manager (getEntityAdhocAssignedPayload's
        // restrictRosterToRole: "BRANCH", _payloads.ts) since ad hoc tasks
        // are fundamentally their own work, not the whole roster's.
        const [dailyDetail, monthlyDetail, adhocAssignedDetail] = await Promise.all([
          getBranchDetail(email, branch, "daily", dailyDate),
          getBranchDetail(email, branch, "monthly", monthlyDate, monthlyRange ?? undefined),
          getBranchAdhocAssigned(email, branch).catch(() => null),
        ]);
        overview = (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <EntityPicker
                label="Branch"
                value={branch}
                groups={[
                  { options: [ALL_REGIONS_VALUE] },
                  ...FLOW_BRANCH_REGIONS.map((r) => ({
                    label: r.name,
                    options: [allRegionValue(r.name), ...r.branches],
                  })),
                ]}
                param="branch"
                basePath="/task-manager"
                extraParams={{ view: "branch", ...(dailyDate ? { date: dailyDate } : {}) }}
                boldValues={ALL_BRANCH_BOLD_VALUES}
                userId={daily.me.me.userId}
                hasExplicitValue={sp.branch === branch}
              />
              <CardModeToggle />
            </div>
            <TaskOverviewStack
              entityName={branch}
              categories={categoryList}
              myUserId={daily.me.me.userId}
              daily={{
                entity: dailyDetail.branch,
                dateControl: (
                  <DailyDatePicker
                    key="admin-branch-daily-picker"
                    value={dailyDetail.date}
                    basePath="/task-manager"
                    extraParams={{ view: "branch", branch }}
                  />
                ),
                showViewToggle: true,
                myWeek: buildMyWeek({ basePath: "/task-manager", extraParams: { view: "branch", branch } }),
              }}
              monthly={{
                entity: monthlyDetail.branch,
                dateControl: (
                  <div key="admin-branch-monthly-controls" className="flex items-center gap-1.5">
                    <MonthDropdown
                      key="admin-branch-monthly-picker"
                      value={monthlyDetail.date}
                      basePath="/task-manager"
                      extraParams={{ view: "branch", branch }}
                    />
                    {/* Full month/1-7/8-14/15-21/22-{end} range dropdown
                        (2026-08-21) — see the department block's identical
                        comment just above. */}
                    <MonthRangeDropdown
                      value={monthlyDetail.date}
                      range={monthlyRangeParam}
                      basePath="/task-manager"
                      extraParams={{ view: "branch", branch }}
                    />
                  </div>
                ),
                showViewToggle: true,
              }}
              adhocAssigned={
                adhocAssignedDetail ? { entity: adhocAssignedDetail.branch, showViewToggle: false } : undefined
              }
              onComplete={completeTask}
              onSkip={skipTask}
              onReopen={reopenTask}
              onUploadProof={uploadProof}
              onRemoveProof={removeProof}
              reassign={cardReassign}
              canReassignOthers={canReassignOthersInGrid}
            />
          </>
        );
      }
      return overview;
    }

    if (shows(viewRole, "taskManager", "entityDropdowns") && viewRole !== "CEO") {
      // Superadmin + elevated department sites (Operations/Optimisation):
      // the dropdown overview IS the whole page. The CEO (also configured
      // with entityDropdowns) instead gets it appended below their own
      // sections — see the CEO block after the TaskManagerView body.
      body = (
        <div className="flex flex-col gap-6">
          <ModeTabs active={entityView} date={dailyDate} />
          {/* CardModeProvider (2026-08-22): one List/Donut toggle governs
              every Daily/Monthly section AND the All Departments donut/list
              section underneath — see card-mode-context.tsx. Persisted
              per-user (userId) since 2026-08-22. */}
          <CardModeProvider userId={daily.me.me.userId}>{await buildEntityOverview()}</CardModeProvider>
        </div>
      );

      return (
        <AppShell email={email} role={su.role} name={su.name}>
          <div className="mx-auto flex max-w-[1400px] flex-col gap-6 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold">Task Manager</h1>
              </div>
              {headerAction}
            </div>
            {body}
          </div>
        </AppShell>
      );
    }

    // HOD only: their own board's cards + columns.
    let hodKanban: Parameters<typeof TaskManagerView>[0]["hodKanban"];
    if (daily.me.me.role === "HOD") {
      const { cards, columns } = await getHodKanban(email);
      hodKanban = { cards, columns, actions: hodKanbanActions };
    }

    // HOD/DEPT_SITE inline Details: the same Daily date filter as the
    // dropdown overviews ("everywhere this layout appears" — 2026-07-25).
    // Only their own-department Daily section follows the selected date;
    // personal cards and Monthly stay on today/current month.
    let departmentDaily: Parameters<typeof TaskManagerView>[0]["departmentDaily"];
    let departmentDailyControl: ReactNode | undefined;
    if (daily.kind === "department" && daily.department) {
      const detail = await getDepartmentDetail(email, daily.department.name, "daily", dailyDate);
      departmentDaily = detail.department;
      departmentDailyControl = (
        <DailyDatePicker
          key="dept-daily-picker"
          value={detail.date}
          basePath="/task-manager"
          extraParams={monthlyCarry}
        />
      );
    }

    // EntityCardOverview's "HOD Assigned Task" filter (Overview card redesign,
    // 2026-08-12) — only meaningful for the roles that actually render
    // Department/Branch Overview below (HOD/DEPT_SITE, BRANCH/BRANCH_SITE),
    // so gated on the SAME daily.department/daily.branch presence the render
    // guards use, mirroring getFlowDetail's own kind-based conditionality
    // rather than introducing a new pattern. A viewer without access to that
    // specific entity (or any other failure) shouldn't fail the whole page
    // load, so each is caught individually — same defensive shape as the
    // rest of this page's optional fetches. (categoryList is fetched once,
    // higher up, and reused here.)
    const [hodAssignedDepartment, hodAssignedBranch, ceoAssignedDepartment, adhocAssignedBranch] =
      await Promise.all([
        daily.department
          ? getDepartmentHodAssigned(email, daily.department.name).catch(() => null)
          : Promise.resolve(null),
        daily.branch
          ? getBranchHodAssigned(email, daily.branch.name).catch(() => null)
          : Promise.resolve(null),
        // CEO Assigned Task (2026-08-12 stacked-sections redesign) — visible
        // on any department view (HOD, DEPT_SITE, and ADMIN/ELEVATED_DEPT_SITE/
        // CEO via entityDropdowns); the roster inside is restricted to HOD
        // only (getEntityCeoAssignedPayload's restrictRosterToRole, 2026-08-18)
        // since CEO only ever assigns to the HOD — no branch-side fetch at
        // all, branches never have an HOD member to show.
        daily.department
          ? getDepartmentCeoAssigned(email, daily.department.name).catch(() => null)
          : Promise.resolve(null),
        // "Ad hoc" (2026-08-18, extended to Branch Site 2026-08-18 donut
        // sweep) — Branch Manager's own page AND the view-only Branch Site
        // login (whose old standalone ad hoc donut card was folded into
        // this SAME roster card-grid slot instead — see
        // task-manager-view.tsx's branchOverview render).
        daily.branch && (viewRole === "BRANCH_MANAGER" || viewRole === "BRANCH_SITE")
          ? getBranchAdhocAssigned(email, daily.branch.name).catch(() => null)
          : Promise.resolve(null),
      ]);

    // DEPT_MEMBER/BRANCH_MEMBER/COACH's whole-department/branch Daily
    // section (2026-08-12, corrected design — confirmed: plain staff see
    // their whole department/branch's Daily roster, not just their own
    // row). Only meaningful for roles resolving to myOverview with no
    // owned entity but a real department/branch membership — gated on the
    // same daily.me.me.department/branch fields the new getDepartmentDetail/
    // getBranchDetail MEMBER-daily exception checks server-side. Uses the
    // SAME getDepartmentDetail/getBranchDetail functions HOD's own
    // department Daily section already uses — just a different caller
    // identity, newly permitted by Task 3's exception.
    const memberOwnDepartment = daily.me.me.role === "MEMBER" ? daily.me.me.department : null;
    const memberOwnBranch = daily.me.me.role === "MEMBER" ? daily.me.me.branch : null;
    const [memberWholeDepartmentDaily, memberWholeBranchDaily] = await Promise.all([
      memberOwnDepartment
        ? getDepartmentDetail(email, memberOwnDepartment, "daily", dailyDate).catch(() => null)
        : Promise.resolve(null),
      memberOwnBranch
        ? getBranchDetail(email, memberOwnBranch, "daily", dailyDate).catch(() => null)
        : Promise.resolve(null),
    ]);

    // Personal date filters (2026-07-28): one control per period, mounted by
    // the view on BOTH that period's personal surfaces (donut card + "My
    // Tasks" heading) — a single ?date=/?mdate= selection drives donut and
    // list together. Each carries the other's param so the two selections
    // never reset each other. Not for the CEO (un-windowed combined list).
    const personalDailyControl = (
      <DailyDatePicker
        key="personal-daily-picker"
        value={daily.date}
        basePath="/task-manager"
        extraParams={monthlyCarry}
      />
    );
    // Monthly selector (2026-07-30 layout): compact [Month ▾][Range ▾]
    // pair for the donut card heading; on "My Tasks — Monthly" the compact
    // [Month ▾] dropdown sits in the section heading and the range chunks
    // (Full month · 1-7 · 8-14 · 15-21 · 22-{end}) render as a vertical
    // sidebar with pending counts, mirroring Daily's weekday sidebar. All
    // drive the shared ?mdate=/?mrange= — changing month resets to Full
    // month.
    // Monthly heading control, shared by myOverview's own Monthly (OPS/CEO)
    // AND Branch Overview's Monthly (2026-08-18: reverted the earlier split
    // — "Full month" is now one of the "My Month" tab strip's own tabs
    // below, alongside the day-range chunks, instead of only living in this
    // dropdown; both stay in sync via the same ?mrange= value, so there's
    // no contradiction between them anymore).
    const personalMonthlyControl = (
      <div key="personal-monthly-controls" className="flex items-center gap-1.5">
        <MonthDropdown value={monthly.date} basePath="/task-manager" extraParams={dailyCarry} />
        <MonthRangeDropdown
          value={monthly.date}
          range={monthlyRangeParam}
          basePath="/task-manager"
          extraParams={dailyCarry}
        />
      </div>
    );
    // Personal (self-only) Monthly card default (2026-08-26, user request):
    // when ?mrange= is untouched, default to the week-range chunk containing
    // TODAY (e.g. "22-31") instead of Full month — same "only-when-
    // defaulting" pattern All Departments/All Regions already use (this
    // page's own buildEntityOverview), just for myOverviewData.monthly
    // specifically. Deliberately a SEPARATE control/data source from
    // personalMonthlyControl/monthly.me above — that pair is also shared by
    // HOD's departmentOverview.monthly and Branch Manager's
    // branchOverview.monthly (task-manager-view.tsx), which weren't part of
    // this request and stay on the existing "Full month by default" behavior
    // unless asked for too.
    const [personalMonthlyAnchorY, personalMonthlyAnchorM] = monthly.date.split("-").map(Number);
    const personalMonthlyDefaultRange = defaultMonthRange(personalMonthlyAnchorY, personalMonthlyAnchorM, new Date());
    const personalMonthlyRangeParam = monthlyRangeParam ?? personalMonthlyDefaultRange;
    const personalMonthlyMe =
      monthlyRangeParam === undefined && personalMonthlyDefaultRange
        ? (await getFlowDetail(email, "monthly", monthlyDate, { monthDays: parseMonthRange(personalMonthlyDefaultRange)! }))
            .me
        : monthly.me;
    const personalMonthlyControlSelf = (
      <div key="personal-monthly-controls-self" className="flex items-center gap-1.5">
        <MonthDropdown value={monthly.date} basePath="/task-manager" extraParams={dailyCarry} />
        <MonthRangeDropdown
          value={monthly.date}
          range={personalMonthlyRangeParam}
          basePath="/task-manager"
          extraParams={dailyCarry}
        />
      </div>
    );
    // "HOD Assigned Task" for individual staff — DEPT_MEMBER only
    // (2026-08-18 fix, matches Home's own role-views.ts scoping:
    // DEPT_MEMBER.home includes "hodAssigned"; BRANCH_MEMBER/COACH's home
    // arrays don't — branch-side staff report to a Branch Manager, not a
    // department HOD, so this section doesn't apply to them). ALL-TIME
    // (2026-08-20 — was its own independent ?hdate=-windowed fetch via
    // getFlowOverview; removed in favor of daily.me.streamsAll, the SAME
    // all-time source the department-wide "HOD Assigned Task" view already
    // uses, so a person's own card and their card within the department
    // roster grid now always show identical numbers. No extra fetch
    // needed — daily.me.streamsAll is already part of the Daily section's
    // own payload, fetched above regardless of this section.
    const isIndividualStaff = viewRole === "DEPT_MEMBER";
    // Branch Manager's personal Ad hoc card + list (2026-07-29
    // simplification: NO date filter — ad hoc tasks are one-off/irregular,
    // so both the card and the always-rendered list show the plain ALL-TIME
    // personal set, matching every other Ad hoc view in the app).
    let personalAdhoc: Parameters<typeof TaskManagerView>[0]["personalAdhoc"];
    if (shows(viewRole, "taskManager", "personalAdhoc")) {
      const all = daily.me.adhocAll?.tasks ?? [];
      const buckets = flowBucketize(all);
      personalAdhoc = {
        totals: {
          completed: buckets.completed.length,
          pending: buckets.pending.length,
          na: buckets.na.length,
        },
        tasks: buckets,
        flatTasks: all,
      };
    }

    // myOverview (2026-08-12): built for every role — TaskManagerView only
    // renders it when role-views.ts's shows(view, "taskManager", "myOverview")
    // is true (HOD/DEPT_SITE/BRANCH_MANAGER/BRANCH_SITE/ADMIN/
    // ELEVATED_DEPT_SITE never read this prop; it's harmless to always
    // build it, same defensive-but-simple shape as the rest of this
    // function's optional fetches).
    const myOverviewData = {
      // Empty (2026-08-15, was daily.me.me.name, briefly "My Tasks") —
      // EntityCardOverview omits the "X — " heading prefix entirely when
      // entityName is empty, printing just "Daily"/"Monthly" alone. Every
      // myOverview section is inherently the viewer's own overview, and the
      // Person-sort card directly below already says "My Tasks" (isOwnCard
      // check) — so this heading saying "My Tasks — Daily" right above a
      // card ALSO saying "My Tasks" was itself a redundant repeat, the same
      // class of issue this was meant to fix in the first place.
      entityName: "",
      daily: memberWholeDepartmentDaily
        ? {
            entity: memberWholeDepartmentDaily.department,
            dateControl: personalDailyControl,
            showViewToggle: true,
            defaultOnlyMe,
            myWeek: personalMyWeek,
          }
        : memberWholeBranchDaily
          ? {
              entity: memberWholeBranchDaily.branch,
              dateControl: personalDailyControl,
              showViewToggle: true,
              defaultOnlyMe,
              myWeek: personalMyWeek,
            }
          : {
              entity: toSelfEntityDetail(daily.me.me, daily.me),
              dateControl: personalDailyControl,
              showViewToggle: false,
              myWeek: personalMyWeek,
            },
      // Monthly stays self-only for every myOverview role, always — even
      // DEPT_MEMBER (whose Daily section is whole-department) keeps
      // Monthly self-scoped, per the confirmed correction. Omitted
      // entirely for BRANCH_MEMBER/COACH (Daily-only) — see below.
      monthly: {
        entity: toSelfEntityDetail(personalMonthlyMe.me, personalMonthlyMe),
        dateControl: personalMonthlyControlSelf,
        showViewToggle: false,
        // Side-tab strip (2026-08-21) — see personalMyMonth's own doc
        // comment above. undefined for every role except OPS/DEPT_MEMBER,
        // harmless no-op for the rest (EntityCardOverview only renders the
        // tab strip when myMonth is set).
        myMonth: personalMyMonth,
      },
      // "HOD Assigned Task" for individual staff (2026-08-15, after
      // Monthly — TaskOverviewStack's own stacking order already puts it
      // there) — DEPT_MEMBER only (see isIndividualStaff above). ALL-TIME
      // (2026-08-20 fix) — reads daily.me.streamsAll's "HOD" entry
      // directly, the SAME per-person assigner-role grouping Home's own
      // "HOD assigned" card reads (scoped-overview-section.tsx) and the
      // SAME all-time source the department-wide "HOD Assigned Task" view
      // uses, so this card's numbers always match that view's. No owned
      // entity to scope a department/branch-wide hodAssigned fetch to,
      // unlike HOD's/BRANCH's own Department/Branch Overview sections
      // below (which were already all-time, unchanged). Always present
      // (never omitted) even with zero tasks, same as Daily/Monthly.
      hodAssigned: isIndividualStaff
        ? {
            entity: toSelfEntityDetail(
              daily.me.me,
              daily.me.streamsAll.find((s) => s.key === "HOD") ?? {
                totals: { completed: 0, pending: 0, na: 0 },
                tasks: [],
              },
            ),
            showViewToggle: false,
          }
        : undefined,
    };

    body = (
      <TaskManagerView
        daily={daily}
        monthly={monthly}
        period={period}
        dailyHref={href("daily")}
        monthlyHref={href("monthly")}
        assignAction={assign}
        completeTaskAction={completeTask}
        skipTaskAction={skipTask}
        reopenTaskAction={reopenTask}
        uploadProofAction={uploadProof}
        removeProofAction={removeProof}
        updateDueDateAction={updateDueDate}
        reassign={reassign}
        cardReassign={cardReassign}
        manpowerScheduleHref="/task-manager/manpower-schedule"
        staff={staff}
        hodKanban={hodKanban}
        departmentDaily={departmentDaily}
        departmentDailyControl={departmentDailyControl}
        hodAssignedDepartment={hodAssignedDepartment}
        hodAssignedBranch={hodAssignedBranch}
        ceoAssignedDepartment={ceoAssignedDepartment}
        adhocAssignedBranch={adhocAssignedBranch}
        categoryList={categoryList}
        myWeek={personalMyWeek}
        myMonth={personalMyMonth}
        myOverview={{
          entityName: myOverviewData.entityName,
          daily: myOverviewData.daily,
          // BRANCH_MEMBER/COACH are Daily-only (role-views.ts) — checked
          // directly by role rather than inferring it from their weekday
          // range, which exists for a different purpose (picking sidebar
          // days) and isn't guaranteed to stay coupled to Daily-only-ness.
          // CEO dropped too (2026-08-19, explicit request) — CEO only needs
          // the weekday view now, no separate Monthly section.
          monthly:
            viewRole === "BRANCH_MEMBER" || viewRole === "COACH" || viewRole === "CEO"
              ? undefined
              : myOverviewData.monthly,
          hodAssigned: myOverviewData.hodAssigned,
        }}
        personalDailyControl={personalDailyControl}
        personalMonthlyControl={personalMonthlyControl}
        personalAdhoc={personalAdhoc}
        // CEO's own delegated-out list ("CEO Assigned Task", 2026-08-19
        // revival of ceoTaskTable) — every task CEO personally started,
        // all-time, already computed by getMePayload as daily.me.delegatedAll
        // (unused by any render until now). Only CEO has this SectionKey, so
        // no need to gate the prop itself — an undefined value is harmless
        // for every other role.
        ceoDelegatedAll={viewRole === "CEO" ? daily.me.delegatedAll : undefined}
        // HOD's own delegated-out list ("Tasks I Assigned", 2026-08-19
        // revival of assignedByMeList) — same daily.me.delegatedAll shape as
        // ceoDelegatedAll above, just gated to HOD instead of CEO.
        hodDelegatedAll={viewRole === "HOD" ? daily.me.delegatedAll : undefined}
      />
    );

    // CEO (2026-08-01): the superadmin-style Department | Branch dropdown
    // overview appended BELOW their own sections — same builder, same
    // components, full cross-department/branch visibility (canViewOrg
    // already authorizes CEO in the data layer). Only the CEO reaches
    // here with entityDropdowns configured — ADMIN/elevated early-return
    // above.
    if (shows(viewRole, "taskManager", "entityDropdowns")) {
      body = (
        <div className="flex flex-col gap-6">
          {body}
          <PageSectionHeading>Department / Branch Overview</PageSectionHeading>
          <ModeTabs active={entityView} date={dailyDate} />
          <CardModeProvider userId={daily.me.me.userId}>{await buildEntityOverview()}</CardModeProvider>
        </div>
      );
    }
  } catch (err) {
    if (err instanceof SetupPendingError) {
      body = <SetupPendingCard />;
    } else if (err instanceof NoAccountError) {
      body = <NoAccountCard email={email} />;
    } else {
      body = (
        <TaskManagerErrorCard
          message={err instanceof FlowBridgeError ? err.message : "Unexpected error"}
        />
      );
    }
  }

  return (
    <AppShell email={email} role={su.role} name={su.name}>
      <div className="mx-auto flex max-w-[1400px] flex-col gap-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            {noClaimMenu}
            <h1 className="text-2xl font-bold">Task Manager</h1>
          </div>
          {headerAction}
        </div>
        {body}
      </div>
    </AppShell>
  );
}
