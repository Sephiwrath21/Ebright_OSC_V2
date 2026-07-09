"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import Link from "next/link";
import AppShell from "@/app/components/AppShell";
import StatusDonut from "@/app/components/StatusDonut";
import ClickUpTaskListModal, { type DrillTarget } from "@/app/components/ClickUpTaskListModal";

interface StatusSlice { status: string; color: string; count: number }
interface DayBreakdown { total: number; statusBreakdown: StatusSlice[] }
interface Branch { id: string; code: string; name: string; byDay: Record<string, DayBreakdown> }

type Payload =
  | { configured: false }
  | {
      configured: true;
      branchCount: number;
      loadedBranches: number;
      sections: string[];
      branches: Branch[];
    };

type State =
  | { kind: "loading" }
  | { kind: "forbidden" }
  | { kind: "notConfigured" }
  | { kind: "error" }
  | { kind: "ready"; data: Extract<Payload, { configured: true }> };

function BranchCard({ branch, day, onPick }: { branch: Branch; day: string; onPick: (status: string) => void }) {
  const bd = branch.byDay[day];
  const segments = (bd?.statusBreakdown ?? []).map((s) => ({ label: s.status, value: s.count, color: s.color }));
  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-900 truncate" title={`${branch.code} | ${branch.name}`}>
          {branch.code} | {branch.name}
        </h3>
        <span className="text-xs font-medium text-slate-400 tabular-nums">{bd?.total ?? 0}</span>
      </div>
      {bd && bd.total > 0 ? (
        <div className="flex items-center gap-4">
          <StatusDonut data={segments} size={104} onSliceClick={onPick} />
          <ul className="flex-1 min-w-0 space-y-1">
            {bd.statusBreakdown.map((s) => (
              <li key={s.status}>
                <button
                  onClick={() => onPick(s.status)}
                  className="flex w-full items-center gap-2 text-xs rounded px-1 -mx-1 py-0.5 hover:bg-slate-50 cursor-pointer"
                >
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} aria-hidden="true" />
                  <span className="text-slate-600 truncate capitalize">{s.status}</span>
                  <span className="ml-auto tabular-nums text-slate-400 shrink-0">
                    {s.count} · {Math.round((s.count / bd.total) * 100)}%
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-slate-400 py-6 text-center">No tasks</p>
      )}
    </section>
  );
}

export default function OperationsDashboardPage() {
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() { redirect("/login"); },
  });
  const [state, setState] = useState<State>({ kind: "loading" });
  const [day, setDay] = useState<string | null>(null);
  const [drill, setDrill] = useState<DrillTarget | null>(null);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/clickup/operations", { cache: "no-store" });
      if (res.status === 403) return setState({ kind: "forbidden" });
      if (!res.ok) return setState({ kind: "error" });
      const data: Payload = await res.json();
      if (!data.configured) return setState({ kind: "notConfigured" });
      setState({ kind: "ready", data });
      setDay((prev) => prev ?? data.sections[0] ?? null);
    } catch {
      setState({ kind: "error" });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Branches sorted by branch id (B01 → B21).
  const branchesForDay = useMemo(() => {
    if (state.kind !== "ready" || !day) return [];
    return [...state.data.branches].sort((a, b) => a.code.localeCompare(b.code));
  }, [state, day]);

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
      <div className="min-h-full bg-slate-50">
        <div className="max-w-7xl mx-auto px-6 py-10">
          <Link href="/clickup-dashboard" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-indigo-600 mb-4 cursor-pointer transition-colors">
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 0 1-.02 1.06L8.832 10l3.938 3.71a.75.75 0 1 1-1.04 1.08l-4.5-4.25a.75.75 0 0 1 0-1.08l4.5-4.25a.75.75 0 0 1 1.06.02Z" clipRule="evenodd" />
            </svg>
            All branches
          </Link>

          <header className="mb-6">
            <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Branch Operations</h1>
            <p className="mt-1 text-sm text-slate-500">
              Each branch&apos;s task status for the selected day
              {state.kind === "ready" && <> · {state.data.loadedBranches}/{state.data.branchCount} branches</>}
            </p>
          </header>

          {state.kind === "loading" && (
            <>
              <p className="text-sm text-slate-400 mb-4">Aggregating all branches… this can take a moment on first load.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
                {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                  <div key={i} className="bg-white rounded-xl border border-slate-200 p-5">
                    <div className="h-4 w-28 bg-slate-100 rounded animate-pulse mb-4" />
                    <div className="w-[104px] h-[104px] rounded-full bg-slate-100 animate-pulse" />
                  </div>
                ))}
              </div>
            </>
          )}

          {state.kind === "forbidden" && <p className="text-slate-500">This page is restricted to superadmin accounts.</p>}
          {state.kind === "notConfigured" && <p className="text-slate-500">ClickUp is not configured yet.</p>}
          {state.kind === "error" && (
            <div>
              <p className="text-red-600 mb-3">Couldn&apos;t load the operations dashboard.</p>
              <button onClick={load} className="px-4 py-2 rounded-md bg-slate-100 text-slate-700 text-sm hover:bg-slate-200 cursor-pointer transition-colors">Retry</button>
            </div>
          )}

          {state.kind === "ready" && (
            <>
              <div className="flex flex-wrap gap-2 mb-6">
                {state.data.sections.map((s) => (
                  <button
                    key={s}
                    onClick={() => setDay(s)}
                    className={`px-3.5 py-1.5 rounded-full text-sm font-medium cursor-pointer transition-colors ${
                      day === s ? "bg-indigo-600 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>

              {day && (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
                  {branchesForDay.map((b) => (
                    <BranchCard
                      key={b.id}
                      branch={b}
                      day={day}
                      onPick={(status) =>
                        setDrill({
                          spaceId: b.id,
                          section: day,
                          status,
                          title: `${b.code} · ${day} · ${status}`,
                          scope: "overall",
                        })
                      }
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {drill && <ClickUpTaskListModal target={drill} onClose={() => setDrill(null)} />}
    </AppShell>
  );
}
