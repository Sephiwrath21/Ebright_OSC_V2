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
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
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
  getBranchCeoAssigned,
  getBranchDetail,
  getBranchHodAssigned,
  getDepartmentCeoAssigned,
  getDepartmentDetail,
  getDepartmentHodAssigned,
  getFlowDetail,
  getFlowStaff,
  getHodKanban,
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
  FlowBridgeError,
  NoAccountError,
  SetupPendingError,
} from "@/task-manager/data";
import { isElevatedDeptSite } from "@/task-manager/analytics/_lib";
import {
  canManageTaskTemplateGroups,
  resolveViewRole,
  shows,
  showsAddTaskHeader,
} from "@/task-manager/role-views";
import { TaskManagerView } from "@/task-manager/ui/task-manager-view";
import { AddTaskButton } from "@/task-manager/ui/add-task-button";
import { PageSectionHeading } from "@/task-manager/ui/bits";
import { TaskOverviewStack } from "@/task-manager/ui/task-overview-stack";
import {
  DailyDatePicker,
  EntityPicker,
  MonthDropdown,
  MonthRangeDropdown,
} from "@/task-manager/ui/entity-picker";
import {
  FLOW_BRANCH_REGIONS,
  FLOW_DEPARTMENTS,
  flowBucketize,
  type ActionResult,
  type AssignActionResult,
  type FlowAssignInput,
  type FlowBucketTotals,
  type FlowDrillTask,
  type FlowEntityDetail,
  type FlowKanbanColumnColor,
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

/** Superadmin's top-level mode switch — Department or Branch, never both.
 *  Carries the selected Daily date across so switching modes keeps it. */
function ModeTabs({ active, date }: { active: "department" | "branch"; date?: string }) {
  const base = "rounded-lg px-4 py-1.5 text-sm font-medium";
  const on = "bg-white text-gray-900 shadow-sm";
  const off = "text-gray-500 hover:text-gray-700";
  const suffix = date ? `&date=${date}` : "";
  return (
    <div className="flex w-fit gap-1 rounded-xl bg-gray-100 p-1">
      <Link
        href={`/task-manager?view=department${suffix}`}
        className={`${base} ${active === "department" ? on : off}`}
      >
        Department
      </Link>
      <Link
        href={`/task-manager?view=branch${suffix}`}
        className={`${base} ${active === "branch" ? on : off}`}
      >
        Branch
      </Link>
    </div>
  );
}

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
  }>;
}) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  const su = session.user as { email: string; name?: string | null; role?: string };
  const email = su.email;

  const sp = await searchParams;
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
  const monthlyRangeParam = monthlyRange ? `${monthlyRange.from}-${monthlyRange.to}` : undefined;
  // Every control carries the OTHER filters' raw params along unchanged,
  // so changing one date never resets the others. (Ad hoc is deliberately
  // NOT date-filtered — 2026-07-29 simplification: one-off tasks, plain
  // all-time list.)
  const rawParams = {
    date: dailyDate,
    mdate: monthlyDate,
    mrange: monthlyRangeParam,
  };
  const carryTM = (...except: string[]) =>
    Object.fromEntries(
      Object.entries(rawParams).filter(([k, v]) => v && !except.includes(k)),
    ) as Record<string, string>;
  const monthlyCarry = carryTM("date");
  const dailyCarry = carryTM("mdate", "mrange");

  // Self-scoped sections (2026-08-12 stacked-sections redesign): a role
  // with no owned entity (OPS, CEO, and Monthly for every MEMBER-role
  // viewer) gets a synthetic one-member FlowEntityDetail built from data
  // ALREADY fetched (daily.me/monthly.me's FlowPersonal), not a new query.
  // FlowDrillTask rows here always carry the viewer's own name in
  // assigneeName already (see types.ts's comment on FlowPersonal.tasks).
  function toSelfEntityDetail(
    me: { userId: string; name: string },
    personal: { totals: FlowBucketTotals; tasks: FlowDrillTask[] },
  ): FlowEntityDetail {
    return {
      name: me.name,
      totals: personal.totals,
      tasks: flowBucketize(personal.tasks),
      members: [
        // done/notDone are unused placeholders, not real data — no current
        // consumer (groupTasksByPerson, entity-card-overview.tsx) reads a
        // single-member roster's per-member counts; totals above is what
        // drives the card.
        { userId: me.userId, name: me.name, employmentType: null, department: null, branch: null, done: 0, notDone: 0 },
      ],
    };
  }

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
      revalidatePath("/task-manager/categories");
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
    // "Assign to Others" — same identities as the assign form MINUS the CEO
    // (2026-08-01: the CEO is view-only on the org-wide/department/branch
    // drill-downs — reassigning other people's existing tasks isn't part of
    // that role here, only creating new ones via "+ Task"). The data layer
    // re-checks (incl. HOD's own-department scoping) on every call.
    const canReassign = role === "ADMIN" || role === "OPS" || role === "HOD" || elevatedDeptSite;
    const reassign = canReassign ? { staff, action: reassignTask } : undefined;
    // Same gate as the /task-manager/categories admin page and
    // createTaskCategory's own server-side check — only these viewers get
    // the assign form's inline "+ Add new type" option (2026-08-12).
    const canManageCategories = canManageTaskTemplateGroups({
      role,
      department: daily.me.me.department ?? null,
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
    const entityView: "department" | "branch" = sp.view === "branch" ? "branch" : "department";
    async function buildEntityOverview(): Promise<ReactNode> {
      const view = entityView;
      let overview: ReactNode;
      if (view === "department") {
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
          getDepartmentDetail(email, department, "monthly"),
          getDepartmentHodAssigned(email, department).catch(() => null),
          getDepartmentCeoAssigned(email, department).catch(() => null),
        ]);
        overview = (
          <>
            <EntityPicker
              label="Department"
              value={department}
              groups={[{ options: FLOW_DEPARTMENTS }]}
              param="department"
              basePath="/task-manager"
              extraParams={{ view: "department", ...(dailyDate ? { date: dailyDate } : {}) }}
            />
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
              }}
              monthly={{ entity: monthlyDetail.department, showViewToggle: true }}
              hodAssigned={hodAssignedDetail ? { entity: hodAssignedDetail.department, showViewToggle: true } : undefined}
              ceoAssigned={ceoAssignedDetail ? { entity: ceoAssignedDetail.department, showViewToggle: true } : undefined}
              onComplete={completeTask}
              onSkip={skipTask}
              onReopen={reopenTask}
              onUploadProof={uploadProof}
              onRemoveProof={removeProof}
            />
          </>
        );
      } else {
        const branch =
          sp.branch && ALL_BRANCHES.includes(sp.branch) ? sp.branch : DEFAULT_BRANCH;
        const [dailyDetail, monthlyDetail, hodAssignedDetail, ceoAssignedDetail] = await Promise.all([
          getBranchDetail(email, branch, "daily", dailyDate),
          getBranchDetail(email, branch, "monthly"),
          getBranchHodAssigned(email, branch).catch(() => null),
          getBranchCeoAssigned(email, branch).catch(() => null),
        ]);
        overview = (
          <>
            <EntityPicker
              label="Branch"
              value={branch}
              groups={FLOW_BRANCH_REGIONS.map((r) => ({
                label: r.name,
                options: r.branches,
              }))}
              param="branch"
              basePath="/task-manager"
              extraParams={{ view: "branch", ...(dailyDate ? { date: dailyDate } : {}) }}
            />
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
              }}
              monthly={{ entity: monthlyDetail.branch, showViewToggle: true }}
              hodAssigned={hodAssignedDetail ? { entity: hodAssignedDetail.branch, showViewToggle: true } : undefined}
              ceoAssigned={ceoAssignedDetail ? { entity: ceoAssignedDetail.branch, showViewToggle: true } : undefined}
              onComplete={completeTask}
              onSkip={skipTask}
              onReopen={reopenTask}
              onUploadProof={uploadProof}
              onRemoveProof={removeProof}
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
          {await buildEntityOverview()}
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
    const [hodAssignedDepartment, hodAssignedBranch, ceoAssignedDepartment, ceoAssignedBranch] = await Promise.all([
      daily.department
        ? getDepartmentHodAssigned(email, daily.department.name).catch(() => null)
        : Promise.resolve(null),
      daily.branch
        ? getBranchHodAssigned(email, daily.branch.name).catch(() => null)
        : Promise.resolve(null),
      // CEO Assigned Task (2026-08-12 stacked-sections redesign) — same
      // shape/gating as the HOD-assigned fetch above.
      daily.department
        ? getDepartmentCeoAssigned(email, daily.department.name).catch(() => null)
        : Promise.resolve(null),
      daily.branch
        ? getBranchCeoAssigned(email, daily.branch.name).catch(() => null)
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
      entityName: daily.me.me.name,
      daily: memberWholeDepartmentDaily
        ? { entity: memberWholeDepartmentDaily.department, dateControl: personalDailyControl, showViewToggle: true }
        : memberWholeBranchDaily
          ? { entity: memberWholeBranchDaily.branch, dateControl: personalDailyControl, showViewToggle: true }
          : { entity: toSelfEntityDetail(daily.me.me, daily.me), dateControl: personalDailyControl, showViewToggle: false },
      // Monthly stays self-only for every myOverview role, always — even
      // DEPT_MEMBER (whose Daily section is whole-department) keeps
      // Monthly self-scoped, per the confirmed correction. Omitted
      // entirely for BRANCH_MEMBER/COACH (Daily-only) — see below.
      monthly: { entity: toSelfEntityDetail(monthly.me.me, monthly.me), dateControl: personalMonthlyControl, showViewToggle: false },
      // No HOD/CEO Assigned Task section for OPS/CEO (no owned entity) —
      // DEPT_MEMBER/BRANCH_MEMBER/COACH don't get these either per the
      // confirmed correction, so this stays omitted for every myOverview
      // role. If a future role needs it, wire hodAssigned/ceoAssigned here
      // the same way departmentOverview/branchOverview do (a later task).
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
        reassign={reassign}
        manpowerScheduleHref="/task-manager/manpower-schedule"
        staff={staff}
        hodKanban={hodKanban}
        departmentDaily={departmentDaily}
        departmentDailyControl={departmentDailyControl}
        hodAssignedDepartment={hodAssignedDepartment}
        hodAssignedBranch={hodAssignedBranch}
        ceoAssignedDepartment={ceoAssignedDepartment}
        ceoAssignedBranch={ceoAssignedBranch}
        categoryList={categoryList}
        myOverview={{
          entityName: myOverviewData.entityName,
          daily: myOverviewData.daily,
          // BRANCH_MEMBER/COACH are Daily-only (role-views.ts) — checked
          // directly by role rather than inferring it from their weekday
          // range, which exists for a different purpose (picking sidebar
          // days) and isn't guaranteed to stay coupled to Daily-only-ness.
          monthly: viewRole === "BRANCH_MEMBER" || viewRole === "COACH" ? undefined : myOverviewData.monthly,
        }}
        personalDailyControl={personalDailyControl}
        personalMonthlyControl={personalMonthlyControl}
        personalAdhoc={personalAdhoc}
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
          {await buildEntityOverview()}
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
