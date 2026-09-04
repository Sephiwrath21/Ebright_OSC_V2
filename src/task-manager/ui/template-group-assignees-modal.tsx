"use client";

// "View Assignees" modal for Template Groups (2026-08-06): lists everyone
// currently holding a pending task from this group, with a per-person
// Remove action. Remove (2026-08-22 rule — corrected to a same-day
// cutoff; 2026-08-27 fix — the cutoff has no upper bound; 2026-08-29 —
// scoped to a caller-chosen set of weekdays, not all-or-nothing) cancels
// every instance of each task in the group, on the CHOSEN weekday(s), due
// TODAY OR LATER; anything dated before today (pending, overdue, or
// completed), or on a weekday NOT chosen, stays exactly as it is, and no
// new recurring instances get created for that person on the chosen
// weekday(s) going forward. See data/templates-internal.ts's
// removeTemplateAssigneeCore doc comment.
import * as React from "react";
import { FLOW_DAYS } from "./types";
import type { FlowTemplateGroupAssignee, FlowTemplateGroupControl, FlowTemplateGroupSummary } from "./types";

const FALLBACK_MESSAGE = "Something went wrong — please try again";

export function TemplateGroupAssigneesModal({
  control,
  group,
  onClose,
  label = "Template",
}: {
  control: FlowTemplateGroupControl;
  group: FlowTemplateGroupSummary;
  onClose: () => void;
  label?: "Template" | "Package";
}) {
  const [loading, setLoading] = React.useState(true);
  const [assignees, setAssignees] = React.useState<FlowTemplateGroupAssignee[]>([]);
  const [busyUserId, setBusyUserId] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [, startTransition] = React.useTransition();
  const labelLower = label.toLowerCase();

  // Day-picker state (2026-08-29): set only while choosing which of a
  // multi-day person's weekdays to remove — see requestRemove/removeOne
  // below. `days` here is the FULL set being offered (a.days, or every
  // FLOW_DAYS as a fallback for the rare untracked-day case — see
  // requestRemove's own comment), `selected` is which of those are
  // currently checked (all, by default — same one-click "remove
  // everything" behavior the picker replaces).
  const [dayPicker, setDayPicker] = React.useState<{
    userId: string;
    name: string;
    days: (typeof FLOW_DAYS)[number][];
    selected: Set<(typeof FLOW_DAYS)[number]>;
  } | null>(null);

  // `load()` is invoked both by the mount effect below AND imperatively
  // after a successful remove — a plain per-effect `cancelled` local
  // (template-group-form.tsx's pattern) only guards the mount call, so a
  // component-lifetime ref stands in for it here, guarding every call site
  // against setState after the modal has been closed/unmounted mid-fetch.
  const mountedRef = React.useRef(true);
  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = React.useCallback(() => {
    control
      .assignees(group.id)
      .then((result) => {
        if (!mountedRef.current) return;
        setLoading(false);
        if (result.ok) {
          setAssignees(result.assignees);
        } else {
          setMessage({ ok: false, text: result.message });
        }
      })
      .catch(() => {
        if (!mountedRef.current) return;
        setLoading(false);
        setMessage({ ok: false, text: FALLBACK_MESSAGE });
      });
  }, [control, group.id]);

  React.useEffect(() => {
    load();
  }, [load]);

  const removeOne = (userId: string, name: string, weekdays: (typeof FLOW_DAYS)[number][]) => {
    if (busyUserId) return;
    setBusyUserId(userId);
    const dayList = weekdays.join(", ");
    if (
      !window.confirm(
        `Remove ${name} from "${group.name}" on ${dayList}? Today's and any later pending tasks on ${weekdays.length === 1 ? "that day" : "those days"} will be cancelled — they're no longer expected to complete them. Anything from before today (pending, overdue, or completed), or on any OTHER day, stays untouched, and no new tasks will be created for them on ${weekdays.length === 1 ? "that day" : "those days"} going forward. No one else assigned this ${labelLower} is affected.`,
      )
    ) {
      setBusyUserId(null);
      return;
    }
    startTransition(async () => {
      try {
        const result = await control.removeAssignee(group.id, userId, weekdays);
        if (!mountedRef.current) return;
        if (result.ok) {
          const parts: string[] = [];
          if (result.cancelledPending > 0) {
            parts.push(`${result.cancelledPending} pending task${result.cancelledPending === 1 ? "" : "s"} cancelled`);
          }
          if (result.pendingKept > 0) {
            parts.push(`${result.pendingKept} earlier open task${result.pendingKept === 1 ? "" : "s"} kept untouched`);
          }
          setMessage({
            ok: true,
            text: `Removed ${name} (${dayList})${parts.length > 0 ? ` — ${parts.join(", ")}` : ""}.`,
          });
          load();
        } else {
          setMessage({ ok: false, text: result.message });
        }
      } catch {
        if (mountedRef.current) setMessage({ ok: false, text: FALLBACK_MESSAGE });
      } finally {
        if (mountedRef.current) setBusyUserId(null);
      }
    });
  };

  /** Remove button click (2026-08-29): a person spanning more than one day
   *  opens the day-picker below (all days pre-checked — unchecking narrows
   *  the removal to just the remaining checked days); one day or fewer
   *  skips straight to the existing single-confirm flow, since there's
   *  nothing to choose between. The rare "0 tracked days" case (every
   *  pending instance is undated) falls back to every FLOW_DAYS — the
   *  broadest, always-safe action when we don't know which specific day(s)
   *  their untracked work is on. */
  const requestRemove = (a: FlowTemplateGroupAssignee) => {
    if (a.days.length > 1) {
      setDayPicker({ userId: a.userId, name: a.name, days: a.days, selected: new Set(a.days) });
      return;
    }
    removeOne(a.userId, a.name, a.days.length === 1 ? a.days : [...FLOW_DAYS]);
  };

  const toggleDay = (day: (typeof FLOW_DAYS)[number]) => {
    setDayPicker((prev) => {
      if (!prev) return prev;
      const next = new Set(prev.selected);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return { ...prev, selected: next };
    });
  };

  const confirmDayPicker = () => {
    if (!dayPicker || dayPicker.selected.size === 0) return;
    const { userId, name, days, selected } = dayPicker;
    setDayPicker(null);
    removeOne(userId, name, days.filter((d) => selected.has(d)));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900 dark:ring-1 dark:ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex shrink-0 items-center justify-between border-b border-gray-100 pb-3 dark:border-slate-800">
          <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Assignees — &ldquo;{group.name}&rdquo;</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-6 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {loading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : assignees.length === 0 ? (
            <p className="text-sm text-gray-400">No one currently has a pending task from this {labelLower}.</p>
          ) : (
            <ul className="space-y-2">
              {assignees.map((a) => (
                <li
                  key={a.userId}
                  className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-800"
                >
                  <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-slate-300">
                    {a.name}
                    {/* Which weekday(s) this person's pending instance(s)
                        fall on (2026-08-26, user request) — e.g. "- Tue,
                        Wed" so a viewer can tell at a glance whether a
                        given day is already covered for this template/
                        package. Omitted entirely when every one of their
                        pending tasks is undated (days is empty). */}
                    {a.days.length > 0 && (
                      <span className="ml-1.5 text-xs font-medium text-blue-600 dark:text-blue-400">
                        - {a.days.join(", ")}
                      </span>
                    )}
                    <span className="ml-1.5 text-xs text-gray-400">
                      {a.pendingTasks} pending task{a.pendingTasks === 1 ? "" : "s"}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={busyUserId === a.userId}
                    onClick={() => requestRemove(a)}
                    className="shrink-0 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-red-400 hover:text-red-600 disabled:opacity-40 dark:border-slate-500 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-red-500 dark:hover:text-red-400"
                  >
                    {busyUserId === a.userId ? "Removing…" : "Remove"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {message && (
          <p className={`mt-3 shrink-0 text-sm ${message.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
            {message.text}
          </p>
        )}
      </div>

      {/* Day-picker (2026-08-29) — a nested panel over a multi-day person's
          Remove click, same dimmed-backdrop-within-a-backdrop pattern as
          template-group-form.tsx's unsaved-changes guard. Its own
          stopPropagation keeps a click inside it from bubbling up and
          closing the outer "View Assignees" modal too. */}
      {dayPicker && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4"
          onClick={() => setDayPicker(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900 dark:ring-1 dark:ring-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
              Remove {dayPicker.name} from which day{dayPicker.days.length === 1 ? "" : "s"}?
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
              Uncheck any day you want to KEEP them on. Every day is checked by default.
            </p>
            <div className="mt-3 space-y-1.5">
              {dayPicker.days.map((day) => (
                <label
                  key={day}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <input
                    type="checkbox"
                    checked={dayPicker.selected.has(day)}
                    onChange={() => toggleDay(day)}
                    className="size-4 rounded border-gray-300 accent-blue-600 dark:border-slate-600"
                  />
                  {day}
                </label>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setDayPicker(null)}
                className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:border-gray-400 dark:border-slate-600 dark:text-slate-300 dark:hover:border-slate-500"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={dayPicker.selected.size === 0}
                onClick={confirmDayPicker}
                className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                Remove{dayPicker.selected.size > 0 ? ` (${dayPicker.selected.size})` : ""}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
