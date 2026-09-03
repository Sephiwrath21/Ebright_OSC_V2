// /task-manager/package — Package dashboard (2026-08-06): a second
// instance of the Template Groups feature (see
// task-manager/data/template-groups.ts), scoped to "PACKAGE". Wiring
// mirrors /task-manager/template/page.tsx closely — same "use server"
// action closures, same three-way SetupPendingError/NoAccountError/
// generic-error card handling, same 403-redirect pattern on the initial
// load — just bound to scope: "PACKAGE" throughout and labeled "Package"
// in the UI.
//
// Access (2026-08-07 View/Edit tier split, see role-views.ts and
// template-groups.ts's file header): the first fetch (listTemplateGroups,
// via template-groups.ts's requireGroupViewAccess) IS the View-tier gate —
// a genuine 403 there redirects to /task-manager. Package's View tier is
// wider than Template's: Super Admin, elevated Operations/Optimisation
// dept-site, HOD, CEO, AND Branch Manager. Of those, only Edit-tier roles
// (Super Admin + elevated dept-site — canManageTaskTemplateGroups) get the
// create/edit/delete/assign action buttons — Branch Manager is View-only
// here now (revised 2026-08-07; previously Branch Manager alone could
// assign/view-assignees). `canEdit`, computed below from getMyRole +
// canManageTaskTemplateGroups (same pattern as template/page.tsx), is
// passed to TemplateGroupDashboard to gate those buttons client-side as a
// UI-layer defense-in-depth — the real enforcement is
// template-groups.ts's requireGroupEditAccess on every mutating action
// closure below.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { requireLiveSession } from "@/task-manager/action-session";
import AppShell from "@/app/components/AppShell";
import { canManageTaskTemplateGroups } from "@/task-manager/role-views";
import {
  applyTemplateGroup,
  createTaskCategory,
  createTemplateGroup,
  deleteTemplateGroup,
  editTemplateGroup,
  getGroupAssignees,
  getGroupDeletionImpact,
  getGroupEditImpact,
  getFlowStaff,
  getMyRole,
  getTemplateGroup,
  listActiveTaskCategories,
  listTemplateGroups,
  removeGroupAssignee,
  FlowBridgeError,
  NoAccountError,
  SetupPendingError,
} from "@/task-manager/data";
import { TemplateGroupDashboard } from "@/task-manager/ui/template-group-dashboard";
import {
  NoAccountCard,
  SetupPendingCard,
  TaskManagerErrorCard,
} from "@/task-manager/ui/status-cards";
import { FLOW_DAYS } from "@/task-manager/ui/types";
import type {
  FlowTemplateGroupApplyInput,
  FlowTemplateGroupTaskInput,
  TemplateGroupApplyResult,
  TemplateGroupAssigneesResult,
  TemplateGroupDeleteResult,
  TemplateGroupEditResult,
  TemplateGroupImpactResult,
  TemplateGroupLoadResult,
  TemplateGroupRemoveAssigneeResult,
  TemplateGroupSaveResult,
} from "@/task-manager/ui/types";

export const dynamic = "force-dynamic";

const FALLBACK_MESSAGE = "Something went wrong — please try again";
const SCOPE = "PACKAGE" as const;

export default async function TaskManagerPackagePage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  const su = session.user as { email: string; name?: string | null; role?: string };
  const email = su.email;

  let groups;
  let staff;
  let role: { role: string; department: string | null };
  let categoryList;
  try {
    const [groupsResult, staffResult, roleResult] = await Promise.all([
      listTemplateGroups(email, SCOPE),
      getFlowStaff(),
      getMyRole(email),
    ]);
    groups = groupsResult;
    staff = staffResult.staff;
    role = roleResult;
    // Active categories for each task's Type dropdown (2026-08-15) — same
    // fetch AssignTaskForm's own Type dropdown uses on the main Overview
    // page; defensive (empty on failure) since it shouldn't fail the whole
    // page load. Categories are shared org-wide (not scoped by TEMPLATE vs
    // PACKAGE), same list template/page.tsx offers.
    categoryList = await listActiveTaskCategories(email).catch(() => []);
  } catch (err) {
    // Genuine "no View access" (403 from listTemplateGroups's
    // requireGroupViewAccess) bounces to /task-manager — everything else
    // renders in place, same as /task-manager/template.
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

  async function loadGroup(groupId: string): Promise<TemplateGroupLoadResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      const group = await getTemplateGroup(email, groupId, SCOPE);
      return { ok: true, group: group as import("@/task-manager/ui/types").FlowTemplateGroupDetail };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  async function createGroup(input: {
    name: string;
    tasks: { title: string; subtasks: string[] }[];
  }): Promise<TemplateGroupSaveResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      const result = await createTemplateGroup(email, SCOPE, input);
      revalidatePath("/task-manager/package");
      return { ok: true, id: result.id };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  async function editGroup(
    groupId: string,
    input: { name: string; tasks: FlowTemplateGroupTaskInput[] },
  ): Promise<TemplateGroupEditResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      const result = await editTemplateGroup(email, groupId, SCOPE, input);
      revalidatePath("/task-manager/package");
      revalidatePath("/task-manager");
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  async function groupImpact(groupId: string): Promise<TemplateGroupImpactResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      const impact = await getGroupDeletionImpact(email, groupId, SCOPE);
      return { ok: true, ...impact };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  async function groupEditImpact(groupId: string): Promise<TemplateGroupImpactResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      const impact = await getGroupEditImpact(email, groupId, SCOPE);
      return { ok: true, ...impact };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  async function removeGroup(groupId: string): Promise<TemplateGroupDeleteResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      const result = await deleteTemplateGroup(email, groupId, SCOPE);
      revalidatePath("/task-manager/package");
      revalidatePath("/task-manager");
      return { ok: true, removedTasks: result.removedTasks, keptRecords: result.keptRecords };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  async function applyGroup(
    groupId: string,
    input: FlowTemplateGroupApplyInput,
  ): Promise<TemplateGroupApplyResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      const result = await applyTemplateGroup(email, groupId, SCOPE, input);
      revalidatePath("/task-manager");
      return { ok: true, created: result.created };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  async function groupAssignees(groupId: string): Promise<TemplateGroupAssigneesResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      const assignees = await getGroupAssignees(email, groupId, SCOPE);
      return { ok: true, assignees };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  async function removeAssignee(
    groupId: string,
    userId: string,
    weekdays: (typeof FLOW_DAYS)[number][],
  ): Promise<TemplateGroupRemoveAssigneeResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      const result = await removeGroupAssignee(email, groupId, SCOPE, userId, weekdays);
      revalidatePath("/task-manager");
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  // Inline "+ Add new type" (2026-08-15) — same gate as canEdit below
  // (canManageTaskTemplateGroups), mirroring template/page.tsx's own
  // createCategory action; createTaskCategory re-enforces the gate
  // server-side regardless.
  async function createCategory(
    name: string,
  ): Promise<import("@/task-manager/ui/types").CreateCategoryResult> {
    "use server";
    const stale = await requireLiveSession(email);
    if (stale) return stale;
    try {
      const { id } = await createTaskCategory(email, { name });
      revalidatePath("/task-manager/package");
      return { ok: true, id, name };
    } catch (err) {
      return { ok: false, message: err instanceof FlowBridgeError ? err.message : FALLBACK_MESSAGE };
    }
  }

  const canEdit = canManageTaskTemplateGroups(role);

  return (
    <AppShell email={su.email} role={su.role} name={su.name}>
      <div className="mx-auto max-w-[1400px] p-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Package</h1>
        <div className="mt-6">
          <TemplateGroupDashboard
            staff={staff}
            label="Package"
            canEdit={canEdit}
            categories={categoryList}
            onCreateCategory={canEdit ? createCategory : undefined}
            control={{
              list: groups,
              load: loadGroup,
              create: createGroup,
              edit: editGroup,
              impact: groupImpact,
              editImpact: groupEditImpact,
              remove: removeGroup,
              apply: applyGroup,
              assignees: groupAssignees,
              removeAssignee,
            }}
          />
        </div>
      </div>
    </AppShell>
  );
}
