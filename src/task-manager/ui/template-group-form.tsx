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
import { compressImageFile } from "./image-compress";

const TASK_MAX = 20;

/** Per-task Guideline display state (2026-08-20) — parallel array to
 *  `tasks`/`taskKeys`, same index. Kept separate from FlowTemplateGroupTaskInput
 *  itself because the UI needs the richer display shape (previewUrl, the
 *  original filename for the "remove" label) that never gets submitted —
 *  same split assign-task-form.tsx's own single `guidelineImage` state
 *  already uses, just indexed per task here instead of one global value. */
interface TaskGuideline {
  url: string;
  image: {
    mime: "image/png" | "image/jpeg" | "image/webp";
    dataBase64: string;
    previewUrl: string;
    name: string;
  } | null;
}
const EMPTY_GUIDELINE: TaskGuideline = { url: "", image: null };

export function TemplateGroupFormModal({
  control,
  groupId,
  duplicateFromId,
  onClose,
  label = "Template",
  categories,
  onCreateCategory,
}: {
  control: FlowTemplateGroupControl;
  groupId?: string;
  /** Duplicate mode (2026-08-26, user request — "different template but
   *  similar task, just a few tasks different"): prefills a blank CREATE
   *  form from an existing group's tasks/subtasks/guidelines/category, so
   *  the viewer only has to tweak the differences instead of rebuilding
   *  from scratch. Mutually exclusive with `groupId` — this is still
   *  create mode (isEdit stays false, Save calls control.create and makes
   *  a brand-new group; the source group is never touched). */
  duplicateFromId?: string;
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
  const [guidelines, setGuidelines] = React.useState<TaskGuideline[]>([{ ...EMPTY_GUIDELINE }]);
  const imageInputRefs = React.useRef<(HTMLInputElement | null)[]>([]);
  const [loading, setLoading] = React.useState(isEdit || Boolean(duplicateFromId));
  const [pending, startTransition] = React.useTransition();
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);
  // Unsaved-changes guard (2026-08-26, user report — an accidental
  // backdrop click discarded a half-filled task with no warning at all).
  // Set on every field edit below; NOT set by the load effect populating
  // edit mode's baseline, and cleared once a save actually succeeds (see
  // save() below) or the viewer explicitly discards (see requestClose).
  const [dirty, setDirty] = React.useState(false);
  const [confirmClose, setConfirmClose] = React.useState(false);
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
      setGuidelines(
        result.group.tasks.map((t) => ({
          url: t.guidelineUrl ?? "",
          image: t.guidelineImage
            ? {
                mime: t.guidelineImage.mime,
                dataBase64: t.guidelineImage.dataBase64,
                previewUrl: `data:${t.guidelineImage.mime};base64,${t.guidelineImage.dataBase64}`,
                name: `${t.title} (saved image)`,
              }
            : null,
        })),
      );
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  // Duplicate mode's own load (2026-08-26) — same source data as the edit
  // effect above, but into what stays a CREATE form: name gets a "Copy of"
  // prefix (so it doesn't silently collide with the original), and every
  // task's `id` is dropped so control.create makes brand-new TaskTemplate
  // rows rather than referencing the source's. Marked dirty immediately
  // after populating — unlike edit mode's baseline (already saved,
  // nothing lost by closing untouched), this prefilled copy hasn't been
  // created yet, so an accidental close SHOULD warn before discarding it.
  React.useEffect(() => {
    if (!duplicateFromId || groupId) return;
    let cancelled = false;
    void control.load(duplicateFromId).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        setMessage({ ok: false, text: result.message });
        return;
      }
      setName(`Copy of ${result.group.name}`);
      setCategoryId(result.group.categoryId ?? "");
      setTasks(result.group.tasks.map((t) => ({ title: t.title, subtasks: t.subtasks })));
      setTaskKeys(result.group.tasks.map(() => crypto.randomUUID()));
      setGuidelines(
        result.group.tasks.map((t) => ({
          url: t.guidelineUrl ?? "",
          image: t.guidelineImage
            ? {
                mime: t.guidelineImage.mime,
                dataBase64: t.guidelineImage.dataBase64,
                previewUrl: `data:${t.guidelineImage.mime};base64,${t.guidelineImage.dataBase64}`,
                name: `${t.title} (saved image)`,
              }
            : null,
        })),
      );
      setDirty(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duplicateFromId, groupId]);

  const addTask = () => {
    if (tasks.length >= TASK_MAX) return;
    setTasks((prev) => [...prev, { title: "", subtasks: [] }]);
    setTaskKeys((prev) => [...prev, crypto.randomUUID()]);
    setGuidelines((prev) => [...prev, { ...EMPTY_GUIDELINE }]);
    setDirty(true);
  };
  const removeTask = (index: number) => {
    setTasks((prev) => prev.filter((_, i) => i !== index));
    setTaskKeys((prev) => prev.filter((_, i) => i !== index));
    setGuidelines((prev) => prev.filter((_, i) => i !== index));
    imageInputRefs.current.splice(index, 1);
    setDirty(true);
  };
  const updateTitle = (index: number, title: string) => {
    setTasks((prev) => prev.map((t, i) => (i === index ? { ...t, title } : t)));
    setDirty(true);
  };
  const updateSubtasks = (index: number, subtasks: string[]) => {
    setTasks((prev) => prev.map((t, i) => (i === index ? { ...t, subtasks } : t)));
    setDirty(true);
  };
  const updateGuidelineUrl = (index: number, url: string) => {
    setGuidelines((prev) => prev.map((g, i) => (i === index ? { ...g, url } : g)));
    setDirty(true);
  };
  const clearGuidelineImage = (index: number) => {
    setGuidelines((prev) => prev.map((g, i) => (i === index ? { ...g, image: null } : g)));
    const input = imageInputRefs.current[index];
    if (input) input.value = "";
    setDirty(true);
  };
  // Same compressed-client-side pipeline assign-task-form.tsx's single
  // guideline image uses (ui/image-compress.ts) — ≤1280px JPEG, ≤2MB.
  const onGuidelineImagePick = (index: number, file: File | undefined) => {
    if (!file) return;
    void compressImageFile(file).then((result) => {
      if (!result.ok) {
        setMessage({ ok: false, text: result.message });
        clearGuidelineImage(index);
        return;
      }
      setGuidelines((prev) =>
        prev.map((g, i) =>
          i === index
            ? {
                ...g,
                image: {
                  mime: result.image.mime,
                  dataBase64: result.image.dataBase64,
                  previewUrl: result.image.previewUrl,
                  name: file.name,
                },
              }
            : g,
        ),
      );
      setMessage(null);
      setDirty(true);
    });
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
    // Guideline link format (2026-08-20) — same rule assign-task-form.tsx
    // enforces for its own single guideline, checked per task here.
    const trimmedGuidelines = guidelines.map((g) => ({ ...g, url: g.url.trim() }));
    const badUrlIndex = trimmedGuidelines.findIndex(
      (g) => g.url.length > 0 && !/^https?:\/\//i.test(g.url),
    );
    if (badUrlIndex !== -1) {
      setMessage({ ok: false, text: `Task ${badUrlIndex + 1}'s guideline link must start with http:// or https://.` });
      return;
    }
    // Always sent (never a partial patch) — editTaskTemplateCore/
    // createTemplateGroup both unconditionally overwrite these two columns
    // from whatever's submitted, same as the single-task Edit hub; the
    // guidelines state is already prefilled from the loaded group on edit,
    // so "untouched" naturally resubmits the existing value either way.
    const cleanTasks = trimmedTasks.map((t, i) => ({
      ...t,
      guidelineUrl: trimmedGuidelines[i].url || undefined,
      guidelineImage: trimmedGuidelines[i].image
        ? { mime: trimmedGuidelines[i].image.mime, dataBase64: trimmedGuidelines[i].image.dataBase64 }
        : undefined,
    }));
    startTransition(async () => {
      if (isEdit) {
        // editImpact, not impact (2026-08-22) — a narrower count than the
        // Remove-template dialog's: parent tasks only, excluding anything
        // already past-due (editTemplateGroup's real update criteria), so
        // this number matches what Save is actually about to change
        // instead of overstating it. See getTemplateEditImpactCore's own
        // doc comment.
        const impact = await control.editImpact(groupId as string);
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
        setDirty(false);
        onClose();
      } else {
        setMessage({ ok: false, text: result.message });
      }
    });
  };

  /** Backdrop click / ✕ button (2026-08-26) — go straight through when
   *  nothing's been touched, otherwise ask first instead of silently
   *  discarding a half-filled task. */
  const requestClose = () => {
    if (dirty) setConfirmClose(true);
    else onClose();
  };
  const discardAndClose = () => {
    setConfirmClose(false);
    onClose();
  };
  const saveFromConfirm = () => {
    setConfirmClose(false);
    save();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={requestClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900 dark:ring-1 dark:ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex shrink-0 items-center justify-between border-b border-gray-100 pb-3 dark:border-slate-800">
          <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
            {isEdit ? `Edit ${label}` : duplicateFromId ? `Duplicate ${label}` : `New ${label}`}
          </p>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close"
            className="flex size-6 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
            <label className="text-sm text-gray-600 dark:text-slate-300">
              {label} name
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setDirty(true);
                }}
                placeholder="e.g. Create Video"
                maxLength={100}
                className="mt-1 w-full rounded-full border border-gray-300 px-4 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none dark:border-slate-500 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>

            <CategoryPicker
              value={categoryId}
              onChange={(id) => {
                setCategoryId(id);
                setDirty(true);
              }}
              categories={localCategories}
              onCreateCategory={onCreateCategory}
              onCategoryCreated={(c) => setLocalCategories((prev) => [...prev, c])}
            />

            {tasks.map((task, index) => (
              <div key={taskKeys[index]} className="rounded-2xl border border-gray-200 p-3 dark:border-slate-800">
                <div className="flex items-center justify-between gap-2">
                  <label className="flex-1 text-sm text-gray-600 dark:text-slate-300">
                    Task {index + 1}
                    <input
                      value={task.title}
                      onChange={(e) => updateTitle(index, e.target.value)}
                      placeholder="Task title"
                      maxLength={200}
                      className="mt-1 w-full rounded-full border border-gray-300 px-4 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none dark:border-slate-500 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </label>
                  {tasks.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTask(index)}
                      aria-label={`Remove task ${index + 1}`}
                      className="mt-5 shrink-0 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600 dark:hover:bg-slate-800 dark:hover:text-red-400"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <div className="ml-4 mt-2 border-l-2 border-gray-200 pl-3 dark:border-slate-700">
                  <SubtaskListEditor subtasks={task.subtasks} onChange={(next) => updateSubtasks(index, next)} />
                </div>

                {/* Guideline (2026-08-20): SOP link and/or reference image,
                    per task — same optional, never-blocks-save fields as
                    the single "+ Task" assign form's own Guidelines block. */}
                <div className="mt-3 rounded-2xl border border-gray-200 bg-gray-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-sm font-medium text-gray-600 dark:text-slate-300">Guidelines</p>
                  <label className="mt-2 block text-sm text-gray-600 dark:text-slate-300">
                    Link
                    <input
                      type="url"
                      value={guidelines[index]?.url ?? ""}
                      onChange={(e) => updateGuidelineUrl(index, e.target.value)}
                      placeholder="https://… (SOP document, Google Doc, …)"
                      className="mt-1 w-full rounded-full border border-gray-300 bg-white px-4 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none dark:border-slate-500 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </label>
                  <label className="mt-2 block text-sm text-gray-600 dark:text-slate-300">
                    Image <span className="text-xs text-gray-400">(PNG / JPG / WebP, ≤ 2 MB)</span>
                    <input
                      ref={(el) => {
                        imageInputRefs.current[index] = el;
                      }}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => onGuidelineImagePick(index, e.target.files?.[0])}
                      className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 file:shadow-sm hover:file:bg-gray-100 dark:text-slate-300 dark:file:bg-slate-800 dark:file:text-slate-200 dark:hover:file:bg-slate-700"
                    />
                  </label>
                  {guidelines[index]?.image && (
                    <div className="mt-2 flex items-start gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={guidelines[index].image!.previewUrl}
                        alt="Guideline preview"
                        className="max-h-28 rounded-lg border border-gray-200 object-contain dark:border-slate-700"
                      />
                      <button
                        type="button"
                        onClick={() => clearGuidelineImage(index)}
                        className="text-xs font-medium text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                      >
                        ✕ remove {guidelines[index].image!.name}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={addTask}
              disabled={tasks.length >= TASK_MAX}
              className="self-start rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 disabled:opacity-40 dark:border-slate-500 dark:bg-slate-950 dark:text-slate-300"
            >
              + Add another task
            </button>
          </div>
        )}

        <div className="mt-3 flex shrink-0 items-center gap-3 border-t border-gray-100 pt-3 dark:border-slate-800">
          <button
            type="button"
            onClick={save}
            disabled={pending || loading}
            className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          {message && (
            <p className={`text-sm ${message.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>{message.text}</p>
          )}
        </div>
      </div>

      {/* Unsaved-changes guard (2026-08-26) — a nested confirm dialog, same
          dimmed-backdrop pattern as the outer modal itself. Its own onClick
          stopPropagation keeps a click INSIDE it from bubbling up and
          hitting the outer backdrop's requestClose again. */}
      {confirmClose && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4"
          onClick={() => setConfirmClose(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900 dark:ring-1 dark:ring-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
              Save changes to this {labelLower}?
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
              You've entered something that hasn't been saved yet.
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmClose(false)}
                className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:border-gray-400 dark:border-slate-600 dark:text-slate-300 dark:hover:border-slate-500"
              >
                Keep editing
              </button>
              <button
                type="button"
                onClick={discardAndClose}
                className="rounded-full border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:border-red-400 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                Discard
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={saveFromConfirm}
                className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {pending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
