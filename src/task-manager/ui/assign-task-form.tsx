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
  const [pending, startTransition] = React.useTransition();
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);

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
    startTransition(async () => {
      const result = await action({
        title: title.trim(),
        userIds,
        cadence,
        days,
        dueDate: dueDate || undefined,
      });
      if (result.ok) {
        setMessage({ ok: true, text: "Task Assigned" });
        setTitle("");
        setUserIds([]);
        setCadence(null);
        setDays([]);
        setDueDate("");
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
        <label className="max-w-xl text-sm text-gray-600">
          Task title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Type here..."
            className="mt-1 w-full rounded-full border border-gray-300 px-4 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
          />
        </label>

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
