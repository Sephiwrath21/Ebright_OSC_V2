"use client";

// Assign modal for Template Groups (2026-08-06): pick recipient(s) + day/
// due-date/cadence ONCE, then every task (+ subtasks) in the group gets
// created for them in one submit via control.apply. Deliberately separate
// from the Create/Edit modal — creating a template never asks for an
// assignee (per the confirmed design).
//
// Package recipient restriction (2026-08-06, still enforced under the
// 2026-08-07 View/Edit tier split): Package assignments can only target
// Branch Manager recipients server-side (the explicit role !== "BRANCH"
// target check in template-groups.ts's applyTemplateGroup — a separate
// concern from WHO may call assign, which is now requireGroupEditAccess,
// Super Admin + elevated dept-site only), so the picker here mirrors that
// recipient restriction — when label === "Package", `staff` is
// pre-filtered to role === "BRANCH" (the same definition the server check
// uses, NOT employmentType === "Manager", which is a related but
// not-guaranteed-identical field) before it ever reaches RecipientPicker,
// and the Group dropdown is trimmed to just "Branch Manager" via
// `groupOptions` — every other FLOW_GROUPS option would resolve empty
// against an already Branch-Manager-only staff list.
// Template keeps the full, unrestricted picker (label defaults to
// "Template", so `assignableStaff`/`groupOptions` fall through unchanged).
import * as React from "react";
import { FLOW_DAYS, visibleCadenceOptions, type CadenceOption } from "./types";
import type { FlowStaffMember, FlowTemplateGroupControl, FlowTemplateGroupSummary } from "./types";
import { RecipientPicker } from "./recipient-picker";

const CADENCE_LABELS: Record<CadenceOption, string> = {
  daily: "Daily",
  monthly: "Monthly",
  adhoc: "Ad hoc",
};

function dayChipClass(active: boolean): string {
  return `rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
    active
      ? "bg-blue-600 text-white hover:bg-blue-700"
      : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
  }`;
}

export function TemplateGroupAssignModal({
  control,
  staff,
  group,
  onClose,
  hideCadence = false,
  label = "Template",
}: {
  control: FlowTemplateGroupControl;
  staff: FlowStaffMember[];
  group: FlowTemplateGroupSummary;
  onClose: () => void;
  hideCadence?: boolean;
  /** Display copy override (2026-08-06) — "Template" (default) or "Package". */
  label?: "Template" | "Package";
}) {
  const [userIds, setUserIds] = React.useState<string[]>([]);
  const [cadence, setCadence] = React.useState<CadenceOption | null>(hideCadence ? "daily" : null);
  const [days, setDays] = React.useState<(typeof FLOW_DAYS)[number][]>([]);
  const [dueDate, setDueDate] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);

  const assignableStaff = label === "Package" ? staff.filter((s) => s.role === "BRANCH") : staff;
  const groupOptions = label === "Package" ? (["Branch Manager"] as const) : undefined;

  const selectedStaff = assignableStaff.filter((s) => userIds.includes(s.id));
  const visibleCadences = visibleCadenceOptions(selectedStaff);
  React.useEffect(() => {
    if (hideCadence) return;
    setCadence((prev) => (prev && visibleCadences.includes(prev) ? prev : null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleCadences.join(",")]);

  const showDay = cadence === "daily";
  React.useEffect(() => {
    if (!showDay) setDays([]);
  }, [showDay]);

  const toggleDay = (value: (typeof FLOW_DAYS)[number]) => {
    setDays((prev) => (prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value]));
  };

  const submit = () => {
    if (pending) return;
    if (userIds.length === 0) {
      setMessage({ ok: false, text: "Pick at least one recipient." });
      return;
    }
    if (!cadence) {
      setMessage({ ok: false, text: "Pick a cadence." });
      return;
    }
    startTransition(async () => {
      const result = await control.apply(group.id, {
        userIds,
        days,
        dueDate: dueDate || undefined,
        cadence,
      });
      if (result.ok) {
        onClose();
      } else {
        setMessage({
          ok: false,
          text: `${result.message} Some tasks in this group may already have been assigned — check before retrying.`,
        });
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900 dark:ring-1 dark:ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex shrink-0 items-center justify-between border-b border-gray-100 pb-3 dark:border-slate-800">
          <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Assign &ldquo;{group.name}&rdquo;</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-6 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            ✕
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
          <p className="text-xs text-gray-400">
            Creates all {group.taskCount} task{group.taskCount === 1 ? "" : "s"} in this {label.toLowerCase()} for
            every recipient picked below.
          </p>
          <RecipientPicker
            staff={assignableStaff}
            selected={userIds}
            onChange={setUserIds}
            groupOptions={groupOptions}
          />
          {!hideCadence && (
            <div className="text-sm text-gray-600 dark:text-slate-300">
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
                          : "border-gray-300 bg-white text-gray-600 hover:border-gray-400 dark:border-slate-500 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-slate-400"
                      }`}
                    >
                      {CADENCE_LABELS[value]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {showDay && (
            <div className="max-w-md">
              <p className="text-sm text-gray-600 dark:text-slate-300">Day</p>
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
            </div>
          )}
          <label className="max-w-xs text-sm text-gray-600 dark:text-slate-300">
            Due Date (optional)
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1 w-full appearance-none rounded-full border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none dark:border-slate-500 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>
        </div>

        <div className="mt-3 flex shrink-0 items-center gap-3 border-t border-gray-100 pt-3 dark:border-slate-800">
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {pending ? "Assigning…" : "Assign"}
          </button>
          {message && (
            <p className={`text-sm ${message.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>{message.text}</p>
          )}
        </div>
      </div>
    </div>
  );
}
