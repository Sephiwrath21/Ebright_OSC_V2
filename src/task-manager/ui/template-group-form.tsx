"use client";

// Create/Edit modal for Template Groups (2026-08-06): name + repeatable
// task blocks (title + SubtaskListEditor). `groupId` absent = create mode
// (blank form, no assignee ever asked here — that's the separate Assign
// modal, template-group-assign-modal.tsx); present = edit mode (loads via
// control.load on open). Editing warns with live pending counts before
// saving, same safety pattern as the single-task Edit hub tab.
import * as React from "react";
import type { FlowTemplateGroupControl, FlowTemplateGroupTaskInput } from "./types";
import { SubtaskListEditor } from "./subtask-list-editor";

const TASK_MAX = 20;

export function TemplateGroupFormModal({
  control,
  groupId,
  onClose,
}: {
  control: FlowTemplateGroupControl;
  groupId?: string;
  onClose: () => void;
}) {
  const isEdit = Boolean(groupId);
  const [name, setName] = React.useState("");
  const [tasks, setTasks] = React.useState<FlowTemplateGroupTaskInput[]>([{ title: "", subtasks: [] }]);
  const [loading, setLoading] = React.useState(isEdit);
  const [pending, startTransition] = React.useTransition();
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);

  React.useEffect(() => {
    if (!groupId) return;
    let cancelled = false;
    void control.load(groupId).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        setMessage({ ok: false, text: result.message });
        return;
      }
      setName(result.group.name);
      setTasks(result.group.tasks.map((t) => ({ id: t.id, title: t.title, subtasks: t.subtasks })));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const addTask = () => {
    if (tasks.length >= TASK_MAX) return;
    setTasks((prev) => [...prev, { title: "", subtasks: [] }]);
  };
  const removeTask = (index: number) => {
    setTasks((prev) => prev.filter((_, i) => i !== index));
  };
  const updateTitle = (index: number, title: string) => {
    setTasks((prev) => prev.map((t, i) => (i === index ? { ...t, title } : t)));
  };
  const updateSubtasks = (index: number, subtasks: string[]) => {
    setTasks((prev) => prev.map((t, i) => (i === index ? { ...t, subtasks } : t)));
  };

  const save = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setMessage({ ok: false, text: "Give the template a name." });
      return;
    }
    const cleanTasks = tasks.map((t) => ({ ...t, title: t.title.trim() })).filter((t) => t.title.length > 0);
    if (cleanTasks.length === 0) {
      setMessage({ ok: false, text: "Add at least one task." });
      return;
    }
    startTransition(async () => {
      if (isEdit) {
        const impact = await control.impact(groupId as string);
        if (!impact.ok) {
          setMessage({ ok: false, text: impact.message });
          return;
        }
        if (impact.pendingTasks > 0) {
          const warning = `This will update ${impact.pendingTasks} pending task${impact.pendingTasks === 1 ? "" : "s"} across ${impact.pendingEmployees} employee${impact.pendingEmployees === 1 ? "" : "s"} who haven't completed them yet (and cancel tasks for anything removed from this template). Completed records are kept.`;
          if (!window.confirm(warning)) return;
        }
      }
      const result = isEdit
        ? await control.edit(groupId as string, { name: trimmedName, tasks: cleanTasks })
        : await control.create({ name: trimmedName, tasks: cleanTasks });
      if (result.ok) {
        onClose();
      } else {
        setMessage({ ok: false, text: result.message });
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex shrink-0 items-center justify-between border-b border-gray-100 pb-3">
          <p className="text-sm font-semibold text-gray-900">{isEdit ? "Edit Template" : "New Template"}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-6 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
            <label className="text-sm text-gray-600">
              Template name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Create Video"
                maxLength={100}
                className="mt-1 w-full rounded-full border border-gray-300 px-4 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
              />
            </label>

            {tasks.map((task, index) => (
              <div key={index} className="rounded-2xl border border-gray-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <label className="flex-1 text-sm text-gray-600">
                    Task {index + 1}
                    <input
                      value={task.title}
                      onChange={(e) => updateTitle(index, e.target.value)}
                      placeholder="Task title"
                      maxLength={200}
                      className="mt-1 w-full rounded-full border border-gray-300 px-4 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
                    />
                  </label>
                  {tasks.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTask(index)}
                      aria-label={`Remove task ${index + 1}`}
                      className="mt-5 shrink-0 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <div className="ml-4 mt-2 border-l-2 border-gray-200 pl-3">
                  <SubtaskListEditor subtasks={task.subtasks} onChange={(next) => updateSubtasks(index, next)} />
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={addTask}
              disabled={tasks.length >= TASK_MAX}
              className="self-start rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 disabled:opacity-40"
            >
              + Add another task
            </button>
          </div>
        )}

        <div className="mt-3 flex shrink-0 items-center gap-3 border-t border-gray-100 pt-3">
          <button
            type="button"
            onClick={save}
            disabled={pending || loading}
            className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          {message && (
            <p className={`text-sm ${message.ok ? "text-emerald-600" : "text-red-600"}`}>{message.text}</p>
          )}
        </div>
      </div>
    </div>
  );
}
