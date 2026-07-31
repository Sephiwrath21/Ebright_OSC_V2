"use client";

// The + Task hub's Edit / Remove / Reassign panels (2026-07-31) — all
// template-scoped bulk operations, sharing one "pick a template" pattern:
//   Edit:     change the STRUCTURE (title/subtasks/guideline) and propagate
//             to every pending instance; completed records untouched.
//   Remove:   cancel every pending instance across all employees in one
//             action (optionally deleting the template too).
//   Reassign: move one employee's pending instance(s) to another employee.
// Every destructive/bulk action confirms with live affected-employee
// counts first. Grouping is by TEMPLATE ID — tasks assigned before the
// template link existed (or assigned without a template) aren't reachable
// here; those still use the per-row "Assign to Others" / status controls.

import * as React from "react";
import type {
  FlowStaffMember,
  FlowTemplateAssignee,
  FlowTemplateControl,
} from "./types";

const selectClass =
  "w-full appearance-none rounded-full border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none";

function TemplateSelect({
  templates,
  value,
  onChange,
  disabled,
}: {
  templates: FlowTemplateControl;
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block text-sm text-gray-600">
      Task (template)
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`mt-1 ${selectClass}`}
      >
        <option value="">Select a template…</option>
        {templates.list.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function Feedback({ message }: { message: { ok: boolean; text: string } | null }) {
  if (!message) return null;
  return (
    <p className={`text-sm ${message.ok ? "text-emerald-600" : "text-red-600"}`}>{message.text}</p>
  );
}

// ---------------------------------------------------------------- Edit --

export function TemplateEditPanel({ templates }: { templates: FlowTemplateControl }) {
  const [templateId, setTemplateId] = React.useState("");
  const [loaded, setLoaded] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [subtasks, setSubtasks] = React.useState<string[]>([]);
  const [subtaskDraft, setSubtaskDraft] = React.useState("");
  const [guidelineUrl, setGuidelineUrl] = React.useState("");
  const [guidelineImage, setGuidelineImage] = React.useState<{
    mime: "image/png" | "image/jpeg" | "image/webp";
    dataBase64: string;
    previewUrl: string;
  } | null>(null);
  const imageRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);

  const pick = async (id: string) => {
    setTemplateId(id);
    setLoaded(false);
    setMessage(null);
    if (!id) return;
    setBusy(true);
    const result = await templates.load(id);
    setBusy(false);
    if (!result.ok) {
      setMessage({ ok: false, text: result.message });
      return;
    }
    const t = result.template;
    setTitle(t.title);
    setSubtasks(t.subtasks);
    setSubtaskDraft("");
    setGuidelineUrl(t.guidelineUrl ?? "");
    setGuidelineImage(
      t.guidelineImage
        ? {
            mime: t.guidelineImage.mime,
            dataBase64: t.guidelineImage.dataBase64,
            previewUrl: `data:${t.guidelineImage.mime};base64,${t.guidelineImage.dataBase64}`,
          }
        : null,
    );
    setLoaded(true);
  };

  const onImagePick = (file: File | undefined) => {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setMessage({ ok: false, text: "Guideline image must be PNG, JPG, or WebP." });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setMessage({ ok: false, text: "Guideline image must be 2 MB or smaller." });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setGuidelineImage({
        mime: file.type as "image/png" | "image/jpeg" | "image/webp",
        dataBase64: dataUrl.slice(dataUrl.indexOf(",") + 1),
        previewUrl: dataUrl,
      });
      setMessage(null);
    };
    reader.readAsDataURL(file);
  };

  const save = async () => {
    if (!templateId || !title.trim()) {
      setMessage({ ok: false, text: "Pick a template and give the task a title." });
      return;
    }
    const trimmedUrl = guidelineUrl.trim();
    if (trimmedUrl && !/^https?:\/\//i.test(trimmedUrl)) {
      setMessage({ ok: false, text: "Guideline link must start with http:// or https://." });
      return;
    }
    setBusy(true);
    // Confirmation with live counts BEFORE anything changes.
    const impact = await templates.assignees(templateId);
    if (!impact.ok) {
      setBusy(false);
      setMessage({ ok: false, text: impact.message });
      return;
    }
    const employees = impact.assignees.length;
    const tasks = impact.assignees.reduce((n, a) => n + a.pendingTasks, 0);
    const warning =
      employees > 0
        ? `This will update this task for ${employees} employee${employees === 1 ? "" : "s"} who ${employees === 1 ? "hasn't" : "haven't"} completed it yet (${tasks} pending task${tasks === 1 ? "" : "s"}). Completed records are not changed. Pending subtasks are replaced by the new list.`
        : "No pending assignments right now — only the template itself will change.";
    if (!window.confirm(`Save changes to this template?\n\n${warning}`)) {
      setBusy(false);
      return;
    }
    const result = await templates.edit(templateId, {
      title: title.trim(),
      subtasks,
      guidelineUrl: trimmedUrl || undefined,
      guidelineImage: guidelineImage
        ? { mime: guidelineImage.mime, dataBase64: guidelineImage.dataBase64 }
        : null,
    });
    setBusy(false);
    if (result.ok) {
      setMessage({
        ok: true,
        text: `Template updated — ${result.updatedTasks} pending task${result.updatedTasks === 1 ? "" : "s"} across ${result.employees} employee${result.employees === 1 ? "" : "s"} refreshed.`,
      });
    } else {
      setMessage({ ok: false, text: result.message });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <TemplateSelect templates={templates} value={templateId} onChange={(id) => void pick(id)} disabled={busy} />
      {loaded && (
        <>
          <label className="block text-sm text-gray-600">
            Task title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              className="mt-1 w-full rounded-full border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </label>
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-sm font-medium text-gray-600">Subtasks</p>
            <div className="mt-2 flex gap-2">
              <input
                value={subtaskDraft}
                onChange={(e) => setSubtaskDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const s = subtaskDraft.trim();
                    if (s && subtasks.length < 20) {
                      setSubtasks((prev) => [...prev, s]);
                      setSubtaskDraft("");
                    }
                  }
                }}
                placeholder="Type a subtask..."
                maxLength={200}
                className="min-w-0 flex-1 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
              />
              <button
                type="button"
                disabled={!subtaskDraft.trim() || subtasks.length >= 20}
                onClick={() => {
                  setSubtasks((prev) => [...prev, subtaskDraft.trim()]);
                  setSubtaskDraft("");
                }}
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
                      onClick={() => setSubtasks((prev) => prev.filter((_, j) => j !== i))}
                      aria-label={`Remove subtask ${s}`}
                      className="shrink-0 rounded-full p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-sm font-medium text-gray-600">Guidelines</p>
            <label className="mt-2 block text-sm text-gray-600">
              Link
              <input
                value={guidelineUrl}
                onChange={(e) => setGuidelineUrl(e.target.value)}
                placeholder="https://…"
                className="mt-1 w-full rounded-full border border-gray-300 bg-white px-4 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
              />
            </label>
            <label className="mt-2 block text-sm text-gray-600">
              Image <span className="text-xs text-gray-400">(PNG / JPG / WebP, ≤ 2 MB)</span>
              <input
                ref={imageRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => onImagePick(e.target.files?.[0])}
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
                  onClick={() => {
                    setGuidelineImage(null);
                    if (imageRef.current) imageRef.current.value = "";
                  }}
                  className="text-xs font-medium text-gray-400 hover:text-red-600"
                >
                  ✕ remove image
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save & update all pending"}
            </button>
          </div>
        </>
      )}
      <Feedback message={message} />
    </div>
  );
}

// -------------------------------------------------------------- Remove --

export function TemplateRemovePanel({ templates }: { templates: FlowTemplateControl }) {
  const [templateId, setTemplateId] = React.useState("");
  const [impact, setImpact] = React.useState<{
    pendingTasks: number;
    pendingEmployees: number;
    completedKept: number;
  } | null>(null);
  const [alsoDelete, setAlsoDelete] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);

  const pick = async (id: string) => {
    setTemplateId(id);
    setImpact(null);
    setMessage(null);
    if (!id) return;
    setBusy(true);
    const result = await templates.impact(id);
    setBusy(false);
    if (result.ok) setImpact(result);
    else setMessage({ ok: false, text: result.message });
  };

  const remove = async () => {
    if (!templateId || !impact) return;
    const warning = `This will remove this task from ${impact.pendingEmployees} employee${impact.pendingEmployees === 1 ? "" : "s"} who ${impact.pendingEmployees === 1 ? "hasn't" : "haven't"} completed it yet (${impact.pendingTasks} pending task${impact.pendingTasks === 1 ? "" : "s"}). ${impact.completedKept} completed record${impact.completedKept === 1 ? "" : "s"} will be kept.${alsoDelete ? "\nThe template itself will ALSO be deleted." : ""}`;
    if (!window.confirm(`Remove this task in bulk?\n\n${warning}`)) return;
    setBusy(true);
    const result = await templates.removeAssignments(templateId, alsoDelete);
    setBusy(false);
    if (result.ok) {
      setMessage({ ok: true, text: "Removed from all pending assignees." });
      setTemplateId("");
      setImpact(null);
      setAlsoDelete(false);
    } else {
      setMessage({ ok: false, text: result.message });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <TemplateSelect templates={templates} value={templateId} onChange={(id) => void pick(id)} disabled={busy} />
      {impact && (
        <>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {impact.pendingTasks > 0 ? (
              <>
                Removing this task affects <strong>{impact.pendingEmployees}</strong> employee
                {impact.pendingEmployees === 1 ? "" : "s"} with{" "}
                <strong>{impact.pendingTasks}</strong> pending task
                {impact.pendingTasks === 1 ? "" : "s"}. {impact.completedKept} completed record
                {impact.completedKept === 1 ? "" : "s"} will be kept untouched.
              </>
            ) : (
              <>No pending assignments — {impact.completedKept} completed record{impact.completedKept === 1 ? "" : "s"} stay untouched.</>
            )}
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={alsoDelete}
              onChange={(e) => setAlsoDelete(e.target.checked)}
              className="size-4 rounded border-gray-300 accent-blue-600"
            />
            Also delete the template itself
          </label>
          <div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove()}
              className="rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? "Removing…" : "Remove from all pending assignees"}
            </button>
          </div>
        </>
      )}
      <Feedback message={message} />
    </div>
  );
}

// ------------------------------------------------------------ Reassign --

export function TemplateReassignPanel({
  templates,
  staff,
}: {
  templates: FlowTemplateControl;
  staff: FlowStaffMember[];
}) {
  const [templateId, setTemplateId] = React.useState("");
  const [assignees, setAssignees] = React.useState<FlowTemplateAssignee[] | null>(null);
  const [fromUserId, setFromUserId] = React.useState("");
  const [toUserId, setToUserId] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);

  const pick = async (id: string) => {
    setTemplateId(id);
    setAssignees(null);
    setFromUserId("");
    setToUserId("");
    setMessage(null);
    if (!id) return;
    setBusy(true);
    const result = await templates.assignees(id);
    setBusy(false);
    if (result.ok) setAssignees(result.assignees);
    else setMessage({ ok: false, text: result.message });
  };

  const move = async () => {
    if (!templateId || !fromUserId || !toUserId) return;
    const from = assignees?.find((a) => a.userId === fromUserId);
    const to = staff.find((s) => s.id === toUserId);
    if (
      !window.confirm(
        `Move "${from?.name ?? "this employee"}"'s pending task${(from?.pendingTasks ?? 1) === 1 ? "" : "s"} (incl. subtasks) to ${to?.name ?? "the selected employee"}?`,
      )
    )
      return;
    setBusy(true);
    const result = await templates.reassignAll(templateId, fromUserId, toUserId);
    setBusy(false);
    if (result.ok) {
      setMessage({ ok: true, text: `Reassigned to ${to?.name ?? "the new assignee"}.` });
      void pick(templateId); // refresh the assignee list
    } else {
      setMessage({ ok: false, text: result.message });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <TemplateSelect templates={templates} value={templateId} onChange={(id) => void pick(id)} disabled={busy} />
      {assignees && assignees.length === 0 && (
        <p className="text-sm text-gray-400">No one currently has a pending task from this template.</p>
      )}
      {assignees && assignees.length > 0 && (
        <>
          <label className="block text-sm text-gray-600">
            From (current assignee)
            <select
              value={fromUserId}
              onChange={(e) => setFromUserId(e.target.value)}
              className={`mt-1 ${selectClass}`}
            >
              <option value="">Select an employee…</option>
              {assignees.map((a) => (
                <option key={a.userId} value={a.userId}>
                  {a.name} ({a.pendingTasks} pending)
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-gray-600">
            To (new assignee)
            <select
              value={toUserId}
              onChange={(e) => setToUserId(e.target.value)}
              className={`mt-1 ${selectClass}`}
            >
              <option value="">Select an employee…</option>
              {staff
                .filter((s) => s.id !== fromUserId)
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </label>
          <div>
            <button
              type="button"
              disabled={busy || !fromUserId || !toUserId}
              onClick={() => void move()}
              className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? "Reassigning…" : "Reassign task"}
            </button>
          </div>
        </>
      )}
      <Feedback message={message} />
    </div>
  );
}
