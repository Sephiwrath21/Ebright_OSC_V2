"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, Users, Filter, Download, ChevronRight, Home, Loader2 } from "lucide-react";
import { BRANCHES as PCM_BRANCHES, gradeLabel, type Student as RawStudent } from "@/lib/pcm/types";

// ── Constants ─────────────────────────────────────────────────────────────────

const PCM_MIN_CHAPTER = 9;

const BRANCHES = PCM_BRANCHES.map(b => ({ code: b.code, name: b.name }));

// ── Types ─────────────────────────────────────────────────────────────────────

interface StudentRow {
  id: string;
  name: string;
  branch: string;
  grade: number;
  credit: number;
  active: boolean;
  archived: boolean;
  parentName: string;
  parentPhone: string;
  enrolmentDate: string;
  pcmHistory: Record<number, boolean>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function invitableGradesFor(s: StudentRow): number[] {
  const grades: number[] = [];
  for (let g = 1; g <= s.grade; g++) {
    if (g < s.grade) grades.push(g);
    else if (s.credit >= PCM_MIN_CHAPTER) grades.push(g);
  }
  return grades;
}

function hasBacklog(s: StudentRow): boolean {
  return invitableGradesFor(s).some((g) => s.pcmHistory[g] !== true);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PCMStudentListClient() {
  const [search, setSearch]                   = useState("");
  const [branchFilter, setBranchFilter]       = useState<string>("all");
  const [gradeFilter, setGradeFilter]         = useState<number | "all">("all");
  const [progressFilter, setProgressFilter]   = useState<"all" | "backlog" | "uptodate">("all");
  const [activeOnly, setActiveOnly]           = useState(false);
  const [scope, setScope]                     = useState<"current" | "archived" | "all">("current");

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/pcm/students", { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to load students (${res.status})`);
        const json = (await res.json()) as { students: RawStudent[] };
        if (!alive) return;
        // The API returns pcm_progress_json under `faHistory` (v1 field name);
        // map it onto this page's pcmHistory field.
        setStudents((json.students ?? []).map(s => ({
          id: s.id, name: s.name, branch: s.branch, grade: s.grade, credit: s.credit,
          active: s.active, archived: s.archived,
          parentName: s.parentName, parentPhone: s.parentPhone, enrolmentDate: s.enrolmentDate,
          pcmHistory: s.faHistory,
        })));
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Failed to load students");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const liveStudents  = useMemo(() => students.filter((s) => !s.archived), [students]);
  const archivedCount = useMemo(() => students.filter((s) => s.archived).length, [students]);

  const branchNameByCode = useMemo(
    () => Object.fromEntries(BRANCHES.map((b) => [b.code, b.name])),
    [],
  );

  const filtered = useMemo(() => {
    return students
      .filter((s) => scope === "all" ? true : scope === "archived" ? s.archived : !s.archived)
      .filter((s) => !activeOnly || s.active)
      .filter((s) => branchFilter === "all" || s.branch === branchFilter)
      .filter((s) => gradeFilter === "all" || s.grade === gradeFilter)
      .filter((s) => {
        if (progressFilter === "all") return true;
        const back = hasBacklog(s);
        return progressFilter === "backlog" ? back : !back;
      })
      .filter((s) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q) ||
          s.parentName.toLowerCase().includes(q)
        );
      })
      .sort(
        (a, b) =>
          a.branch.localeCompare(b.branch) ||
          b.grade - a.grade ||
          a.name.localeCompare(b.name),
      );
  }, [students, search, branchFilter, gradeFilter, progressFilter, activeOnly, scope]);

  function handleDownload() {
    const header = [
      "Student ID", "Name", "Branch", "Grade", "Chapter",
      "Active", "Archived", "PCM Done", "PCM Expected", "Guardian", "Guardian Phone",
    ];
    const rows = filtered.map((s) => {
      const grades = invitableGradesFor(s);
      const done = grades.filter((g) => s.pcmHistory[g] === true).length;
      return [
        s.id, s.name, s.branch, gradeLabel(s.grade), `C${s.credit}`,
        s.active ? "yes" : "no", s.archived ? "yes" : "no",
        done, grades.length, s.parentName, s.parentPhone,
      ];
    });
    const csv = [header, ...rows].map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `PCM_students_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950">
      <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-10">

        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 mb-4">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 transition-colors">
            <Home className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" aria-hidden="true" />
          <Link href="/dashboards/pcm" className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors">PCM System</Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" aria-hidden="true" />
          <span className="text-slate-800 dark:text-slate-200 font-medium">Student List</span>
        </nav>

        {/* Masthead */}
        <div className="mb-6">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1">PCM System</p>
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight">Student List</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                Every student across all {BRANCHES.length} branches with their per-grade PCM progress.
              </p>
              <div className="text-[11px] font-mono text-slate-400 mt-1.5">
                {liveStudents.length} students
                {archivedCount > 0 && <> · {archivedCount} archived</>}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleDownload}
                disabled={filtered.length === 0}
                className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <Download className="w-4 h-4" />
                Download CSV
              </button>
            </div>
          </div>
          <hr className="border-0 border-t border-slate-200 dark:border-slate-800 mt-5" />
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4 dark:bg-slate-900 dark:border-slate-800">
          <div className="flex flex-wrap items-end gap-3">

            {/* Search */}
            <div className="flex-1 min-w-[220px] max-w-md">
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Name, student ID, or guardian"
                  className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-500 dark:bg-slate-950 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Branch */}
            <div className="w-52">
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Branch</label>
              <select
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 dark:border-slate-500 dark:bg-slate-950 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All branches</option>
                {BRANCHES.map((b) => (
                  <option key={b.code} value={b.code}>{b.code} — {b.name}</option>
                ))}
              </select>
            </div>

            {/* Grade */}
            <div className="w-32">
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Grade</label>
              <select
                value={gradeFilter}
                onChange={(e) =>
                  setGradeFilter(e.target.value === "all" ? "all" : Number(e.target.value))
                }
                className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 dark:border-slate-500 dark:bg-slate-950 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All</option>
                {[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16].map((g) => (
                  <option key={g} value={g}>{gradeLabel(g)}</option>
                ))}
              </select>
            </div>

            {/* PCM Progress */}
            <div className="w-40">
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">PCM progress</label>
              <select
                value={progressFilter}
                onChange={(e) =>
                  setProgressFilter(e.target.value as "all" | "backlog" | "uptodate")
                }
                className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 dark:border-slate-500 dark:bg-slate-950 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All</option>
                <option value="backlog">Has backlog</option>
                <option value="uptodate">Up to date</option>
              </select>
            </div>

            {/* Records scope */}
            <div className="w-44">
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Records</label>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as "current" | "archived" | "all")}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 dark:border-slate-500 dark:bg-slate-950 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="current">Current students</option>
                <option value="archived">
                  Archived only{archivedCount > 0 ? ` (${archivedCount})` : ""}
                </option>
                <option value="all">All incl. archived</option>
              </select>
            </div>

            {/* Active only */}
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer pb-2">
              <input
                type="checkbox"
                checked={activeOnly}
                onChange={(e) => setActiveOnly(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer dark:border-slate-600"
              />
              Active only
            </label>
          </div>

          {/* Count */}
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-3 flex items-center gap-2">
            <Filter className="w-3 h-3" />
            Showing{" "}
            <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">{filtered.length}</span> of{" "}
            <span className="font-mono">{students.length}</span>{" "}
            {filtered.length !== 1 ? "students" : "student"}.
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center dark:bg-slate-900 dark:border-slate-800">
            <Loader2 className="w-6 h-6 text-slate-400 animate-spin mx-auto mb-2" />
            <div className="text-sm text-slate-500 dark:text-slate-400">Loading students…</div>
          </div>
        ) : error ? (
          <div className="bg-white rounded-xl border border-red-200 shadow-sm p-8 text-center dark:bg-slate-900 dark:border-red-900">
            <div className="text-sm font-medium text-red-600 dark:text-red-400">{error}</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center dark:bg-slate-900 dark:border-slate-800">
            <Users className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
            <div className="text-sm text-slate-500 dark:text-slate-400">No students match the current filters.</div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden dark:bg-slate-900 dark:border-slate-800">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 dark:bg-slate-800 dark:border-slate-800">
                  <tr className="text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    <th scope="col" className="px-4 py-3">Student</th>
                    <th scope="col" className="px-4 py-3">Branch</th>
                    <th scope="col" className="px-4 py-3 text-center">Grade</th>
                    <th scope="col" className="px-4 py-3 text-center">Chapter</th>
                    <th scope="col" className="px-4 py-3">
                      PCM Progress (G1 → current)
                      <div className="font-normal normal-case text-[10px] text-slate-400 mt-0.5">
                        ✓ done · ✗ not yet · 🔒 locked until C{PCM_MIN_CHAPTER}
                      </div>
                    </th>
                    <th scope="col" className="px-4 py-3">Guardian</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filtered.map((s) => {
                    const grades = invitableGradesFor(s);
                    const doneCount = grades.filter((g) => s.pcmHistory[g] === true).length;
                    const branchName = branchNameByCode[s.branch] ?? "";
                    const currentGradeLocked =
                      s.credit < PCM_MIN_CHAPTER && grades.indexOf(s.grade) === -1;
                    return (
                      <tr key={s.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/60 transition-colors">

                        {/* Student */}
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            {s.name}
                            {s.archived ? (
                              <span className="ml-2 font-mono text-[10px] uppercase text-amber-700 bg-amber-100 dark:bg-amber-900 dark:text-amber-300 px-1.5 py-0.5 rounded">
                                archived
                              </span>
                            ) : !s.active ? (
                              <span className="ml-2 font-mono text-[10px] uppercase text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                inactive
                              </span>
                            ) : null}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono">#{s.id}</div>
                        </td>

                        {/* Branch */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 dark:text-slate-300 dark:bg-slate-800 px-2 py-0.5 rounded">
                              {s.branch}
                            </span>
                            <span className="text-xs text-slate-500 dark:text-slate-400 truncate">{branchName}</span>
                          </div>
                        </td>

                        {/* Grade */}
                        <td className="px-4 py-3 text-center font-mono text-sm text-slate-900 dark:text-slate-100">
                          {gradeLabel(s.grade)}
                        </td>

                        {/* Chapter */}
                        <td className="px-4 py-3 text-center font-mono text-sm text-slate-700 dark:text-slate-300">
                          C{s.credit}
                        </td>

                        {/* PCM Progress */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 flex-wrap">
                            {grades.length === 0 ? (
                              <span
                                className="font-mono text-[10px] text-slate-400 italic"
                                title={`Not yet at C${PCM_MIN_CHAPTER} of ${gradeLabel(s.grade)}`}
                              >
                                Locked — needs C{PCM_MIN_CHAPTER}
                              </span>
                            ) : (
                              <>
                                {grades.map((g) => {
                                  const done = s.pcmHistory[g] === true;
                                  return (
                                    <span
                                      key={g}
                                      className={`font-mono text-[10px] px-1.5 py-0.5 rounded border ${
                                        done
                                          ? "bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-900 dark:text-emerald-400 dark:border-emerald-700"
                                          : "bg-red-50 text-red-600 border-red-200 dark:bg-red-900 dark:text-red-400 dark:border-red-700"
                                      }`}
                                      title={done
                                        ? `${gradeLabel(g)} PCM completed`
                                        : `${gradeLabel(g)} PCM not done yet`}
                                    >
                                      {gradeLabel(g)} {done ? "✓" : "✗"}
                                    </span>
                                  );
                                })}
                                {currentGradeLocked && (
                                  <span
                                    className="font-mono text-[10px] text-slate-400 italic"
                                    title={`Current-grade PCM unlocks at C${PCM_MIN_CHAPTER} (now at C${s.credit})`}
                                  >
                                    {gradeLabel(s.grade)} 🔒
                                  </span>
                                )}
                                <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400 ml-1">
                                  {doneCount}/{grades.length}
                                </span>
                              </>
                            )}
                          </div>
                        </td>

                        {/* Guardian */}
                        <td className="px-4 py-3">
                          <div className="text-sm text-slate-700 dark:text-slate-300">{s.parentName || "—"}</div>
                          <div className="text-[11px] font-mono text-slate-400">{s.parentPhone}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
