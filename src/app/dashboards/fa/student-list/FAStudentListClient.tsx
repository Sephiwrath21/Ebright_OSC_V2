"use client";

import { useMemo, useState } from "react";
import { Search, Users, Filter, Download } from "lucide-react";

// ── Constants ────────────────────────────────────────────────────────────────

const FA_CURRENT_GRADE_MIN_CHAPTER = 9;

const BRANCHES = [
  { code: "FA1", name: "Foundation Academy 1" },
  { code: "FA2", name: "Foundation Academy 2" },
  { code: "FA3", name: "Foundation Academy 3" },
  { code: "FA4", name: "Foundation Academy 4" },
];

function gradeLabel(g: number): string {
  return `G${g}`;
}

// ── Types ────────────────────────────────────────────────────────────────────

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
  faHistory: Record<number, boolean>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function invitableGradesFor(s: StudentRow): number[] {
  const grades: number[] = [];
  for (let g = 1; g <= s.grade; g++) {
    if (g < s.grade) grades.push(g);
    else if (s.credit >= FA_CURRENT_GRADE_MIN_CHAPTER) grades.push(g);
  }
  return grades;
}

function hasBacklog(s: StudentRow): boolean {
  return invitableGradesFor(s).some((g) => s.faHistory[g] !== true);
}

// ── Mock data ────────────────────────────────────────────────────────────────

const MOCK_STUDENTS: StudentRow[] = [
  {
    id: "STU0001", name: "Ahmad Hafizuddin Bin Rashid", branch: "FA1", grade: 3,
    credit: 11, active: true, archived: false,
    parentName: "Rashid Bin Malik", parentPhone: "012-3456789",
    enrolmentDate: "2024-01-10",
    faHistory: { 1: true, 2: true, 3: false },
  },
  {
    id: "STU0002", name: "Nurul Ain Binti Zaki", branch: "FA2", grade: 5,
    credit: 9, active: true, archived: false,
    parentName: "Zaki Bin Ahmad", parentPhone: "011-9876543",
    enrolmentDate: "2024-02-15",
    faHistory: { 1: true, 2: true, 3: true, 4: true, 5: false },
  },
  {
    id: "STU0003", name: "Lim Wei Jie", branch: "FA1", grade: 2,
    credit: 6, active: false, archived: false,
    parentName: "Lim Ah Kow", parentPhone: "016-1112222",
    enrolmentDate: "2023-09-01",
    faHistory: { 1: true, 2: false },
  },
  {
    id: "STU0004", name: "Priya A/P Rajan", branch: "FA3", grade: 6,
    credit: 12, active: true, archived: false,
    parentName: "Rajan A/L Subramaniam", parentPhone: "017-3334444",
    enrolmentDate: "2024-03-20",
    faHistory: { 1: true, 2: true, 3: true, 4: true, 5: true, 6: false },
  },
  {
    id: "STU0005", name: "Muhammad Arif Bin Noor", branch: "FA2", grade: 8,
    credit: 14, active: true, archived: false,
    parentName: "Noor Bin Hassan", parentPhone: "019-5556666",
    enrolmentDate: "2022-01-05",
    faHistory: { 1: true, 2: true, 3: true, 4: true, 5: true, 6: true, 7: true, 8: true },
  },
  {
    id: "STU0006", name: "Tan Xin Yi", branch: "FA4", grade: 1,
    credit: 4, active: true, archived: false,
    parentName: "Tan Boon Huat", parentPhone: "013-7778888",
    enrolmentDate: "2025-01-08",
    faHistory: {},
  },
  {
    id: "STU0007", name: "Siti Hajar Binti Mohd Noor", branch: "FA1", grade: 7,
    credit: 10, active: true, archived: false,
    parentName: "Mohd Noor Bin Ibrahim", parentPhone: "014-9990000",
    enrolmentDate: "2023-06-12",
    faHistory: { 1: true, 2: true, 3: true, 4: false, 5: false, 6: false, 7: false },
  },
  {
    id: "STU0008", name: "Kevin Chong Zhi Hong", branch: "FA3", grade: 2,
    credit: 2, active: true, archived: false,
    parentName: "Chong Kok Wai", parentPhone: "012-1234567",
    enrolmentDate: "2026-01-20",
    faHistory: { 1: false },
  },
  {
    id: "STU0009", name: "Aisha Binti Hassan", branch: "FA2", grade: 8,
    credit: 16, active: false, archived: true,
    parentName: "Hassan Bin Osman", parentPhone: "011-2345678",
    enrolmentDate: "2020-03-01",
    faHistory: { 1: true, 2: true, 3: true, 4: true, 5: true, 6: true, 7: true, 8: true },
  },
  {
    id: "STU0010", name: "Darren Loh Zhi Hao", branch: "FA4", grade: 5,
    credit: 9, active: true, archived: false,
    parentName: "Loh Chin Huat", parentPhone: "016-3456789",
    enrolmentDate: "2024-08-15",
    faHistory: { 1: true, 2: true, 3: true, 4: true, 5: false },
  },
  {
    id: "STU0011", name: "Nabilah Farhana Binti Aziz", branch: "FA1", grade: 2,
    credit: 11, active: true, archived: false,
    parentName: "Aziz Bin Kamaruddin", parentPhone: "017-4567890",
    enrolmentDate: "2025-02-01",
    faHistory: { 1: true, 2: true },
  },
  {
    id: "STU0012", name: "Raja Izzatul Hafidz", branch: "FA3", grade: 6,
    credit: 7, active: true, archived: false,
    parentName: "Raja Faizal Bin Raja Ahmad", parentPhone: "019-5678901",
    enrolmentDate: "2023-11-20",
    faHistory: { 1: true, 2: true, 3: true, 4: true, 5: false },
  },
  {
    id: "STU0013", name: "Chai Mei Lin", branch: "FA4", grade: 4,
    credit: 10, active: true, archived: false,
    parentName: "Chai Boon Teck", parentPhone: "013-6789012",
    enrolmentDate: "2024-04-10",
    faHistory: { 1: true, 2: true, 3: true, 4: false },
  },
  {
    id: "STU0014", name: "Farhan Izzuddin Bin Yusof", branch: "FA2", grade: 1,
    credit: 3, active: true, archived: false,
    parentName: "Yusof Bin Ramli", parentPhone: "014-7890123",
    enrolmentDate: "2026-03-05",
    faHistory: {},
  },
  {
    id: "STU0015", name: "Yasmin Binti Razali", branch: "FA1", grade: 7,
    credit: 9, active: true, archived: false,
    parentName: "Razali Bin Hamid", parentPhone: "012-8901234",
    enrolmentDate: "2023-08-22",
    faHistory: { 1: true, 2: true, 3: true, 4: true, 5: true, 6: true, 7: false },
  },
];

// ── Component ────────────────────────────────────────────────────────────────

export default function FAStudentListClient() {
  const [search, setSearch]             = useState("");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [gradeFilter, setGradeFilter]   = useState<number | "all">("all");
  const [progressFilter, setProgressFilter] = useState<"all" | "backlog" | "uptodate">("all");
  const [activeOnly, setActiveOnly]     = useState(false);
  const [scope, setScope]               = useState<"current" | "archived" | "all">("current");

  const liveStudents   = useMemo(() => MOCK_STUDENTS.filter((s) => !s.archived), []);
  const archivedCount  = useMemo(() => MOCK_STUDENTS.filter((s) => s.archived).length, []);

  const branchNameByCode = useMemo(
    () => Object.fromEntries(BRANCHES.map((b) => [b.code, b.name])),
    [],
  );

  const filtered = useMemo(() => {
    return MOCK_STUDENTS
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
  }, [search, branchFilter, gradeFilter, progressFilter, activeOnly, scope]);

  function handleDownload() {
    const header = [
      "Student ID", "Name", "Branch", "Grade", "Chapter",
      "Active", "Archived", "FA Done", "FA Expected", "Guardian", "Guardian Phone",
    ];
    const rows = filtered.map((s) => {
      const grades = invitableGradesFor(s);
      const done = grades.filter((g) => s.faHistory[g] === true).length;
      return [
        s.id, s.name, s.branch, gradeLabel(s.grade), `C${s.credit}`,
        s.active ? "yes" : "no", s.archived ? "yes" : "no",
        done, grades.length, s.parentName, s.parentPhone,
      ];
    });
    const csv = [header, ...rows].map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = `FA_students_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-full bg-slate-50">
      <div className="max-w-7xl mx-auto px-6 pt-6 pb-10">

        {/* Masthead */}
        <div className="mb-6">
          <div className="text-[10px] font-mono uppercase tracking-widest text-amber-600 mb-2">
            FA System
          </div>
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="text-6xl font-bold italic text-slate-900 leading-none tracking-tight">
                Student List
              </h1>
              <p className="text-sm text-slate-500 mt-2">
                Every student across all {BRANCHES.length} branches with their per-grade FA progress.
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
                className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <Download className="w-4 h-4" />
                Download CSV
              </button>
            </div>
          </div>
          <hr className="border-0 border-t border-amber-200 mt-6" />
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4">
          <div className="flex flex-wrap items-end gap-3">

            {/* Search */}
            <div className="flex-1 min-w-[220px] max-w-md">
              <label className="block text-xs font-medium text-slate-500 mb-1">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Name, student ID, or guardian"
                  className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Branch */}
            <div className="w-52">
              <label className="block text-xs font-medium text-slate-500 mb-1">Branch</label>
              <select
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All branches</option>
                {BRANCHES.map((b) => (
                  <option key={b.code} value={b.code}>{b.code} — {b.name}</option>
                ))}
              </select>
            </div>

            {/* Grade */}
            <div className="w-32">
              <label className="block text-xs font-medium text-slate-500 mb-1">Grade</label>
              <select
                value={gradeFilter}
                onChange={(e) =>
                  setGradeFilter(e.target.value === "all" ? "all" : Number(e.target.value))
                }
                className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All</option>
                {[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16].map((g) => (
                  <option key={g} value={g}>{gradeLabel(g)}</option>
                ))}
              </select>
            </div>

            {/* FA Progress */}
            <div className="w-40">
              <label className="block text-xs font-medium text-slate-500 mb-1">FA progress</label>
              <select
                value={progressFilter}
                onChange={(e) =>
                  setProgressFilter(e.target.value as "all" | "backlog" | "uptodate")
                }
                className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All</option>
                <option value="backlog">Has backlog</option>
                <option value="uptodate">Up to date</option>
              </select>
            </div>

            {/* Records scope */}
            <div className="w-44">
              <label className="block text-xs font-medium text-slate-500 mb-1">Records</label>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as "current" | "archived" | "all")}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="current">Current students</option>
                <option value="archived">
                  Archived only{archivedCount > 0 ? ` (${archivedCount})` : ""}
                </option>
                <option value="all">All incl. archived</option>
              </select>
            </div>

            {/* Active only */}
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer pb-2">
              <input
                type="checkbox"
                checked={activeOnly}
                onChange={(e) => setActiveOnly(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              Active only
            </label>
          </div>

          {/* Result counter */}
          <div className="text-xs text-slate-500 mt-3 flex items-center gap-2">
            <Filter className="w-3 h-3" />
            Showing{" "}
            <span className="font-mono font-semibold text-slate-900">{filtered.length}</span> of{" "}
            <span className="font-mono">{MOCK_STUDENTS.length}</span>{" "}
            {filtered.length !== 1 ? "students" : "student"}.
          </div>
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
            <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <div className="text-sm text-slate-500">No students match the current filters.</div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <th scope="col" className="px-4 py-3">Student</th>
                    <th scope="col" className="px-4 py-3">Branch</th>
                    <th scope="col" className="px-4 py-3 text-center">Grade</th>
                    <th scope="col" className="px-4 py-3 text-center">Chapter</th>
                    <th scope="col" className="px-4 py-3">
                      FA Completed (G1 → current)
                      <div className="font-normal normal-case text-[10px] text-slate-400 mt-0.5">
                        ✓ done · ✗ not yet — completion history, not invitations
                      </div>
                    </th>
                    <th scope="col" className="px-4 py-3">Guardian</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((s) => {
                    const grades = invitableGradesFor(s);
                    const expected = grades.length;
                    const doneCount = grades.filter((g) => s.faHistory[g] === true).length;
                    const branchName = branchNameByCode[s.branch] ?? "";
                    const currentGradeLocked =
                      s.credit < FA_CURRENT_GRADE_MIN_CHAPTER &&
                      grades.indexOf(s.grade) === -1;
                    return (
                      <tr key={s.id} className="hover:bg-slate-50/60 transition-colors">
                        {/* Student */}
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">
                            {s.name}
                            {s.archived ? (
                              <span className="ml-2 font-mono text-[10px] uppercase text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                                archived
                              </span>
                            ) : !s.active ? (
                              <span className="ml-2 font-mono text-[10px] uppercase text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                                inactive
                              </span>
                            ) : null}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono">#{s.id}</div>
                        </td>

                        {/* Branch */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                              {s.branch}
                            </span>
                            <span className="text-xs text-slate-500 truncate">{branchName}</span>
                          </div>
                        </td>

                        {/* Grade */}
                        <td className="px-4 py-3 text-center font-mono text-sm text-slate-900">
                          {gradeLabel(s.grade)}
                        </td>

                        {/* Chapter */}
                        <td className="px-4 py-3 text-center font-mono text-sm text-slate-700">
                          C{s.credit}
                        </td>

                        {/* FA Completed */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 flex-wrap">
                            {grades.length === 0 ? (
                              <span
                                className="font-mono text-[10px] text-slate-400 italic"
                                title={`Not yet at C${FA_CURRENT_GRADE_MIN_CHAPTER} of ${gradeLabel(s.grade)}`}
                              >
                                Locked — needs C{FA_CURRENT_GRADE_MIN_CHAPTER}
                              </span>
                            ) : (
                              <>
                                {grades.map((g) => {
                                  const done = s.faHistory[g] === true;
                                  return (
                                    <span
                                      key={g}
                                      className={`font-mono text-[10px] px-1.5 py-0.5 rounded border ${
                                        done
                                          ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                                          : "bg-red-50 text-red-600 border-red-200"
                                      }`}
                                      title={
                                        done
                                          ? `${gradeLabel(g)} FA completed`
                                          : `${gradeLabel(g)} FA not done yet`
                                      }
                                    >
                                      {gradeLabel(g)} {done ? "✓" : "✗"}
                                    </span>
                                  );
                                })}
                                {currentGradeLocked && (
                                  <span
                                    className="font-mono text-[10px] text-slate-400 italic"
                                    title={`Current-grade FA unlocks at C${FA_CURRENT_GRADE_MIN_CHAPTER} (now at C${s.credit})`}
                                  >
                                    {gradeLabel(s.grade)} 🔒
                                  </span>
                                )}
                                <span className="font-mono text-[10px] text-slate-500 ml-1">
                                  {doneCount}/{expected}
                                </span>
                              </>
                            )}
                          </div>
                        </td>

                        {/* Guardian */}
                        <td className="px-4 py-3">
                          <div className="text-sm text-slate-700">{s.parentName || "—"}</div>
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
