"use client";

// OSC integration package — the "Assign task" form (superadmin/OPS Details
// section): Task title → recipients (the Person / By Group RecipientPicker,
// each its own click-to-expand box) → Cadence → Day / Due date. One form
// covers every targeting mode (person, role group, department) — there's no
// separate Branch/Department entry point anymore, and no branch targeting at
// all (branch doesn't appear anywhere in this section, per the user's
// request). Cadence's own pill set is conditional on who's selected — see
// visibleCadenceOptions (types.ts). Submission goes through a caller-
// supplied server action (which calls assignFlowTask with the acting user's
// email) so the bridge secret stays server-side.

import * as React from "react";
import {
  FLOW_DAYS,
  visibleCadenceOptions,
  type AssignActionResult,
  type CadenceOption,
  type FlowAssignInput,
  type FlowGroup,
  type FlowStaffMember,
  type FlowTemplateControl,
} from "./types";
import { RecipientPicker } from "./recipient-picker";

const CADENCE_LABELS: Record<CadenceOption, string> = {
  daily: "Daily",
  monthly: "Monthly",
  adhoc: "Ad hoc",
};

const selectClass =
  "w-full appearance-none rounded-full border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none";

function dayChipClass(active: boolean): string {
  return `rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
    active ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
  }`;
}

export function AssignTaskForm({
  staff,
  action,
  recipientGroup,
  templates,
  bare = false,
}: {
  staff: FlowStaffMember[];
  /** Server action wrapping assignFlowTask(actorEmail, input). Returns a
   *  typed result rather than throwing — Next.js masks thrown server-action
   *  error messages in production. */
  action: (input: FlowAssignInput) => Promise<AssignActionResult>;
  /** Hard-restricts the recipient picker to one group (e.g. "HOD" for the
   *  CEO's "+ Add Task" form) — passed straight through to RecipientPicker.
   *  Omit for the normal, fully flexible Person + any-Group picker. */
  recipientGroup?: FlowGroup;
  /** Task Templates (2026-07-31): saved list + load/rename/delete actions
   *  — drives "Start from a template", the Manage panel, and pairs with
   *  the "Save as Template" checkbox below. Omit to hide all of it. */
  templates?: FlowTemplateControl;
  /** Skip the outer card border/padding and the "Assign Task" heading — for
   *  embedding inside a caller-supplied modal/card instead of this form's
   *  own standalone box (used inline in the Details section). */
  bare?: boolean;
}) {
  const [title, setTitle] = React.useState("");
  const [userIds, setUserIds] = React.useState<string[]>([]);
  const [cadence, setCadence] = React.useState<CadenceOption | null>(null);
  const [days, setDays] = React.useState<NonNullable<FlowAssignInput["days"]>>([]);
  const [dueDate, setDueDate] = React.useState("");
  // Guideline (optional, 2026-07-30): SOP link and/or reference image —
  // both may stay empty; submission never depends on them.
  const [subtasks, setSubtasks] = React.useState<string[]>([]);
  const [subtaskDraft, setSubtaskDraft] = React.useState("");
  const [guidelineUrl, setGuidelineUrl] = React.useState("");
  const [guidelineImage, setGuidelineImage] = React.useState<{
    mime: "image/png" | "image/jpeg" | "image/webp";
    dataBase64: string;
    previewUrl: string;
    name: string;
  } | null>(null);
  const imageInputRef = React.useRef<HTMLInputElement>(null);
  const [pending, startTransition] = React.useTransition();
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);
  // Task Templates (2026-07-31)
  const [templateId, setTemplateId] = React.useState("");
  const [templateBusy, setTemplateBusy] = React.useState(false);
  const [saveTemplate, setSaveTemplate] = React.useState(false);
  const [templateName, setTemplateName] = React.useState("");

  /** "Start from a template": load the full template and pre-fill the
   *  structure fields. Recipients/days/due date are untouched (they're
   *  per-assignment); everything stays editable, and nothing here ever
   *  writes back to the template. */
  const applyTemplate = async (id: string) => {
    setTemplateId(id);
    if (!id || !templates) return;
    setTemplateBusy(true);
    const result = await templates.load(id);
    setTemplateBusy(false);
    if (!result.ok) {
      setMessage({ ok: false, text: result.message });
      return;
    }
    const t = result.template;
    setTitle(t.title);
    setSubtasks(t.subtasks);
    setSubtaskDraft("");
    setCadence(t.cadence);
    setGuidelineUrl(t.guidelineUrl ?? "");
    if (t.guidelineImage) {
      setGuidelineImage({
        mime: t.guidelineImage.mime,
        dataBase64: t.guidelineImage.dataBase64,
        previewUrl: `data:${t.guidelineImage.mime};base64,${t.guidelineImage.dataBase64}`,
        name: `${t.name} (template image)`,
      });
    } else {
      clearGuidelineImage();
    }
    setMessage(null);
  };

  const GUIDELINE_MIMES = ["image/png", "image/jpeg", "image/webp"] as const;
  const GUIDELINE_MAX_BYTES = 2 * 1024 * 1024;
  const clearGuidelineImage = () => {
    setGuidelineImage(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
  };
  const onGuidelineImagePick = (file: File | undefined) => {
    if (!file) return;
    if (!(GUIDELINE_MIMES as readonly string[]).includes(file.type)) {
      setMessage({ ok: false, text: "Guideline image must be PNG, JPG, or WebP." });
      clearGuidelineImage();
      return;
    }
    if (file.size > GUIDELINE_MAX_BYTES) {
      setMessage({ ok: false, text: "Guideline image must be 2 MB or smaller." });
      clearGuidelineImage();
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string; // data:<mime>;base64,<data>
      const dataBase64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      setGuidelineImage({
        mime: file.type as (typeof GUIDELINE_MIMES)[number],
        dataBase64,
        previewUrl: dataUrl,
        name: file.name,
      });
      setMessage(null);
    };
    reader.readAsDataURL(file);
  };

  // Which Cadence pills to even offer depends on who's selected — Branch
  // Manager keeps all 3 (incl. Ad hoc), Coach/Branch Exec are Daily-only,
  // everyone else keeps Daily/Monthly. Re-derived from `staff` + `userIds`
  // rather than stored separately, so it can never drift out of sync with
  // the actual selection.
  const selectedStaff = staff.filter((s) => userIds.includes(s.id));
  const visibleCadences = visibleCadenceOptions(selectedStaff);

  // Clear a previously-picked cadence if it's no longer valid once the
  // recipient selection changes (e.g. switching from a Branch Manager to an
  // HQ Exec drops a stale "adhoc" pick instead of silently keeping it).
  React.useEffect(() => {
    setCadence((prev) => (prev && visibleCadences.includes(prev) ? prev : null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleCadences.join(",")]);

  // "Day" (weekday recurrence) only makes sense alongside Daily — Monthly is
  // date-based, not weekday-based, and Ad hoc is a one-off. Due Date always
  // applies regardless of cadence.
  const showDay = cadence === "daily";
  React.useEffect(() => {
    if (!showDay) setDays([]);
  }, [showDay]);

  const toggleDay = (value: (typeof FLOW_DAYS)[number]) => {
    setDays((prev) => (prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value]));
  };

  /** Subtasks builder (2026-07-30): add one at a time, ✕ to remove, max 20
   *  (mirrors the server's cap). Duplicate titles are allowed — they become
   *  separate, independently-completable rows, same as duplicate tasks. */
  const SUBTASK_MAX = 20;
  const addSubtask = () => {
    const trimmed = subtaskDraft.trim();
    if (!trimmed || subtasks.length >= SUBTASK_MAX) return;
    setSubtasks((prev) => [...prev, trimmed]);
    setSubtaskDraft("");
  };
  const removeSubtask = (index: number) => {
    setSubtasks((prev) => prev.filter((_, i) => i !== index));
  };

  const submit = () => {
    if (!title.trim()) {
      setMessage({ ok: false, text: "Give the task a title first." });
      return;
    }
    if (userIds.length === 0) {
      setMessage({ ok: false, text: "Pick at least one recipient." });
      return;
    }
    if (!cadence) {
      setMessage({ ok: false, text: "Pick a cadence." });
      return;
    }
    const trimmedGuidelineUrl = guidelineUrl.trim();
    if (trimmedGuidelineUrl && !/^https?:\/\//i.test(trimmedGuidelineUrl)) {
      setMessage({ ok: false, text: "Guideline link must start with http:// or https://." });
      return;
    }
    startTransition(async () => {
      const result = await action({
        title: title.trim(),
        userIds,
        cadence,
        days,
        dueDate: dueDate || undefined,
        guidelineUrl: trimmedGuidelineUrl || undefined,
        guidelineImage: guidelineImage
          ? { mime: guidelineImage.mime, dataBase64: guidelineImage.dataBase64 }
          : undefined,
        subtasks: subtasks.length > 0 ? subtasks : undefined,
        saveAsTemplate: saveTemplate
          ? { name: templateName.trim() || title.trim() }
          : undefined,
        fromTemplateId: templateId || undefined,
      });
      if (result.ok) {
        setMessage({ ok: true, text: saveTemplate ? "Task Assigned · Template saved" : "Task Assigned" });
        setTitle("");
        setUserIds([]);
        setCadence(null);
        setDays([]);
        setDueDate("");
        setGuidelineUrl("");
        clearGuidelineImage();
        setSubtasks([]);
        setSubtaskDraft("");
        setTemplateId("");
        setSaveTemplate(false);
        setTemplateName("");
      } else {
        setMessage({ ok: false, text: result.message });
      }
    });
  };

  return (
    // Bare mode (the + Task modal): a flex column so the fields region can
    // scroll independently while the submit footer below stays pinned —
    // the modal card caps the height (max-h), this fills it. Non-bare
    // (inline card) has no height cap, so the same markup just flows.
    <div className={bare ? "flex min-h-0 flex-1 flex-col" : "rounded-2xl border border-gray-200 bg-white p-5"}>
      {!bare && (
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-500">
          Assign Task
        </h3>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
        {/* Task Templates (2026-07-31): pick one to pre-fill the structure
            (title/subtasks/cadence/guideline) — recipients, days, and due
            date always start fresh. Using a template never modifies it.
            The old Manage link is gone (2026-07-31): rename/delete/archive
            live in the hub's Edit/Remove/Archive tabs now. */}
        {templates && templates.list.length > 0 && (
          <div className="max-w-xl rounded-2xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-sm font-medium text-gray-600">Template</p>
            <select
              value={templateId}
              onChange={(e) => void applyTemplate(e.target.value)}
              disabled={templateBusy}
              className={`mt-2 ${selectClass}`}
            >
              <option value="">Select</option>
              {templates.list.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.subtaskCount} subtask{t.subtaskCount === 1 ? "" : "s"}
                  {t.hasGuidelineUrl || t.hasGuidelineImage ? ", guideline" : ""})
                </option>
              ))}
            </select>
            {templateBusy && <p className="mt-1.5 text-xs text-gray-400">Loading template…</p>}
          </div>
        )}

        <label className="max-w-xl text-sm text-gray-600">
          Task title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Type here..."
            className="mt-1 w-full rounded-full border border-gray-300 px-4 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
          />
        </label>

        {/* Subtasks (moved 2026-07-31): DIRECTLY under the Task title —
            visually nested via the left guide line — mirroring how the
            task list renders them (parent title, subtasks indented
            below). Each entry becomes a FULL task row of its own (own
            status/proof/due, completion independent of the main task)
            for every recipient × day. Empty = a normal single task;
            nothing here ever blocks submission. */}
        <div className="ml-4 max-w-xl border-l-2 border-gray-200 pl-3">
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-sm font-medium text-gray-600">Subtasks</p>
            <div className="mt-2 flex gap-2">
              <input
                value={subtaskDraft}
                onChange={(e) => setSubtaskDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSubtask();
                  }
                }}
                placeholder="Type a subtask..."
                maxLength={200}
                className="min-w-0 flex-1 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={addSubtask}
                disabled={!subtaskDraft.trim() || subtasks.length >= SUBTASK_MAX}
                className="shrink-0 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 disabled:opacity-40"
              >
                + Add
              </button>
            </div>
            {subtasks.length > 0 && (
              <ol className="mt-2 space-y-1">
                {subtasks.map((s, i) => (
                  <li
                    key={`${i}-${s}`}
                    className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700"
                  >
                    <span className="w-5 shrink-0 text-xs text-gray-400">{i + 1}.</span>
                    <span className="min-w-0 flex-1 truncate">{s}</span>
                    <button
                      type="button"
                      onClick={() => removeSubtask(i)}
                      aria-label={`Remove subtask ${s}`}
                      className="shrink-0 rounded-full p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ol>
            )}
            {subtasks.length >= SUBTASK_MAX && (
              <p className="mt-1.5 text-xs text-gray-400">Maximum {SUBTASK_MAX} subtasks.</p>
            )}
          </div>
        </div>

        <RecipientPicker
          staff={staff}
          selected={userIds}
          onChange={setUserIds}
          restrictToGroup={recipientGroup}
        />

        <div className="text-sm text-gray-600">
          Cadence
          <div role="radiogroup" aria-label="Cadence" className="mt-1 flex gap-2">
            {visibleCadences.map((value) => {
              const active = cadence === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  onClick={() => setCadence(value)}
                  aria-checked={active}
                  className={`rounded-full border px-4 py-1.5 text-sm font-medium ${
                    active
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-gray-300 bg-white text-gray-600 hover:border-gray-400"
                  }`}
                >
                  {CADENCE_LABELS[value]}
                </button>
              );
            })}
          </div>
        </div>

        {/* No recurrence control here: since 2026-07-25 (final decision)
            EVERY Daily task auto-recurs weekly, system-wide — see
            engine/recurrence.ts. */}
        {showDay && (
          <div className="max-w-md">
            <p className="text-sm text-gray-600">Day</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {FLOW_DAYS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(d)}
                  aria-pressed={days.includes(d)}
                  className={dayChipClass(days.includes(d))}
                >
                  {d}
                </button>
              ))}
            </div>
            {days.length > 0 && (
              <div className="mt-2 rounded-2xl border border-gray-200 bg-gray-50 p-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-500">Selected ({days.length})</p>
                  <button
                    type="button"
                    onClick={() => setDays([])}
                    className="text-xs font-medium text-gray-400 hover:text-gray-600"
                  >
                    Clear all
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {days.map((d) => (
                    <button key={d} type="button" onClick={() => toggleDay(d)} className={dayChipClass(true)}>
                      {d} ×
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        <label className="max-w-xs text-sm text-gray-600">
          Due Date (optional)
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={`mt-1 ${selectClass}`}
          />
        </label>

        {/* Guideline (optional, 2026-07-30): SOP link and/or reference
            image. Leaving both empty is fine — routine tasks need no
            guidance; nothing here ever blocks submission. */}
        <div className="max-w-xl rounded-2xl border border-gray-200 bg-gray-50 p-3">
          <p className="text-sm font-medium text-gray-600">Guidelines</p>
          <label className="mt-2 block text-sm text-gray-600">
            Link
            <input
              type="url"
              value={guidelineUrl}
              onChange={(e) => setGuidelineUrl(e.target.value)}
              placeholder="https://… (SOP document, Google Doc, …)"
              className="mt-1 w-full rounded-full border border-gray-300 bg-white px-4 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
            />
          </label>
          <label className="mt-2 block text-sm text-gray-600">
            Image <span className="text-xs text-gray-400">(PNG / JPG / WebP, ≤ 2 MB)</span>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => onGuidelineImagePick(e.target.files?.[0])}
              className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 file:shadow-sm hover:file:bg-gray-100"
            />
          </label>
          {guidelineImage && (
            <div className="mt-2 flex items-start gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={guidelineImage.previewUrl}
                alt="Guideline preview"
                className="max-h-28 rounded-lg border border-gray-200 object-contain"
              />
              <button
                type="button"
                onClick={clearGuidelineImage}
                className="text-xs font-medium text-gray-400 hover:text-red-600"
              >
                ✕ remove {guidelineImage.name}
              </button>
            </div>
          )}
        </div>

        {/* Save as Template (2026-07-31): also store this task's STRUCTURE
            (title/subtasks/cadence/guideline — never recipients/days/due
            date) for reuse. Saving under an existing template's name
            overwrites it — that's the intended "edit template" path. */}
        {templates && (
          <div className="max-w-xl rounded-2xl border border-gray-200 bg-gray-50 p-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-600">
              <input
                type="checkbox"
                checked={saveTemplate}
                onChange={(e) => setSaveTemplate(e.target.checked)}
                className="size-4 rounded border-gray-300 accent-blue-600"
              />
              Save as Template
            </label>
            {saveTemplate && (
              <>
                <input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder={title.trim() ? `Template name (default: ${title.trim()})` : "Template name"}
                  maxLength={100}
                  className="mt-2 w-full rounded-full border border-gray-300 bg-white px-4 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
                />
                <p className="mt-1.5 text-xs text-gray-400">
                  Saves the task structure (title, subtasks, guideline) — not the recipients or dates.
                  Using an existing name updates that template.
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Sticky footer: OUTSIDE the scrollable fields region above, so the
          submit button is ALWAYS reachable no matter how tall the form grows
          (10 selected people + day chips + due date) or how short the
          viewport is — the 2026-07-25 mobile/tablet bug was this button
          rendering off-screen with no scroll path. All screen sizes. */}
      <div className="mt-3 flex shrink-0 items-center gap-3 border-t border-gray-100 pt-3">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "Assigning…" : "Assign task"}
        </button>
        {message && (
          <p className={`text-sm ${message.ok ? "text-emerald-600" : "text-red-600"}`}>
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
