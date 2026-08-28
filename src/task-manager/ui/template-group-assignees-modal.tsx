"use client";

// "View Assignees" modal for Template Groups (2026-08-06): lists everyone
// currently holding a pending task from this group, with a per-person
// Remove action. Remove (2026-08-22 rule — corrected to a same-day
// cutoff) cancels ONLY today's instance of each task in the group;
// anything dated before today (pending, overdue, or completed) stays
// exactly as it is, and no NEW recurring instances get created for that
// person going forward. See data/templates-internal.ts's
// removeTemplateAssigneeCore doc comment.
import * as React from "react";
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

  const removeOne = (userId: string, name: string) => {
    if (busyUserId) return;
    setBusyUserId(userId);
    if (
      !window.confirm(
        `Remove ${name} from "${group.name}"? Today's task will be cancelled — they're no longer expected to complete it. Anything from before today (pending, overdue, or completed) stays untouched, and no new tasks will be created for them going forward. No one else assigned this ${labelLower} is affected.`,
      )
    ) {
      setBusyUserId(null);
      return;
    }
    startTransition(async () => {
      try {
        const result = await control.removeAssignee(group.id, userId);
        if (!mountedRef.current) return;
        if (result.ok) {
          const parts: string[] = [];
          if (result.cancelledToday > 0) {
            parts.push(`today's task${result.cancelledToday === 1 ? "" : "s"} cancelled`);
          }
          if (result.pendingKept > 0) {
            parts.push(`${result.pendingKept} earlier open task${result.pendingKept === 1 ? "" : "s"} kept untouched`);
          }
          setMessage({
            ok: true,
            text: `Removed ${name}${parts.length > 0 ? ` — ${parts.join(", ")}` : ""}.`,
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
                    onClick={() => removeOne(a.userId, a.name)}
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
    </div>
  );
}
