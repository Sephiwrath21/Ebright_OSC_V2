"use client";

// Create/Edit modal for Template Groups (2026-08-06): name + repeatable
// task blocks (title + SubtaskListEditor). `groupId` absent = create mode
// (blank form, no assignee ever asked here — that's the separate Assign
// modal, template-group-assign-modal.tsx); present = edit mode (loads via
// control.load on open). Editing warns with live pending counts before
// saving, same safety pattern as the single-task Edit hub tab.
import * as React from "react";
import type {
  CreateCategoryResult,
  FlowCategoryOption,
  FlowTemplateGroupControl,
  FlowTemplateGroupTaskInput,
} from "./types";
import { SubtaskListEditor } from "./subtask-list-editor";
import { CategoryPicker } from "./category-picker";

const TASK_MAX = 20;

export function TemplateGroupFormModal({
  control,
  groupId,
  onClose,
  label = "Template",
  categories,
  onCreateCategory,
}: {
  control: FlowTemplateGroupControl;
  groupId?: string;
  onClose: () => void;
  /** Display copy override (2026-08-06) — "Template" (default) or "Package". */
  label?: "Template" | "Package";
  /** Task Category ("Type", 2026-08-15) — active categories for this
   *  template/package's own Type dropdown (ONE per group, a sibling of
   *  `name` — not per-task), same prop shape as AssignTaskForm's. Omit or
   *  pass an empty array to hide the dropdown entirely (e.g. before any
   *  category exists). */
  categories?: FlowCategoryOption[];
  /** Inline "+ Add new type" — see AssignTaskForm's own doc comment; same
   *  gate (canManageTaskTemplateGroups), passed by both pages identically. */
  onCreateCategory?: (name: string) => Promise<CreateCategoryResult>;
}) {
  const isEdit = Boolean(groupId);
  const labelLower = label.toLowerCase();
  const [name, setName] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("");
  const [tasks, setTasks] = React.useState<FlowTemplateGroupTaskInput[]>([{ title: "", subtasks: [] }]);
  const [taskKeys, setTaskKeys] = React.useState<string[]>(() => tasks.map(() => crypto.randomUUID()));
  const [loading, setLoading] = React.useState(isEdit);
  const [pending, startTransition] = React.useTransition();
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);
  // Inline "+ Add new type" (2026-08-12): categories start from the prop,
  // then grow locally as this session creates new ones — no page refresh
  // needed to pick a category you just added.
  const [localCategories, setLocalCategories] = React.useState(categories ?? []);

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
      setCategoryId(result.group.categoryId ?? "");
      setTasks(result.group.tasks.map((t) => ({ id: t.id, title: t.title, subtasks: t.subtasks })));
      setTaskKeys(result.group.tasks.map(() => crypto.randomUUID()));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const addTask = () => {
    if (tasks.length >= TASK_MAX) return;
    setTasks((prev) => [...prev, { title: "", subtasks: [] }]);
    setTaskKeys((prev) => [...prev, crypto.randomUUID()]);
  };
  const removeTask = (index: number) => {
    setTasks((prev) => prev.filter((_, i) => i !== index));
    setTaskKeys((prev) => prev.filter((_, i) => i !== index));
  };
  const updateTitle = (index: number, title: string) => {
    setTasks((prev) => prev.map((t, i) => (i === index ? { ...t, title } : t)));
  };
  const updateSubtasks = (index: number, subtasks: string[]) => {
    setTasks((prev) => prev.map((t, i) => (i === index ? { ...t, subtasks } : t)));
  };

  const save = () => {
    if (pending) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setMessage({ ok: false, text: `Give the ${labelLower} a name.` });
      return;
    }
    const trimmedTasks = tasks.map((t) => ({ ...t, title: t.title.trim() }));
    if (trimmedTasks.length === 0) {
      setMessage({ ok: false, text: "Add at least one task." });
      return;
    }
    const blankIndex = trimmedTasks.findIndex((t) => t.title.length === 0);
    if (blankIndex !== -1) {
      setMessage({ ok: false, text: `Task ${blankIndex + 1} needs a title (or remove it with the ✕ button).` });
      return;
    }
    const cleanTasks = trimmedTasks;
    startTransition(async () => {
      if (isEdit) {
        const impact = await control.impact(groupId as string);
        if (!impact.ok) {
          setMessage({ ok: false, text: impact.message });
          return;
        }
        if (impact.pendingTasks > 0) {
          const warning = `This will update ${impact.pendingTasks} pending task${impact.pendingTasks === 1 ? "" : "s"} across ${impact.pendingEmployees} employee${impact.pendingEmployees === 1 ? "" : "s"} who haven't completed them yet (and cancel tasks for anything removed from this ${labelLower}). Completed records are kept.`;
          if (!window.confirm(warning)) return;
        }
      }
      const result = isEdit
        ? await control.edit(groupId as string, { name: trimmedName, categoryId: categoryId || undefined, tasks: cleanTasks })
        : await control.create({ name: trimmedName, categoryId: categoryId || undefined, tasks: cleanTasks });
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
          <p className="text-sm font-semibold text-gray-900">{isEdit ? `Edit ${label}` : `New ${label}`}</p>
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
              {label} name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Create Video"
                maxLength={100}
                className="mt-1 w-full rounded-full border border-gray-300 px-4 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
              />
            </label>

            <CategoryPicker
              value={categoryId}
              onChange={setCategoryId}
              categories={localCategories}
              onCreateCategory={onCreateCategory}
              onCategoryCreated={(c) => setLocalCategories((prev) => [...prev, c])}
            />

            {tasks.map((task, index) => (
              <div key={taskKeys[index]} className="rounded-2xl border border-gray-200 p-3">
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
