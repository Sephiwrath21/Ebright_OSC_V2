"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";

interface TaskView {
  id: string;
  name: string;
  status: string;
  statusColor: string;
  dueDate: number | null;
  priority: string | null;
  listName: string;
  folderName: string;
  ownerName: string | null;
  url: string;
}
interface IndividualTasks { userId: number; name: string; tasks: TaskView[] }
interface OtherBucket { ownerName: string; tasks: TaskView[] }

type Payload =
  | { configured: false }
  | {
      configured: true;
      scope: "own" | "department";
      viewerUserId: number;
      departmentName: string;
      individuals: IndividualTasks[];
      other: OtherBucket[];
    };

type State =
  | { kind: "loading" }
  | { kind: "notConfigured" }
  | { kind: "error" }
  | { kind: "ready"; data: Extract<Payload, { configured: true }> };

function formatDue(due: number | null): { label: string; overdue: boolean } {
  if (due === null) return { label: "No due date", overdue: false };
  const d = new Date(due);
  return {
    label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    overdue: due < Date.now(),
  };
}

function TaskList({ tasks }: { tasks: TaskView[] }) {
  if (tasks.length === 0) return <p className="text-sm text-slate-400">No open tasks.</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {tasks.map((task) => {
        const due = formatDue(task.dueDate);
        return (
          <li key={task.id} className="py-2">
            <a href={task.url} target="_blank" rel="noopener noreferrer" className="group block">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-slate-800 group-hover:text-indigo-600 truncate">{task.name}</span>
                <span className={`text-xs whitespace-nowrap ${due.overdue ? "text-red-600 font-medium" : "text-slate-400"}`}>
                  {due.label}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                <span className="inline-block px-1.5 py-0.5 rounded text-white" style={{ backgroundColor: task.statusColor || "#94a3b8" }}>
                  {task.status || "—"}
                </span>
                {task.priority && <span>· {task.priority}</span>}
                {task.listName && <span className="truncate">· {task.listName}</span>}
              </div>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

export default function TasksPage() {
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() { redirect("/login"); },
  });
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/clickup/tasks", { cache: "no-store" });
      if (!res.ok) return setState({ kind: "error" });
      const data: Payload = await res.json();
      if (!data.configured) return setState({ kind: "notConfigured" });
      setState({ kind: "ready", data });
    } catch {
      setState({ kind: "error" });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-blue-600 font-semibold text-lg">
        Loading…
      </div>
    );
  }

  const userEmail = session?.user?.email || "";
  const userRole = (session?.user as { role?: string } | undefined)?.role || "USER";
  const userName = session?.user?.name ?? null;

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <div className="max-w-5xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-semibold text-slate-900 mb-8">Ongoing Tasks</h1>

        {state.kind === "loading" && (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-16 bg-slate-100 rounded animate-pulse" />)}
          </div>
        )}

        {state.kind === "notConfigured" && (
          <p className="text-slate-500">ClickUp is not configured yet.</p>
        )}

        {state.kind === "error" && (
          <div>
            <p className="text-red-600 mb-3">Couldn&apos;t load tasks.</p>
            <button onClick={load} className="px-4 py-2 rounded-md bg-slate-100 text-slate-700 text-sm hover:bg-slate-200">
              Retry
            </button>
          </div>
        )}

        {state.kind === "ready" && (
          <>
            <section className="mb-10">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">{state.data.departmentName}</h2>
              <div className="space-y-6">
                {state.data.individuals.map((person) => (
                  <div key={person.userId} className="bg-white rounded-lg border border-slate-200 p-4">
                    <h3 className="text-sm font-semibold text-slate-900 mb-2">
                      {person.name}
                      {person.userId === state.data.viewerUserId && (
                        <span className="ml-2 text-xs font-normal text-indigo-500">(you)</span>
                      )}
                    </h3>
                    <TaskList tasks={person.tasks} />
                  </div>
                ))}
              </div>
            </section>

            {state.data.other.length > 0 && (
              <section className="mb-10">
                <h2 className="text-lg font-semibold text-slate-800 mb-1">Other (unmatched)</h2>
                <p className="text-xs text-slate-400 mb-4">
                  Tasks whose ClickUp owner couldn&apos;t be matched to an employee record (e.g. interns).
                </p>
                <div className="space-y-6">
                  {state.data.other.map((bucket) => (
                    <div key={bucket.ownerName} className="bg-white rounded-lg border border-slate-200 p-4">
                      <h3 className="text-sm font-semibold text-slate-900 mb-2">{bucket.ownerName}</h3>
                      <TaskList tasks={bucket.tasks} />
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
