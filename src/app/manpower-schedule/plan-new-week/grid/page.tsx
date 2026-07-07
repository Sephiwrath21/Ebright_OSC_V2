"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { format, parseISO } from "date-fns";
import Link from "next/link";
import { Home as HomeIcon, ChevronRight } from "lucide-react";
import AppShell from "@/app/components/AppShell";
import {
  ALL_BRANCHES,
  COLUMNS,
  getTimeSlotsForDay,
  getWorkingDaysForBranch,
  isOpeningClosingSlot,
  isManagerOnDutySlot,
  isAdminSlot,
  getStaffColorByIndex,
  SELECT_ARROW_WHITE,
  SELECT_ARROW_DARK,
} from "@/lib/manpowerUtils";

// ─── API shapes ───────────────────────────────────────────────────────────────

interface StaffPayload {
  id: number;
  name: string;
  branch: string;
  role: string | null; // 'branch_manager_xxx' or null
}

interface ScheduleWire {
  id: string;
  branch: string;
  startDate: string;
  endDate: string;
  selections: Record<string, string>;
  notes: Record<string, string>;
  originalSelections?: Record<string, string>;
  originalNotes?: Record<string, string>;
  status?: string;
}

type Mode = "create" | "update" | "view";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dateForDay(startISO: string | null, day: string): string {
  if (!startISO) return "";
  const start = parseISO(startISO);
  const dayOrder = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];
  const idx = dayOrder.indexOf(day);
  if (idx === -1) return "";
  const d = new Date(start);
  d.setDate(d.getDate() + idx);
  return format(d, "dd MMM yyyy").toUpperCase();
}

// ─── Summary Table ────────────────────────────────────────────────────────────

function SummaryTable({
  title,
  data,
}: {
  title: string;
  data: { name: string; coachHrs: number; execHrs: number; total: number }[];
}) {
  const fmt = (h: number) => {
    const hrs = Math.floor(h);
    const min = Math.round((h - hrs) * 60);
    return { h: hrs.toString(), m: min.toString().padStart(2, "0") };
  };
  return (
    <div className="mt-12 bg-white p-8 rounded-2xl border border-slate-200 shadow-md overflow-hidden text-slate-800">
      <header className="border-b border-slate-200 pb-4 mb-4 text-center">
        <h2 className="m-0 text-lg font-bold text-slate-800">
          {title}
        </h2>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="w-[60px] border border-slate-300 bg-slate-800 p-3 text-white font-bold text-center">No.</th>
              <th className="w-[250px] border border-slate-300 bg-slate-800 p-3 text-white font-bold text-left">Name</th>
              <th className="w-[240px] border border-slate-300 bg-slate-800 p-3 text-white font-bold text-center">Class (Coach)</th>
              <th className="w-[240px] border border-slate-300 bg-slate-800 p-3 text-white font-bold text-center">Executive</th>
              <th className="w-[240px] border border-slate-300 bg-slate-800 p-3 text-white font-bold text-center">Total (hrs:min)</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => {
              const c = fmt(row.coachHrs);
              const e = fmt(row.execHrs);
              const t = fmt(row.total);
              return (
                <tr key={row.name} className="even:bg-slate-50 hover:bg-slate-100 transition-colors">
                  <td className="border border-slate-300 px-3 py-3 text-center font-bold text-slate-500">{i + 1}</td>
                  <td className="border border-slate-300 px-3 py-3 font-black text-slate-800">{row.name}</td>
                  {[c, e, t].map((time, j) => (
                    <td key={j} className={`border border-slate-300 px-2 py-3 ${j === 2 ? "bg-blue-50/50" : ""}`}>
                      <div className="flex flex-row gap-4 items-center justify-center">
                        <div className="flex items-baseline gap-1 bg-white border border-slate-200 px-2 py-1 rounded">
                          <span className="text-sm font-bold text-slate-700">{time.h}</span>
                          <span className="text-[9px] uppercase font-black text-slate-400">hrs</span>
                        </div>
                        <div className="flex items-baseline gap-1 bg-white border border-slate-200 px-2 py-1 rounded">
                          <span className="text-sm font-bold text-slate-700">{time.m}</span>
                          <span className="text-[9px] uppercase font-black text-slate-400">min</span>
                        </div>
                      </div>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Page Content ─────────────────────────────────────────────────────────────

function PlanNewWeekGridContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const branch = searchParams.get("branch") ?? "Bandar Seri Putra";
  const startStr = searchParams.get("start");
  const endStr = searchParams.get("end");
  const mode: Mode = (searchParams.get("mode") as Mode) || "create";
  const isReadOnly = mode === "view";

  const workingDays = useMemo(() => getWorkingDaysForBranch(branch), [branch]);
  const [selectedDay, setSelectedDay] = useState<string>(workingDays[0] ?? "Thursday");
  const [editingDays, setEditingDays] = useState<Record<string, boolean>>(() =>
    workingDays.reduce(
      (acc, d) => ({ ...acc, [d]: !isReadOnly }),
      {} as Record<string, boolean>,
    ),
  );
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [columnReplacementBranch, setColumnReplacementBranch] = useState<Record<string, string>>({});
  const [managerReplacementBranch, setManagerReplacementBranch] = useState<Record<string, string>>({});
  const [showAddEmployeeModal, setShowAddEmployeeModal] = useState(false);
  const [newEmployeeName, setNewEmployeeName] = useState("");
  const [newEmployeePosition, setNewEmployeePosition] = useState("Part Time");

  // Live data
  const [staffByBranch, setStaffByBranch] = useState<Record<string, string[]>>({});
  const [managersByBranch, setManagersByBranch] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch staff (for dropdowns) + existing schedule (if mode=update/view)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Pull EVERY branch's staff in one shot. The grid lets a column be
        // assigned to a coach from another branch (replacement), so we need
        // the full directory grouped by branch — not just the selected one.
        const [staffRes, schedRes] = await Promise.all([
          fetch(`/api/branch-staff`),
          mode !== "create" ? fetch("/api/schedules") : Promise.resolve(null),
        ]);

        // Staff
        if (staffRes.ok) {
          const list: StaffPayload[] = await staffRes.json();
          if (cancelled) return;
          // Managers go ONLY into the Manager on Duty dropdown.
          // Coach/Exec dropdowns get the rest (PT/FT coaches).
          const staff: Record<string, string[]> = {};
          const mgrs: Record<string, string[]> = {};
          list.forEach(s => {
            if (!s.branch) return;
            const isManager = !!s.role && s.role.startsWith("branch_manager");
            if (isManager) {
              (mgrs[s.branch] ??= []).push(s.name);
            } else {
              (staff[s.branch] ??= []).push(s.name);
            }
          });
          setStaffByBranch(staff);
          setManagersByBranch(mgrs);
        }

        // Existing schedule
        if (schedRes && schedRes.ok) {
          const data = await schedRes.json();
          if (cancelled) return;
          if (data.success && Array.isArray(data.schedules)) {
            const match = data.schedules.find(
              (s: ScheduleWire) =>
                s.branch === branch && s.startDate === startStr,
            );
            if (match) {
              setSelections((match.selections ?? {}) as Record<string, string>);
              setNotes((match.notes ?? {}) as Record<string, string>);
            }
          }
        }
      } catch (err) {
        console.error("Failed to load grid data", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [branch, startStr, mode]);

  const ownStaff   = staffByBranch[branch] ?? [];
  const ownManagers = managersByBranch[branch] ?? [];

  const isEditing = !isReadOnly && !!editingDays[selectedDay];
  const day = selectedDay;
  const daySlots = getTimeSlotsForDay(day, branch);

  // Compute weekly hours summary from current selections
  const summaryData = useMemo(() => {
    const stats: Record<string, { coachHrs: number; execHrs: number; total: number }> = {};
    const allNames = Array.from(
      new Set([
        ...ownStaff,
        ...Object.values(selections).filter(v => !!v && v !== "None"),
      ]),
    );
    allNames.forEach(n => {
      stats[n] = { coachHrs: 0, execHrs: 0, total: 0 };
    });
    workingDays.forEach(dayName => {
      const isWeekend = dayName === "Saturday" || dayName === "Sunday";
      const dailyTarget = isWeekend ? 10.5 : 5.0;
      allNames.forEach(emp => {
        let coach = 0;
        let worked = false;
        getTimeSlotsForDay(dayName, branch).forEach(slot => {
          if (isOpeningClosingSlot(slot, branch)) return;
          COLUMNS.forEach(col => {
            if (selections[`${dayName}-${slot}-${col.id}`] === emp) {
              worked = true;
              if (col.type === "coach") {
                coach += isAdminSlot(slot, branch) ? 0.25 : 1.25;
              }
            }
          });
        });
        if (worked) {
          stats[emp].coachHrs += coach;
          stats[emp].execHrs += Math.max(0, dailyTarget - coach);
          stats[emp].total = stats[emp].coachHrs + stats[emp].execHrs;
        }
      });
    });
    return Object.entries(stats)
      .filter(([name, s]) => s.total > 0 || ownStaff.includes(name))
      .map(([name, s]) => ({ name, ...s }));
  }, [selections, ownStaff, workingDays, branch]);

  async function handleFinalSubmit() {
    if (!startStr || !endStr) return;
    if (!confirm("Save this schedule to the database?")) return;
    setSaveState("saving");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: `${branch}_${startStr}`,
          branch,
          startDate: startStr,
          endDate: endStr,
          selections,
          notes,
          status: mode === "update" ? "Updated" : "Finalized",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error ?? "Save failed");
      }
      setSaveState("saved");
      setTimeout(() => router.push("/manpower-schedule"), 1200);
    } catch (err) {
      setSaveState("error");
      setErrorMsg(err instanceof Error ? err.message : "Save failed");
    }
  }

  // Picking a name auto-fills the same column across every non-opening/closing
  // slot of the day, but skips slots where the name is already used elsewhere
  // (manager vs staff, other coach/exec column). Clearing only clears the one
  // cell. Mirrors the old project's handleNameSelect behavior.
  function setCell(day: string, slot: string, colId: string, value: string) {
    setSelections(prev => {
      const next = { ...prev };
      if (!value) {
        delete next[`${day}-${slot}-${colId}`];
        return next;
      }

      const daySlots = getTimeSlotsForDay(day, branch);
      daySlots.forEach(s => {
        if (isOpeningClosingSlot(s, branch)) return;

        if (colId === "MANAGER") {
          // Don't put someone in Manager if they're already a coach/exec for this slot
          const usedAsStaff = COLUMNS.some(
            c => next[`${day}-${s}-${c.id}`] === value,
          );
          if (usedAsStaff) return;
        } else {
          // Don't put someone in this column if they're already the manager for this slot
          if (next[`${day}-${s}-MANAGER`] === value) return;
          // Or already in another coach/exec column for this slot
          const usedInOtherColumn = COLUMNS.filter(c => c.id !== colId).some(
            c => next[`${day}-${s}-${c.id}`] === value,
          );
          if (usedInOtherColumn) return;
        }

        next[`${day}-${s}-${colId}`] = value;
      });

      return next;
    });
  }

  function clearAllForDay(d: string) {
    setSelections(p => {
      const next = { ...p };
      Object.keys(next).forEach(k => {
        if (k.startsWith(`${d}-`)) delete next[k];
      });
      return next;
    });
    setNotes(p => {
      const next = { ...p };
      Object.keys(next).forEach(k => {
        if (k.startsWith(`${d}-`)) delete next[k];
      });
      return next;
    });
  }

  const weekRangeLabel =
    startStr && endStr
      ? `${format(parseISO(startStr), "dd MMM yyyy")} – ${format(parseISO(endStr), "dd MMM yyyy")}`
      : "";

  return (
    <div className="min-h-full bg-slate-50">
      <div className="max-w-7xl mx-auto px-6 pt-4 pb-20">
        {/* Breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 text-sm text-slate-500 mb-6 flex-wrap"
        >
          <Link
            href="/home"
            className="flex items-center gap-1 hover:text-slate-900 transition-colors"
          >
            <HomeIcon className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/dashboards/hrms" className="hover:text-slate-900 transition-colors">
            HRMS
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link
            href="/manpower-schedule"
            className="hover:text-slate-900 transition-colors"
          >
            Manpower Planning
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link
            href={
              mode === "update"
                ? "/manpower-schedule/update"
                : mode === "view"
                ? "/manpower-schedule/archive"
                : "/manpower-schedule/plan-new-week"
            }
            className="hover:text-slate-900 transition-colors"
          >
            {mode === "update"
              ? "Update Manpower Schedule"
              : mode === "view"
              ? "Archive Overview"
              : "Plan New Week"}
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 font-medium">
            {branch}
            {weekRangeLabel && (
              <span className="text-slate-500 font-normal">
                {" "}
                ({weekRangeLabel})
              </span>
            )}
          </span>
        </nav>

        {/* Day tabs + Add Employee */}
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div className="flex gap-2 flex-wrap">
            {workingDays.map(d => {
              const active = selectedDay === d;
              return (
                <button
                  key={d}
                  onClick={() => setSelectedDay(d)}
                  className={`px-5 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-sm ${
                    active
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {d.slice(0, 3)}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => {
              setNewEmployeeName("");
              setNewEmployeePosition("Part Time");
              setShowAddEmployeeModal(true);
            }}
            className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-colors shadow-sm flex items-center gap-2"
          >
            + Add Employee
          </button>
        </div>

        {/* Day table */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200">
          <header className="bg-white p-4 border-b flex justify-between items-center relative">
            <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center">
              <h2 className="text-base font-bold text-slate-800 m-0 leading-none">
                {day}
              </h2>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                {dateForDay(startStr, day)}
              </span>
            </div>

            <div className="flex-1" />

            <div className="flex items-center gap-4 relative z-10">
              {isEditing && (
                <button
                  onClick={() => clearAllForDay(day)}
                  className="text-red-500 font-bold uppercase text-xs hover:underline"
                >
                  Clear All
                </button>
              )}
              {isEditing ? (
                <button
                  onClick={() => setEditingDays(p => ({ ...p, [day]: false }))}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-semibold text-xs transition-colors"
                >
                  Save Day
                </button>
              ) : (
                <button
                  onClick={() => setEditingDays(p => ({ ...p, [day]: true }))}
                  className="text-blue-600 border-2 border-blue-600 hover:bg-blue-50 px-6 py-2 rounded-lg font-bold text-xs uppercase transition-colors"
                >
                  Edit Day
                </button>
              )}
            </div>
          </header>

          <div className="overflow-x-auto relative">
            <table className="w-full border-collapse" style={{ minWidth: "2100px" }}>
              <thead className="bg-slate-800 text-white text-[10px] uppercase tracking-widest">
                <tr>
                  <th className="p-3 text-left w-[180px] sticky left-0 z-20 bg-slate-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.3)] border-r border-slate-600">
                    Time Slot
                  </th>
                  <th className="p-3 text-center border-l border-slate-600 w-[180px] bg-slate-700 border-b-4 border-b-emerald-400">
                    <div className="flex flex-col items-center gap-1">
                      <span>Manager on Duty</span>
                      {isEditing && (
                        <>
                          <select
                            value={managerReplacementBranch[day] ?? ""}
                            onChange={e =>
                              setManagerReplacementBranch(p => ({ ...p, [day]: e.target.value }))
                            }
                            className="text-[8px] bg-slate-600 text-white border-none rounded px-1 py-0.5 w-full appearance-none text-center"
                          >
                            <option value="">Own Branch</option>
                            {ALL_BRANCHES.filter(b => b !== branch).map(b => (
                              <option key={b} value={b}>{b}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => setManagerReplacementBranch(p => ({ ...p, [day]: "" }))}
                            className="text-[8px] text-orange-300 font-bold hover:text-white uppercase px-2 py-0.5 rounded transition-colors bg-slate-600"
                          >
                            CLEAR
                          </button>
                        </>
                      )}
                    </div>
                  </th>
                  {COLUMNS.map(col => (
                    <th
                      key={col.id}
                      className={`p-3 text-center border-l border-slate-600 w-[150px] ${
                        col.type === "exec" ? "bg-slate-700 border-b-4 border-b-blue-400" : ""
                      }`}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <span>{col.label}</span>
                        {isEditing && (
                          <>
                            <select
                              value={columnReplacementBranch[`${day}-${col.id}`] ?? ""}
                              onChange={e =>
                                setColumnReplacementBranch(p => ({
                                  ...p,
                                  [`${day}-${col.id}`]: e.target.value,
                                }))
                              }
                              className="text-[8px] bg-slate-600 text-white border-none rounded px-1 py-0.5 w-full appearance-none text-center"
                            >
                              <option value="">Own Branch</option>
                              {ALL_BRANCHES.filter(b => b !== branch).map(b => (
                                <option key={b} value={b}>{b}</option>
                              ))}
                            </select>
                            <button
                              onClick={() =>
                                setColumnReplacementBranch(p => ({
                                  ...p,
                                  [`${day}-${col.id}`]: "",
                                }))
                              }
                              className="text-[8px] text-orange-300 font-bold hover:text-white uppercase px-2 py-0.5 rounded transition-colors bg-slate-600"
                            >
                              CLEAR
                            </button>
                          </>
                        )}
                      </div>
                    </th>
                  ))}
                  <th className="p-3 text-center border-l border-slate-600 w-[250px]">
                    Notes/Remarks
                  </th>
                </tr>
              </thead>
              <tbody>
                {daySlots.map((slot, slotIdx) => {
                  const isOpenClose = isOpeningClosingSlot(slot, branch);
                  const showManager = isManagerOnDutySlot(slot, branch, day);
                  const managerKey = `${day}-${slot}-MANAGER`;
                  const managerVal = selections[managerKey] ?? "";

                  return (
                    <tr
                      key={slot}
                      className={`border-b transition-colors group ${
                        isOpenClose ? "bg-blue-50" : "hover:bg-slate-50"
                      }`}
                    >
                      <td
                        className={`p-3 font-bold border-r border-slate-200 text-xs sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] transition-colors text-slate-900 ${
                          isOpenClose
                            ? "bg-blue-100 group-hover:bg-blue-100"
                            : "bg-slate-50 group-hover:bg-slate-100"
                        }`}
                      >
                        {slot}
                      </td>

                      {!isOpenClose && (
                        <td className="p-2 border-l align-middle bg-emerald-50 w-[180px]">
                          {showManager ? (() => {
                            // Manager cell uses BMs from the replacement branch
                            // when one is set on this day, otherwise own branch.
                            const mgrReplBranch = managerReplacementBranch[day] ?? "";
                            const mgrSourceBranch = mgrReplBranch || branch;
                            const mgrList = managersByBranch[mgrSourceBranch] ?? [];
                            return (
                              <select
                                disabled={!isEditing}
                                value={managerVal}
                                onChange={e => setCell(day, slot, "MANAGER", e.target.value)}
                                className={`w-full p-2 rounded text-center font-bold text-xs appearance-none transition-all ${
                                  managerVal
                                    ? getStaffColorByIndex(managerVal, mgrList)
                                    : "border border-emerald-200 bg-white text-slate-700"
                                }`}
                                style={{
                                  backgroundImage: `url("${managerVal ? SELECT_ARROW_WHITE : SELECT_ARROW_DARK}")`,
                                  backgroundPosition: "right 0.3rem center",
                                  backgroundSize: "8px",
                                  backgroundRepeat: "no-repeat",
                                }}
                              >
                                <option value="">-- Select --</option>
                                {mgrList.map(name => {
                                  // Disable if this manager is already assigned
                                  // as a coach/exec for the same slot.
                                  const usedAsStaff = COLUMNS.some(
                                    c =>
                                      selections[`${day}-${slot}-${c.id}`] === name,
                                  );
                                  return (
                                    <option
                                      key={name}
                                      value={name}
                                      disabled={usedAsStaff && managerVal !== name}
                                    >
                                      {usedAsStaff && managerVal !== name
                                        ? `${name} (assigned as staff)`
                                        : name}
                                    </option>
                                  );
                                })}
                              </select>
                            );
                          })() : (
                            <div className="w-full h-[34px] rounded bg-emerald-100/50 border border-dashed border-emerald-200 flex items-center justify-center">
                              <span className="text-[9px] text-emerald-300 font-bold uppercase tracking-wider">—</span>
                            </div>
                          )}
                        </td>
                      )}

                      {isOpenClose ? (
                        <td colSpan={COLUMNS.length + 2} className="p-2 border-l text-center">
                          <span className="inline-flex items-center gap-2 bg-indigo-600 text-white text-xs font-semibold px-4 py-1.5 rounded-full">
                            All Staff — Executive ({slotIdx === 0 ? "Opening" : "Closing"})
                          </span>
                        </td>
                      ) : (
                        <>
                          {COLUMNS.map(col => {
                            const val = selections[`${day}-${slot}-${col.id}`] ?? "";
                            // Coach/Exec cell uses PT/FT coaches from the
                            // replacement branch when one is set for this
                            // day+column, otherwise own branch.
                            const colReplBranch =
                              columnReplacementBranch[`${day}-${col.id}`] ?? "";
                            const sourceBranch = colReplBranch || branch;
                            const colStaff = staffByBranch[sourceBranch] ?? [];
                            // Names already taken in this slot by Manager or
                            // any other coach/exec column. Used to disable
                            // duplicate picks within the slot.
                            const namesUsedInSlot = new Set<string>([
                              ...COLUMNS.filter(c => c.id !== col.id)
                                .map(c => selections[`${day}-${slot}-${c.id}`])
                                .filter((n): n is string => !!n),
                              ...(managerVal ? [managerVal] : []),
                            ]);
                            return (
                              <td
                                key={col.id}
                                className={`p-1.5 border-l ${col.type === "exec" ? "bg-slate-50" : ""}`}
                              >
                                <select
                                  disabled={!isEditing}
                                  value={val}
                                  onChange={e => setCell(day, slot, col.id, e.target.value)}
                                  className={`w-full p-2 rounded appearance-none text-center font-bold transition-all text-xs ${
                                    val
                                      ? getStaffColorByIndex(val, colStaff)
                                      : "bg-white border border-slate-200 text-slate-400 hover:bg-slate-50"
                                  }`}
                                  style={{
                                    backgroundImage: `url("${val ? SELECT_ARROW_WHITE : SELECT_ARROW_DARK}")`,
                                    backgroundPosition: "right 0.3rem center",
                                    backgroundSize: "8px",
                                    backgroundRepeat: "no-repeat",
                                  }}
                                >
                                  <option value="">None</option>
                                  {colStaff.map(name => (
                                    <option
                                      key={name}
                                      value={name}
                                      disabled={namesUsedInSlot.has(name) && val !== name}
                                      className="text-slate-800 font-bold"
                                    >
                                      {name}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            );
                          })}
                          <td className="p-1.5 border-l w-[250px] bg-white">
                            <textarea
                              disabled={!isEditing}
                              value={notes[`${day}-${slot}-notes`] ?? ""}
                              onChange={e =>
                                setNotes(p => ({
                                  ...p,
                                  [`${day}-${slot}-notes`]: e.target.value,
                                }))
                              }
                              placeholder="Add remarks..."
                              className="w-full p-2 text-xs border border-slate-200 rounded bg-white resize-none h-[38px] overflow-y-auto outline-none focus:border-blue-500 transition-all font-medium italic text-slate-600 block"
                            />
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <SummaryTable title="Weekly Hours Summary" data={summaryData} />

        {!isReadOnly && (
          <div className="mt-16 text-center pb-10">
            {errorMsg && (
              <p className="text-sm font-bold text-red-600 mb-4">{errorMsg}</p>
            )}
            <button
              onClick={handleFinalSubmit}
              disabled={saveState === "saving" || saveState === "saved"}
              className={`px-10 py-3.5 rounded-xl text-sm font-semibold shadow-sm transition-colors ${
                saveState === "saved"
                  ? "bg-emerald-600 text-white"
                  : "bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-60 disabled:cursor-not-allowed"
              }`}
            >
              {saveState === "saving" && "Saving…"}
              {saveState === "saved" && "Saved — Redirecting…"}
              {(saveState === "idle" || saveState === "error") &&
                (mode === "update" ? "Save Adjustments" : "Final Submit & Archive")}
            </button>
          </div>
        )}

        {isReadOnly && (
          <div className="mt-12 mx-auto max-w-md text-center bg-slate-100 border border-slate-200 px-6 py-4 rounded-xl">
            <span className="font-semibold text-slate-500 text-sm">
              Read-only view
            </span>
          </div>
        )}

        {loading && (
          <div className="fixed bottom-6 right-6 bg-white border border-slate-200 shadow-lg rounded-xl px-4 py-2 text-xs font-bold text-slate-500 uppercase tracking-widest">
            Loading...
          </div>
        )}
      </div>

      {/* Add Employee modal (visual only) */}
      {showAddEmployeeModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white p-8 rounded-[2rem] shadow-2xl border border-slate-100 w-full max-w-sm flex flex-col gap-5">
            <h2 className="text-lg font-bold text-slate-800 text-center">
              Add Employee
            </h2>
            <div className="text-xs text-slate-500 text-center font-medium bg-slate-50 border border-slate-200 rounded-xl px-4 py-2">
              Branch: <span className="font-semibold text-slate-700">{branch}</span>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-slate-600">Full Name</label>
              <input
                type="text"
                value={newEmployeeName}
                onChange={e => setNewEmployeeName(e.target.value)}
                placeholder="e.g. Ahmad Bin Ali"
                className="w-full p-3 border-2 border-slate-200 rounded-xl bg-slate-50 font-bold text-slate-700 outline-none focus:border-green-500 transition-colors"
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-slate-600">Role</label>
              <select
                value={newEmployeePosition}
                onChange={e => setNewEmployeePosition(e.target.value)}
                className="w-full p-3 border-2 border-slate-200 rounded-xl bg-slate-50 font-bold text-slate-700 outline-none focus:border-green-500 transition-colors"
              >
                <option value="Part Time">Part Time</option>
                <option value="Full Time">Full Time</option>
                <option value="Branch Manager">Branch Manager</option>
              </select>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowAddEmployeeModal(false)}
                className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200 text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowAddEmployeeModal(false)}
                className="flex-1 py-2.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 text-sm transition-colors"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page (with AppShell + auth) ──────────────────────────────────────────────

export default function PlanNewWeekGridPage() {
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      redirect("/login");
    },
  });

  if (status === "loading") {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-full text-blue-600 font-semibold text-lg">
          Loading...
        </div>
      </AppShell>
    );
  }

  const userEmail = session?.user?.email ?? "";
  const userRole = (session?.user as { role?: string } | undefined)?.role ?? "USER";
  const userName = session?.user?.name ?? null;

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-full text-slate-500">
            Loading week...
          </div>
        }
      >
        <PlanNewWeekGridContent />
      </Suspense>
    </AppShell>
  );
}
