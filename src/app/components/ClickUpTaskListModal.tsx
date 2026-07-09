"use client";

import { useCallback, useEffect, useState } from "react";

interface TaskItem {
  id: string;
  name: string;
  status: string;
  statusColor: string;
  dueDate: number | null;
  listName: string;
  url: string;
}

export interface DrillTarget {
  spaceId: string;
  section: string;
  status: string | null;
  title: string;
  scope?: "overall" | "daily";
}

function formatDue(due: number | null): { label: string; overdue: boolean } {
  if (due === null) return { label: "No due date", overdue: false };
  const d = new Date(due);
  return {
    label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    overdue: due < Date.now(),
  };
}

export default function ClickUpTaskListModal({ target, onClose }: { target: DrillTarget; onClose: () => void }) {
  const [state, setState] = useState<{ kind: "loading" } | { kind: "error" } | { kind: "ready"; tasks: TaskItem[] }>({
    kind: "loading",
  });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    const params = new URLSearchParams({ section: target.section });
    if (target.status) params.set("status", target.status);
    if (target.scope) params.set("scope", target.scope);
    try {
      const res = await fetch(`/api/clickup/branches/${target.spaceId}/tasks?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) return setState({ kind: "error" });
      const data = await res.json();
      setState({ kind: "ready", tasks: (data.tasks ?? []) as TaskItem[] });
    } catch {
      setState({ kind: "error" });
    }
  }, [target]);

  useEffect(() => { load(); }, [load]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900 truncate pr-3">
            {target.title}
            {state.kind === "ready" && <span className="ml-2 text-slate-400 font-normal">({state.tasks.length})</span>}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-600 cursor-pointer shrink-0"
          >
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto p-2">
          {state.kind === "loading" && (
            <div className="p-3 space-y-2">
              {[0, 1, 2, 3].map((i) => <div key={i} className="h-9 bg-slate-100 rounded animate-pulse" />)}
            </div>
          )}
          {state.kind === "error" && (
            <div className="p-4 text-center">
              <p className="text-sm text-red-600 mb-2">Couldn&apos;t load tasks.</p>
              <button onClick={load} className="px-3 py-1.5 rounded-md bg-slate-100 text-slate-700 text-sm hover:bg-slate-200 cursor-pointer">Retry</button>
            </div>
          )}
          {state.kind === "ready" && state.tasks.length === 0 && (
            <p className="p-4 text-sm text-slate-500 text-center">No tasks.</p>
          )}
          {state.kind === "ready" && state.tasks.length > 0 && (
            <ul className="divide-y divide-slate-100">
              {state.tasks.map((t) => {
                const due = formatDue(t.dueDate);
                return (
                  <li key={t.id}>
                    <a href={t.url} target="_blank" rel="noopener noreferrer" className="group block px-3 py-2.5 hover:bg-slate-50 rounded-md">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-slate-800 group-hover:text-indigo-600 truncate">{t.name}</span>
                        <span className={`text-xs whitespace-nowrap ${due.overdue ? "text-red-600 font-medium" : "text-slate-400"}`}>{due.label}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                        <span className="inline-block px-1.5 py-0.5 rounded text-slate-700" style={{ backgroundColor: t.statusColor || "#e2e8f0" }}>
                          {t.status || "—"}
                        </span>
                        {t.listName && <span className="truncate">· {t.listName}</span>}
                      </div>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
