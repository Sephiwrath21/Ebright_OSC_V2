"use client";

// /task-manager/template dashboard (2026-08-06): cards grid + the
// Create/Edit and Assign modals' open/close wiring + the Delete confirm
// flow. Mutations call the server actions in `control`, wrapped in
// useTransition so revalidatePath's effect (a fresh `control.list` from
// the parent server component) actually reaches this client tree — the
// same pattern AssignTaskForm's submit() already uses.
import * as React from "react";
import type { FlowStaffMember, FlowTemplateGroupControl } from "./types";
import { TemplateGroupFormModal } from "./template-group-form";
import { TemplateGroupAssignModal } from "./template-group-assign-modal";

export function TemplateGroupDashboard({
  staff,
  control,
  hideCadence = false,
}: {
  staff: FlowStaffMember[];
  control: FlowTemplateGroupControl;
  /** CEO-only: hides the Cadence picker in the Assign modal, passed
   *  straight through to TemplateGroupAssignModal (mirrors
   *  assign-task-form.tsx's own hideCadence prop). */
  hideCadence?: boolean;
}) {
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editGroupId, setEditGroupId] = React.useState<string | null>(null);
  const [assignGroupId, setAssignGroupId] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [, startTransition] = React.useTransition();

  const remove = (groupId: string, name: string) => {
    startTransition(async () => {
      setBusyId(groupId);
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
      setMessage(result.ok ? { ok: true, text: "Template deleted." } : { ok: false, text: result.message });
    });
  };

  const assignedGroup = control.list.find((g) => g.id === assignGroupId) ?? null;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          {control.list.length} template{control.list.length === 1 ? "" : "s"}
        </p>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          + New Template
        </button>
      </div>

      {message && (
        <p className={`mt-3 text-sm ${message.ok ? "text-emerald-600" : "text-red-600"}`}>{message.text}</p>
      )}

      {control.list.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500">
          No templates yet — create one to bundle several tasks together for reuse.
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {control.list.map((g) => (
            <div key={g.id} className="flex flex-col rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="font-semibold text-gray-900">{g.name}</p>
              <p className="mt-1 text-xs text-gray-400">
                {g.taskCount} task{g.taskCount === 1 ? "" : "s"}
              </p>
              {g.previewTitles.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-sm text-gray-600">
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
              <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                <button
                  type="button"
                  onClick={() => setAssignGroupId(g.id)}
                  className="rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  Assign
                </button>
                <button
                  type="button"
                  onClick={() => setEditGroupId(g.id)}
                  className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600"
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={busyId === g.id}
                  onClick={() => remove(g.id, g.name)}
                  className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-red-400 hover:text-red-600 disabled:opacity-40"
                >
                  {busyId === g.id ? "Removing…" : "Delete"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {createOpen && <TemplateGroupFormModal control={control} onClose={() => setCreateOpen(false)} />}
      {editGroupId && (
        <TemplateGroupFormModal control={control} groupId={editGroupId} onClose={() => setEditGroupId(null)} />
      )}
      {assignedGroup && (
        <TemplateGroupAssignModal
          control={control}
          staff={staff}
          group={assignedGroup}
          onClose={() => setAssignGroupId(null)}
          hideCadence={hideCadence}
        />
      )}
    </div>
  );
}
