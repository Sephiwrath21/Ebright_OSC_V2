"use client";

// /task-manager/template dashboard (2026-08-06): cards grid + the
// Create/Edit and Assign modals' open/close wiring + the Delete confirm
// flow. Mutations call the server actions in `control`, wrapped in
// useTransition so revalidatePath's effect (a fresh `control.list` from
// the parent server component) actually reaches this client tree — the
// same pattern AssignTaskForm's submit() already uses.
//
// Grid/List view toggle (2026-08-06): purely a display preference, stored
// in localStorage per `label` (so Template and Package remember their own
// view independently) — no server round-trip, defaults to "grid" on first
// visit or when localStorage is unavailable.
import * as React from "react";
import { LayoutGrid, List } from "lucide-react";
import type {
  CreateCategoryResult,
  FlowCategoryOption,
  FlowStaffMember,
  FlowTemplateGroupControl,
  FlowTemplateGroupSummary,
} from "./types";
import { TemplateGroupFormModal } from "./template-group-form";
import { TemplateGroupAssignModal } from "./template-group-assign-modal";
import { TemplateGroupAssigneesModal } from "./template-group-assignees-modal";

type ViewMode = "grid" | "list";

function viewToggleButtonClass(active: boolean): string {
  return `flex size-8 items-center justify-center rounded-full ${
    active ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-700"
  }`;
}

// Shared Assign/Edit/Delete trio (2026-08-06): both the grid cards and the
// list table rows render this, so the two views can't drift out of sync.
// canEdit (2026-08-07): view-only roles (HOD, CEO always; Branch Manager on
// Package specifically — see role-views.ts's canManageTaskTemplateGroups)
// get NONE of these four buttons — genuinely omitted from the render tree,
// not just disabled/hidden via CSS, since the server already 403s these
// actions (template-groups.ts's requireGroupEditAccess) and this is only a
// defense-in-depth UI layer on top of that.
function GroupActions({
  group,
  busyId,
  canEdit,
  onAssign,
  onViewAssignees,
  onEdit,
  onDuplicate,
  onRemove,
}: {
  group: FlowTemplateGroupSummary;
  busyId: string | null;
  canEdit: boolean;
  onAssign: () => void;
  onViewAssignees: () => void;
  onEdit: () => void;
  /** "Duplicate" (2026-08-26, user request — "different template but
   *  similar task, just a few tasks different") — opens the Create modal
   *  prefilled from this group; see TemplateGroupFormModal's own
   *  duplicateFromId doc comment. */
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  if (!canEdit) return null;
  return (
    <>
      <button
        type="button"
        onClick={onAssign}
        className="rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
      >
        Assign
      </button>
      <button
        type="button"
        onClick={onViewAssignees}
        className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 dark:border-slate-500 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-blue-500 dark:hover:text-blue-400"
      >
        View Assignees
      </button>
      <button
        type="button"
        onClick={onEdit}
        className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 dark:border-slate-500 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-blue-500 dark:hover:text-blue-400"
      >
        Edit
      </button>
      <button
        type="button"
        onClick={onDuplicate}
        className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 dark:border-slate-500 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-blue-500 dark:hover:text-blue-400"
      >
        Duplicate
      </button>
      <button
        type="button"
        disabled={busyId === group.id}
        onClick={onRemove}
        className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-red-400 hover:text-red-600 disabled:opacity-40 dark:border-slate-500 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-red-500 dark:hover:text-red-400"
      >
        {busyId === group.id ? "Removing…" : "Delete"}
      </button>
    </>
  );
}

export function TemplateGroupDashboard({
  staff,
  control,
  hideCadence = false,
  label = "Template",
  canEdit = true,
  categories,
  onCreateCategory,
}: {
  staff: FlowStaffMember[];
  control: FlowTemplateGroupControl;
  /** CEO-only: hides the Cadence picker in the Assign modal, passed
   *  straight through to TemplateGroupAssignModal (mirrors
   *  assign-task-form.tsx's own hideCadence prop). */
  hideCadence?: boolean;
  /** Display copy override (2026-08-06) — "Template" (default) or
   *  "Package". Forwarded to both modals below. */
  label?: "Template" | "Package";
  /** Edit-tier gate (2026-08-07, see role-views.ts's
   *  canManageTaskTemplateGroups) — defaults to `true` so any caller that
   *  doesn't pass it explicitly keeps pre-2026-08-07 behavior. When
   *  `false`, the "+ New {label}" button and every GroupActions button
   *  (Assign/View Assignees/Edit/Delete) are omitted entirely — the card's
   *  own name/task-count/preview content and the grid/list view toggle are
   *  unaffected, view-only roles still see their cards. */
  canEdit?: boolean;
  /** Task Category ("Type", 2026-08-15) — forwarded straight through to
   *  both create/edit TemplateGroupFormModal instances below; see that
   *  component's own doc comment. */
  categories?: FlowCategoryOption[];
  onCreateCategory?: (name: string) => Promise<CreateCategoryResult>;
}) {
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editGroupId, setEditGroupId] = React.useState<string | null>(null);
  const [duplicateGroupId, setDuplicateGroupId] = React.useState<string | null>(null);
  const [assignGroupId, setAssignGroupId] = React.useState<string | null>(null);
  const [assigneesGroupId, setAssigneesGroupId] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [, startTransition] = React.useTransition();
  const labelLower = label.toLowerCase();

  const viewStorageKey = `task-manager-group-view:${label}`;
  const [view, setView] = React.useState<ViewMode>("grid");
  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(viewStorageKey);
      if (stored === "grid" || stored === "list") setView(stored);
    } catch {
      // localStorage unavailable (private browsing, etc.) — stay on the "grid" default.
    }
  }, [viewStorageKey]);
  const changeView = (next: ViewMode) => {
    setView(next);
    try {
      window.localStorage.setItem(viewStorageKey, next);
    } catch {
      // localStorage unavailable — the choice just won't persist this session.
    }
  };

  const remove = (groupId: string, name: string) => {
    if (busyId) return;
    setBusyId(groupId);
    startTransition(async () => {
      const impact = await control.impact(groupId);
      if (!impact.ok) {
        setBusyId(null);
        setMessage({ ok: false, text: impact.message });
        return;
      }
      const warning =
        impact.pendingTasks > 0
          ? `This will remove "${name}" and cancel ${impact.pendingTasks} pending task${impact.pendingTasks === 1 ? "" : "s"} across ${impact.pendingEmployees} employee${impact.pendingEmployees === 1 ? "" : "s"}. ${impact.completedKept} completed record${impact.completedKept === 1 ? "" : "s"} will be kept.`
          : `This will remove "${name}". No pending assignments right now.`;
      if (!window.confirm(warning)) {
        setBusyId(null);
        return;
      }
      const result = await control.remove(groupId);
      setBusyId(null);
      setMessage(result.ok ? { ok: true, text: `${label} deleted.` } : { ok: false, text: result.message });
    });
  };

  const assignedGroup = control.list.find((g) => g.id === assignGroupId) ?? null;
  const assigneesGroup = control.list.find((g) => g.id === assigneesGroupId) ?? null;

  // Search (2026-08-22) — filters by name OR any member task title
  // (allTaskTitles, not just the 3-item previewTitles the card displays),
  // case-insensitive, entirely client-side since control.list is already
  // fully loaded. No debounce needed: filtering a plain in-memory array on
  // every keystroke is cheap at this list's scale.
  const [searchQuery, setSearchQuery] = React.useState("");
  const filteredList = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return control.list;
    return control.list.filter(
      (g) => g.name.toLowerCase().includes(q) || g.allTaskTitles.some((t) => t.toLowerCase().includes(q)),
    );
  }, [control.list, searchQuery]);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500 dark:text-slate-400">
          {filteredList.length} {labelLower}
          {filteredList.length === 1 ? "" : "s"}
          {searchQuery.trim() && ` (of ${control.list.length})`}
        </p>
        <div className="flex items-center gap-2">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${labelLower}s or tasks…`}
            aria-label={`Search ${labelLower}s`}
            className="w-48 rounded-full border border-gray-300 bg-white px-3.5 py-1.5 text-sm text-gray-700 placeholder:text-gray-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-500"
          />
          <div
            role="radiogroup"
            aria-label="View"
            className="flex items-center gap-0.5 rounded-full border border-gray-300 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900"
          >
            <button
              type="button"
              role="radio"
              aria-checked={view === "grid"}
              aria-label="Grid view"
              onClick={() => changeView("grid")}
              className={viewToggleButtonClass(view === "grid")}
            >
              <LayoutGrid className="size-4" />
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={view === "list"}
              aria-label="List view"
              onClick={() => changeView("list")}
              className={viewToggleButtonClass(view === "list")}
            >
              <List className="size-4" />
            </button>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              + New {label}
            </button>
          )}
        </div>
      </div>

      {message && (
        <p className={`mt-3 text-sm ${message.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>{message.text}</p>
      )}

      {filteredList.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
          {control.list.length === 0
            ? `No ${labelLower}s yet — create one to bundle several tasks together for reuse.`
            : `No ${labelLower}s match "${searchQuery.trim()}".`}
        </div>
      ) : view === "grid" ? (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredList.map((g) => (
            <div key={g.id} className="flex flex-col rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <p className="font-semibold text-gray-900 dark:text-slate-100">{g.name}</p>
              <p className="mt-1 text-xs text-gray-400">
                {g.taskCount} task{g.taskCount === 1 ? "" : "s"}
              </p>
              {g.previewTitles.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-sm text-gray-600 dark:text-slate-300">
                  {g.previewTitles.map((t, i) => (
                    <li key={i} className="truncate">
                      · {t}
                    </li>
                  ))}
                  {g.taskCount > g.previewTitles.length && (
                    <li className="text-xs text-gray-400">+{g.taskCount - g.previewTitles.length} more</li>
                  )}
                </ul>
              )}
              {canEdit && (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-3 dark:border-slate-800">
                  <GroupActions
                    group={g}
                    busyId={busyId}
                    canEdit={canEdit}
                    onAssign={() => setAssignGroupId(g.id)}
                    onViewAssignees={() => setAssigneesGroupId(g.id)}
                    onEdit={() => setEditGroupId(g.id)}
                    onDuplicate={() => setDuplicateGroupId(g.id)}
                    onRemove={() => remove(g.id, g.name)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-400">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Tasks</th>
                <th className="px-4 py-3">Last Updated</th>
                {canEdit && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filteredList.map((g) => (
                <tr key={g.id} className="border-b border-gray-100 last:border-0 dark:border-slate-800">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-slate-100">{g.name}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-slate-300">{g.taskCount}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-slate-300">{g.updatedAt.slice(0, 10)}</td>
                  {canEdit && (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <GroupActions
                          group={g}
                          busyId={busyId}
                          canEdit={canEdit}
                          onAssign={() => setAssignGroupId(g.id)}
                          onViewAssignees={() => setAssigneesGroupId(g.id)}
                          onEdit={() => setEditGroupId(g.id)}
                          onDuplicate={() => setDuplicateGroupId(g.id)}
                          onRemove={() => remove(g.id, g.name)}
                        />
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && (
        <TemplateGroupFormModal
          control={control}
          onClose={() => setCreateOpen(false)}
          label={label}
          categories={categories}
          onCreateCategory={onCreateCategory}
        />
      )}
      {editGroupId && (
        <TemplateGroupFormModal
          control={control}
          groupId={editGroupId}
          onClose={() => setEditGroupId(null)}
          label={label}
          categories={categories}
          onCreateCategory={onCreateCategory}
        />
      )}
      {duplicateGroupId && (
        <TemplateGroupFormModal
          key={duplicateGroupId}
          control={control}
          duplicateFromId={duplicateGroupId}
          onClose={() => setDuplicateGroupId(null)}
          label={label}
          categories={categories}
          onCreateCategory={onCreateCategory}
        />
      )}
      {assignedGroup && (
        <TemplateGroupAssignModal
          control={control}
          staff={staff}
          group={assignedGroup}
          onClose={() => setAssignGroupId(null)}
          hideCadence={hideCadence}
          label={label}
        />
      )}
      {assigneesGroup && (
        <TemplateGroupAssigneesModal
          control={control}
          group={assigneesGroup}
          onClose={() => setAssigneesGroupId(null)}
          label={label}
        />
      )}
    </div>
  );
}
