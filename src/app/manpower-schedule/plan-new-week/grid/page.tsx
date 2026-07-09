"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { format, parseISO } from "date-fns";
import Link from "next/link";
import { Home as HomeIcon, ChevronRight } from "lucide-react";
import AppShell from "@/app/components/AppShell";
import {
  ALL_BRANCHES,
  isManagerOnDutySlot,
  isAdminSlot,
  getStaffColorByIndex,
  getSoftStaffColor,
  SELECT_ARROW_WHITE,
  SELECT_ARROW_DARK,
} from "@/lib/manpowerUtils";

// ─── API shapes ───────────────────────────────────────────────────────────────

interface StaffPayload {
  id: number;
  name: string;
  branch: string;
  role: string | null; // 'branch_manager_xxx' or null
  endDate: string | null;
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

function getDurationLabel(slotLabel: string): string {
  if (!slotLabel || !slotLabel.includes("-")) return "";
  try {
    const parts = slotLabel.split("-").map(s => s.trim());
    const parseTime = (tStr: string) => {
      const [time, ampm] = tStr.split(" ");
      const [hStr, mStr] = time.split(":");
      let h = parseInt(hStr);
      const m = parseInt(mStr || "0");
      if (ampm === "PM" && h < 12) h += 12;
      if (ampm === "AM" && h === 12) h = 0;
      return h * 60 + m;
    };
    const startMin = parseTime(parts[0]);
    const endMin = parseTime(parts[1]);
    const diff = endMin - startMin;
    if (diff <= 0) return "";
    const hours = Math.floor(diff / 60);
    const mins = diff % 60;
    
    if (hours > 0 && mins > 0) {
      return `${hours}h ${mins}m`;
    } else if (hours > 0) {
      return `${hours}h`;
    } else {
      return `${mins}m`;
    }
  } catch (e) {
    return "";
  }
}

// Resolves a day's slot list strictly from the DB-driven operating-day/slot
// data. A branch/day with no branch_operating_day + slot rows configured
// has zero rows here — no static/hardcoded template fallback. Callers must
// render an empty state in that case, not a default schedule.
function formatDbSlotsForDay(
  dbOperatingDays: any[],
  dayName: string,
  dayMapShort: Record<string, string>,
): { label: string; type: "opening" | "coach" | "closing"; sequence_no: number }[] {
  const shortDay = dayMapShort[dayName] || dayName;
  const opDay = dbOperatingDays.find(od => od.day_of_week === shortDay);

  if (!opDay || !Array.isArray(opDay.slots) || opDay.slots.length === 0) {
    return [];
  }

  return opDay.slots.map((s: any, idx: number) => {
    const formatTimeStr = (tStr: string) => {
      const parts = tStr.split(":");
      const h = parseInt(parts[0]);
      const m = parseInt(parts[1] ?? "0");
      const ampm = h >= 12 ? "PM" : "AM";
      const displayH = h % 12 === 0 ? 12 : h % 12;
      const displayM = String(m).padStart(2, "0");
      return `${displayH}:${displayM} ${ampm}`;
    };
    const startFormatted = formatTimeStr(s.slot_start);
    const endFormatted = formatTimeStr(s.slot_end);
    return {
      label: `${startFormatted} - ${endFormatted}`,
      type: s.slot_type as "opening" | "coach" | "closing",
      sequence_no: s.sequence_no ?? idx + 1,
    };
  });
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

  const [selectedDay, setSelectedDay] = useState<string>("");
  const [editingDays, setEditingDays] = useState<Record<string, boolean>>({});
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [columnReplacementBranch, setColumnReplacementBranch] = useState<Record<string, string>>({});
  const [managerReplacementBranch, setManagerReplacementBranch] = useState<Record<string, string>>({});
  const [showAddEmployeeModal, setShowAddEmployeeModal] = useState(false);
  const [newEmployeeName, setNewEmployeeName] = useState("");
  const [newEmployeePosition, setNewEmployeePosition] = useState("Part Time");

  const [coachCount, setCoachCount] = useState<number>(3);
  const [execCount, setExecCount] = useState<number>(3);
  const [trainingCount, setTrainingCount] = useState<number>(0);
  const [starCount, setStarCount] = useState<number>(0);
  const [scheduleType, setScheduleType] = useState<"planning" | "actual">(mode === "update" ? "actual" : "planning");
  const [periodStatus, setPeriodStatus] = useState<"draft" | "archived">("draft");
  const [changedSinceArchive, setChangedSinceArchive] = useState<boolean>(false);

  const COLUMNS = useMemo(() => {
    const list = [];
    for (let i = 1; i <= coachCount; i++) {
      list.push({ id: `coach${i}`, label: `Coach ${i}`, type: "coach" as const });
    }
    for (let i = 1; i <= execCount; i++) {
      list.push({ id: `exec${i}`, label: `Exec ${i}`, type: "exec" as const });
    }
    for (let i = 1; i <= trainingCount; i++) {
      list.push({ id: `training${i}`, label: `Training ${i}`, type: "training" as const });
    }
    for (let i = 1; i <= starCount; i++) {
      list.push({ id: `star${i}`, label: `Star Coach ${i}`, type: "star" as const });
    }
    return list;
  }, [coachCount, execCount, trainingCount, starCount]);

  // Live data
  const [staffByBranch, setStaffByBranch] = useState<Record<string, StaffPayload[]>>({});
  const [managersByBranch, setManagersByBranch] = useState<Record<string, StaffPayload[]>>({});

  const checkIfLeavingSoon = useCallback((name: string) => {
    if (!name || name === "None" || name === "-- Select --" || name === "Select staff") return false;
    for (const list of Object.values(staffByBranch)) {
      const found = list.find(s => s.name === name);
      if (found && found.endDate) {
        const diffMs = new Date(found.endDate).getTime() - Date.now();
        if (diffMs > 0 && diffMs < 14 * 24 * 60 * 60 * 1000) {
          return true;
        }
      }
    }
    for (const list of Object.values(managersByBranch)) {
      const found = list.find(s => s.name === name);
      if (found && found.endDate) {
        const diffMs = new Date(found.endDate).getTime() - Date.now();
        if (diffMs > 0 && diffMs < 14 * 24 * 60 * 60 * 1000) {
          return true;
        }
      }
    }
    return false;
  }, [staffByBranch, managersByBranch]);

  const [loading, setLoading] = useState(true);
  const [dbOperatingDays, setDbOperatingDays] = useState<any[]>([]);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch staff (for dropdowns) + existing schedule (if mode=update/view)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [staffRes, schedRes, settingsRes, positionsRes] = await Promise.all([
          fetch(`/api/branch-staff`),
          mode !== "create"
            ? fetch(`/api/schedules?branch=${encodeURIComponent(branch)}&startDate=${startStr}&endDate=${endStr}&scheduleType=${scheduleType}`)
            : Promise.resolve(null),
          fetch(`/api/schedules/settings?branchName=${encodeURIComponent(branch)}`),
          fetch(`/api/schedules/positions?branch=${encodeURIComponent(branch)}&weekStartDate=${startStr}`),
        ]);

        // Staff
        if (staffRes.ok) {
          const list: StaffPayload[] = await staffRes.json();
          if (cancelled) return;
          const staff: Record<string, StaffPayload[]> = {};
          const mgrs: Record<string, StaffPayload[]> = {};
          list.forEach(s => {
            if (!s.branch) return;
            const isManager = !!s.role && s.role.startsWith("branch_manager");
            if (isManager) {
              (mgrs[s.branch] ??= []).push(s);
            } else {
              (staff[s.branch] ??= []).push(s);
            }
          });
          setStaffByBranch(staff);
          setManagersByBranch(mgrs);
        }

        // Settings
        if (settingsRes.ok) {
          const data = await settingsRes.json();
          if (cancelled) return;
          if (data.success && Array.isArray(data.operatingDays)) {
            setDbOperatingDays(data.operatingDays);
          }
        }

        // Positions Counts
        if (positionsRes.ok) {
          const data = await positionsRes.json();
          if (cancelled) return;
          if (data.success && data.counts) {
            setCoachCount(data.counts.coach);
            setExecCount(data.counts.exec);
            setTrainingCount(data.counts.training);
            setStarCount(data.counts.star);
          }
        }

        // Existing schedule
        if (schedRes && schedRes.ok) {
          const data = await schedRes.json();
          if (cancelled) return;
          if (data.success && data.schedule) {
            const match = data.schedule;
            const sels = (match.selections ?? {}) as Record<string, string>;
            setSelections(sels);
            setNotes((match.notes ?? {}) as Record<string, string>);
            setPeriodStatus(match.periodStatus ?? "draft");
            setChangedSinceArchive(!!match.changedSinceArchive);
          } else {
            // Clear selections if no schedule exists for this type
            setSelections({});
            setNotes({});
            setPeriodStatus("draft");
            setChangedSinceArchive(false);
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
  }, [branch, startStr, endStr, mode, scheduleType]);

  const ownStaffNames = useMemo(() => {
    return (staffByBranch[branch] ?? []).map(s => s.name);
  }, [staffByBranch, branch]);

  const isEditing = !isReadOnly && !!editingDays[selectedDay];
  const day = selectedDay;

  const dayMapShort = useMemo(() => ({
    Monday: "Mon",
    Tuesday: "Tue",
    Wednesday: "Wed",
    Thursday: "Thu",
    Friday: "Fri",
    Saturday: "Sat",
    Sunday: "Sun"
  } as Record<string, string>), []);

  const dayOrderFull = useMemo(
    () => ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    [],
  );

  // Which days actually show up as tabs is driven entirely by
  // branch_operating_day.is_active for this branch — no static per-branch
  // working-day template.
  const workingDays = useMemo(
    () =>
      dayOrderFull.filter(dayName => {
        const shortDay = dayMapShort[dayName];
        return dbOperatingDays.some(od => od.day_of_week === shortDay && od.is_active);
      }),
    [dbOperatingDays, dayOrderFull, dayMapShort],
  );

  // Keep selectedDay/editingDays in sync once the real operating days load
  // (they start empty since dbOperatingDays is fetched asynchronously).
  useEffect(() => {
    if (workingDays.length === 0) return;
    setSelectedDay(prev => (workingDays.includes(prev) ? prev : workingDays[0]));
    setEditingDays(prev => {
      const next: Record<string, boolean> = {};
      workingDays.forEach(d => {
        next[d] = d in prev ? prev[d] : !isReadOnly;
      });
      return next;
    });
  }, [workingDays, isReadOnly]);

  const daySlots = useMemo(
    () => formatDbSlotsForDay(dbOperatingDays, selectedDay, dayMapShort),
    [dbOperatingDays, selectedDay, dayMapShort],
  );

  // Compute weekly hours summary from current selections
  const summaryData = useMemo(() => {
    const stats: Record<string, { coachHrs: number; execHrs: number; total: number }> = {};
    const allNames = Array.from(
      new Set([
        ...ownStaffNames,
        ...Object.values(selections).filter(v => !!v && v !== "None"),
      ]),
    );
    allNames.forEach(n => {
      stats[n] = { coachHrs: 0, execHrs: 0, total: 0 };
    });
    workingDays.forEach(dayName => {
      const isWeekend = dayName === "Saturday" || dayName === "Sunday";
      const dailyTarget = isWeekend ? 10.5 : 5.0;

      // Find slots for this dayName from dbOperatingDays
      const daySlotsList = formatDbSlotsForDay(dbOperatingDays, dayName, dayMapShort);

      allNames.forEach(emp => {
        let coach = 0;
        let worked = false;
        daySlotsList.forEach(slotObj => {
          if (slotObj.type === "opening" || slotObj.type === "closing") return;
          COLUMNS.forEach(col => {
            if (selections[`${dayName}-${slotObj.label}-${col.id}`] === emp) {
              worked = true;
              if (col.type === "coach") {
                coach += isAdminSlot(slotObj.label, branch) ? 0.25 : 1.25;
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
      .filter(([name, s]) => s.total > 0 || ownStaffNames.includes(name))
      .map(([name, s]) => ({ name, ...s }));
  }, [selections, ownStaffNames, workingDays, branch, dbOperatingDays, dayMapShort]);

  async function handleCountChange(type: "coach" | "exec" | "training" | "star", newCount: number) {
    if (isReadOnly) return;
    if (type === "coach") setCoachCount(newCount);
    else if (type === "exec") setExecCount(newCount);
    else if (type === "training") setTrainingCount(newCount);
    else if (type === "star") setStarCount(newCount);

    try {
      const counts = {
        coach: type === "coach" ? newCount : coachCount,
        exec: type === "exec" ? newCount : execCount,
        training: type === "training" ? newCount : trainingCount,
        star: type === "star" ? newCount : starCount,
      };

      const res = await fetch("/api/schedules/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch,
          weekStartDate: startStr,
          counts,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        console.error("Failed to update positions in DB:", data?.error);
      }
    } catch (err) {
      console.error("Error updating positions:", err);
    }
  }

  async function handleSaveDay(dayName: string) {
    if (!startStr || !endStr) return;
    setSaveState("saving");
    setErrorMsg(null);

    const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const dayIdx = dayOrder.indexOf(dayName);
    if (dayIdx === -1) return;
    
    const assignmentDate = new Date(`${startStr}T00:00:00Z`);
    assignmentDate.setUTCDate(assignmentDate.getUTCDate() + dayIdx);
    const dateStr = assignmentDate.toISOString().slice(0, 10);

    try {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch,
          startDate: startStr,
          endDate: endStr,
          date: dateStr,
          selections,
          scheduleType,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error ?? "Save failed");
      }
      setSaveState("idle");
      setEditingDays(p => ({ ...p, [dayName]: false }));
      
      // Refresh status and warnings
      const schedRes = await fetch(`/api/schedules?branch=${encodeURIComponent(branch)}&startDate=${startStr}&endDate=${endStr}&scheduleType=${scheduleType}`);
      if (schedRes.ok) {
        const schedData = await schedRes.json();
        if (schedData.success && schedData.schedule) {
          setPeriodStatus(schedData.schedule.periodStatus ?? "draft");
          setChangedSinceArchive(!!schedData.schedule.changedSinceArchive);
        }
      }
    } catch (err) {
      setSaveState("error");
      setErrorMsg(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function handleArchiveWeek() {
    if (!startStr || !endStr) return;
    if (!confirm("Finalize and archive this week's Actual schedule? This will lock the schedule and generate the manpower cost report rows.")) return;
    setSaveState("saving");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/schedules/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch,
          startDate: startStr,
          endDate: endStr,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error ?? "Archive failed");
      }
      setSaveState("saved");
      setPeriodStatus("archived");
      setChangedSinceArchive(false);
      setTimeout(() => router.push("/manpower-schedule"), 1200);
    } catch (err) {
      setSaveState("error");
      setErrorMsg(err instanceof Error ? err.message : "Archive failed");
    }
  }

  async function handleSaveWeeklyPlan() {
    if (!startStr || !endStr) return;
    setSaveState("saving");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch,
          startDate: startStr,
          endDate: endStr,
          selections,
          scheduleType: "planning",
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

      const slotsForDay = formatDbSlotsForDay(dbOperatingDays, day, dayMapShort);
      slotsForDay.forEach(({ label: s, type }) => {
        if (type === "opening" || type === "closing") return;

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

  function clearLocalSelectionsForDay(d: string) {
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

  // For Planning this only clears unsaved local edits (Save Day persists the
  // removal). For Actual, "Clear Day" deletes the DB rows immediately so the
  // day resets and re-clones fresh from Planning next time it's opened.
  async function clearAllForDay(d: string) {
    if (scheduleType !== "actual") {
      clearLocalSelectionsForDay(d);
      return;
    }

    if (!confirm("Clear all Actual assignments for this day? This deletes them immediately and cannot be undone.")) return;

    const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const dayIdx = dayOrder.indexOf(d);
    if (dayIdx === -1 || !startStr) return;
    const assignmentDate = new Date(`${startStr}T00:00:00Z`);
    assignmentDate.setUTCDate(assignmentDate.getUTCDate() + dayIdx);
    const dateStr = assignmentDate.toISOString().slice(0, 10);

    try {
      const res = await fetch("/api/schedules", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch, date: dateStr, scheduleType }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error ?? "Clear failed");
      }
      clearLocalSelectionsForDay(d);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Clear failed");
    }
  }

  // Clears one column (e.g. "MANAGER", "coach1") across every slot of the
  // current day. Local-only, same as picking "None" on each cell — persists
  // once Save Day / Final Submit is clicked.
  function clearColumnForDay(colId: string) {
    setSelections(prev => {
      const next = { ...prev };
      daySlots.forEach(s => {
        if (s.type === "opening" || s.type === "closing") return;
        delete next[`${day}-${s.label}-${colId}`];
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
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          {/* Breadcrumb */}
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-2 text-sm text-slate-500 flex-wrap"
          >
            <Link
              href="/home"
              className="flex items-center gap-1 hover:text-slate-900 transition-colors shrink-0"
            >
              <HomeIcon className="w-4 h-4" aria-hidden="true" />
              <span>Home</span>
            </Link>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
            <Link href="/dashboards/hrms" className="hover:text-slate-900 transition-colors shrink-0">
              HRMS
            </Link>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
            <Link
              href="/manpower-schedule"
              className="hover:text-slate-900 transition-colors shrink-0"
            >
              Manpower Planning
            </Link>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
            <Link
              href={
                mode === "update"
                  ? "/manpower-schedule/update"
                  : mode === "view"
                  ? "/manpower-schedule/archive"
                  : "/manpower-schedule/plan-new-week"
              }
              className="hover:text-slate-900 transition-colors shrink-0"
            >
              {mode === "update"
                ? "Update Manpower Schedule"
                : mode === "view"
                ? "Archive Overview"
                : "Plan New Week"}
            </Link>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
            <span className="text-slate-900 font-medium shrink-0">
              {branch}
              {weekRangeLabel && (
                <span className="text-slate-500 font-normal">
                  {" "}
                  ({weekRangeLabel})
                </span>
              )}
            </span>
          </nav>

          {!loading && (
            <div className="flex items-center gap-3 select-none shrink-0 whitespace-nowrap">
              {mode === "update" && (
                <div className="flex items-center gap-1 bg-slate-200/60 p-0.5 rounded-xl text-[11px] font-bold">
                  <button
                    onClick={() => setScheduleType("planning")}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      scheduleType === "planning"
                        ? "bg-white text-slate-800 shadow-xs"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    Planning
                  </button>
                  <button
                    onClick={() => setScheduleType("actual")}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      scheduleType === "actual"
                        ? "bg-white text-slate-800 shadow-xs"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    Actual
                  </button>
                </div>
              )}

              <div className="flex items-center gap-3 bg-white border border-slate-200/60 rounded-xl px-3 py-1.5 shadow-xs text-[11px]">
                <div className="flex items-center gap-1">
                  <span className="font-semibold text-slate-500">Coach:</span>
                  <select
                    disabled={isReadOnly}
                    value={coachCount}
                    onChange={(e) => handleCountChange("coach", Number(e.target.value))}
                    className="bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-2 py-0.5 font-bold text-slate-700 outline-none transition-colors cursor-pointer"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-semibold text-slate-500">Exec:</span>
                  <select
                    disabled={isReadOnly}
                    value={execCount}
                    onChange={(e) => handleCountChange("exec", Number(e.target.value))}
                    className="bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-2 py-0.5 font-bold text-slate-700 outline-none transition-colors cursor-pointer"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-semibold text-slate-500">Train:</span>
                  <select
                    disabled={isReadOnly}
                    value={trainingCount}
                    onChange={(e) => handleCountChange("training", Number(e.target.value))}
                    className="bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-2 py-0.5 font-bold text-slate-700 outline-none transition-colors cursor-pointer"
                  >
                    {[0, 1].map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-semibold text-slate-500">Star:</span>
                  <select
                    disabled={isReadOnly}
                    value={starCount}
                    onChange={(e) => handleCountChange("star", Number(e.target.value))}
                    className="bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-2 py-0.5 font-bold text-slate-700 outline-none transition-colors cursor-pointer"
                  >
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {mode === "update" && scheduleType === "actual" && (
          <div className="mb-4 flex flex-col gap-2">
            {periodStatus === "archived" && (
              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200/80 rounded-xl px-4 py-3 text-xs font-semibold text-emerald-800 shadow-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <span>This week's schedule has been Finalized & Archived. Manpower cost reports have been generated.</span>
                </div>
                <span className="bg-emerald-100/80 text-emerald-800 text-[10px] uppercase px-2.5 py-1 rounded-lg">Archived</span>
              </div>
            )}
            {changedSinceArchive && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200/80 rounded-xl px-4 py-3 text-xs font-semibold text-amber-800 shadow-xs">
                <span className="bg-amber-100 text-amber-800 text-[10px] uppercase px-2.5 py-1 rounded-lg shrink-0">Warning</span>
                <span>Schedule modified since last archive. Click "Final Submit & Archive" at the bottom to update cost reports.</span>
              </div>
            )}
          </div>
        )}

        {/* Day table */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-24 px-6 text-center">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                Loading schedule…
              </span>
            </div>
          ) : (
          <>
          <header className="bg-white p-4 border-b flex justify-between items-center relative gap-4 flex-wrap md:flex-nowrap">
            {/* Day tabs control on the left */}
            <div className="flex gap-1 bg-slate-100/80 p-1 rounded-xl select-none z-10">
              {workingDays.map(d => {
                const active = selectedDay === d;
                return (
                  <button
                    key={d}
                    onClick={() => setSelectedDay(d)}
                    className={`px-3.5 py-1.5 rounded-lg font-bold text-xs transition-all ${
                      active
                        ? "bg-white text-indigo-600 shadow-xs"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {d.slice(0, 3).toUpperCase()}
                  </button>
                );
              })}
            </div>

            {/* Day Title and Date centered */}
            <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none hidden md:flex">
              <h2 className="text-sm font-extrabold text-slate-800 m-0 leading-none tracking-tight">
                {day}
              </h2>
              <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider mt-0.5">
                {dateForDay(startStr, day)}
              </span>
            </div>

            {/* Editing actions on the right */}
            <div className="flex items-center gap-3 relative z-10 ml-auto">
              {isEditing && (
                <button
                  onClick={() => clearAllForDay(day)}
                  className="text-red-500 font-extrabold uppercase text-[10px] hover:underline px-2 py-1"
                >
                  Clear All
                </button>
              )}
              {isEditing ? (
                <button
                  onClick={() => handleSaveDay(day)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl font-bold text-xs transition-colors shadow-xs"
                >
                  Save Day
                </button>
              ) : (
                <button
                  onClick={() => setEditingDays(p => ({ ...p, [day]: true }))}
                  className="text-indigo-600 border border-indigo-200 bg-indigo-50/50 hover:bg-indigo-50 px-5 py-2 rounded-xl font-bold text-xs transition-colors"
                >
                  Edit Day
                </button>
              )}
            </div>
          </header>

          {!loading && daySlots.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 px-6 text-center">
              <span className="text-sm font-bold text-slate-700">
                {workingDays.length === 0
                  ? `No operating days set up for ${branch} yet`
                  : `No schedule set up for ${branch} on ${day}`}
              </span>
              <span className="text-xs text-slate-500 max-w-md">
                This branch has no operating hours or time slots configured{workingDays.length === 0 ? "" : " for this day"} yet.
                An Admin needs to set them up in Manpower Schedule Settings before staff can be assigned.
              </span>
              <Link
                href="/manpower-schedule/settings"
                className="mt-2 text-indigo-600 border border-indigo-200 bg-indigo-50/50 hover:bg-indigo-50 px-4 py-2 rounded-xl font-bold text-xs transition-colors"
              >
                Go to Settings
              </Link>
            </div>
          ) : (
          <div className="overflow-x-auto relative">
            <table className="w-full border-collapse" style={{ minWidth: `${470 + (coachCount + execCount) * 115}px` }}>
              <thead className="bg-slate-50/50 border-b border-slate-200 text-[10px] uppercase tracking-widest text-slate-700 font-bold">
                <tr>
                  <th className="p-3 text-left w-[160px] sticky left-0 z-20 bg-slate-50 border-r border-slate-200 text-slate-600 font-semibold shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] whitespace-nowrap">
                    Time Slot
                  </th>
                  <th className="p-3 text-center border-l border-slate-200 w-[130px] bg-emerald-50/40 border-b-4 border-b-emerald-400">
                    <div className="flex flex-col items-center gap-1.5">
                      <span className="text-[10px] font-extrabold text-slate-800">MANAGER</span>
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <select
                            value={managerReplacementBranch[day] ?? ""}
                            onChange={e =>
                              setManagerReplacementBranch(p => ({ ...p, [day]: e.target.value }))
                            }
                            className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5 font-bold appearance-none text-center cursor-pointer hover:bg-emerald-100 transition-colors outline-none"
                          >
                            <option value="">Own Branch</option>
                            {ALL_BRANCHES.filter(b => b !== branch).map(b => (
                              <option key={b} value={b}>{b}</option>
                            ))}
                          </select>
                          {managerReplacementBranch[day] && (
                            <button
                              onClick={() => setManagerReplacementBranch(p => ({ ...p, [day]: "" }))}
                              className="text-[10px] text-red-500 font-black hover:text-red-700 transition-colors"
                              title="Clear replacement branch"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ) : null}
                      {isEditing && (
                        <button
                          onClick={() => clearColumnForDay("MANAGER")}
                          className="text-[9px] text-red-500 font-extrabold uppercase tracking-wider hover:underline cursor-pointer"
                          title="Clear this column for the whole day"
                        >
                          Clear
                        </button>
                      )}
                      {!isEditing && (
                        <span className="text-[9px] bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full px-2 py-0.5 font-bold">
                          {managerReplacementBranch[day] || "Own Branch"}
                        </span>
                      )}
                    </div>
                  </th>
                  {COLUMNS.map(col => {
                    const isExec = col.type === "exec";
                    const isTraining = col.type === "training";
                    const isStar = col.type === "star";

                    let colBg = "bg-blue-50/40 border-b-blue-400";
                    let labelColor = "text-blue-800";
                    let badgeClass = "bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100";
                    let textBadge = "text-blue-600 bg-blue-50 border-blue-100";

                    if (isExec) {
                      colBg = "bg-purple-50/40 border-b-purple-400";
                      labelColor = "text-purple-800";
                      badgeClass = "bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100";
                      textBadge = "text-purple-600 bg-purple-50 border-purple-100";
                    } else if (isTraining) {
                      colBg = "bg-amber-50/40 border-b-amber-400";
                      labelColor = "text-amber-800";
                      badgeClass = "bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100";
                      textBadge = "text-amber-600 bg-amber-50 border-amber-100";
                    } else if (isStar) {
                      colBg = "bg-rose-50/40 border-b-rose-400";
                      labelColor = "text-rose-800";
                      badgeClass = "bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100";
                      textBadge = "text-rose-600 bg-rose-50 border-rose-100";
                    }

                    return (
                      <th
                        key={col.id}
                        className={`p-3 text-center border-l border-slate-200 w-[115px] border-b-4 ${colBg}`}
                      >
                        <div className="flex flex-col items-center gap-1.5">
                          <span className={`text-[10px] font-extrabold ${labelColor}`}>{col.label}</span>
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <select
                                value={columnReplacementBranch[`${day}-${col.id}`] ?? ""}
                                onChange={e =>
                                  setColumnReplacementBranch(p => ({
                                    ...p,
                                    [`${day}-${col.id}`]: e.target.value,
                                  }))
                                }
                                className={`text-[9px] border rounded-full px-2 py-0.5 font-bold appearance-none text-center cursor-pointer transition-colors outline-none ${badgeClass}`}
                              >
                                <option value="">Own Branch</option>
                                {ALL_BRANCHES.filter(b => b !== branch).map(b => (
                                  <option key={b} value={b}>{b}</option>
                                ))}
                              </select>
                              {columnReplacementBranch[`${day}-${col.id}`] && (
                                <button
                                  onClick={() =>
                                    setColumnReplacementBranch(p => {
                                      const next = { ...p };
                                      delete next[`${day}-${col.id}`];
                                      return next;
                                    })
                                  }
                                  className="text-[10px] text-red-500 font-black hover:text-red-700 transition-colors"
                                  title="Clear replacement branch"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className={`text-[9px] border rounded-full px-2 py-0.5 font-bold ${textBadge}`}>
                              {columnReplacementBranch[`${day}-${col.id}`] || "Own Branch"}
                            </span>
                          )}
                          {isEditing && (
                            <button
                              onClick={() => clearColumnForDay(col.id)}
                              className="text-[9px] text-red-500 font-extrabold uppercase tracking-wider hover:underline cursor-pointer"
                              title="Clear this column for the whole day"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      </th>
                    );
                  })}
                  <th className="p-3 text-center border-l border-slate-200 w-[180px] bg-slate-50 text-slate-600 font-semibold">
                    Notes/Remarks
                  </th>
                </tr>
              </thead>
              <tbody>
                {daySlots.map((slotObj: { label: string; type: "opening" | "coach" | "closing"; sequence_no: number }, slotIdx: number) => {
                  const slotLabel = slotObj.label;
                  const isOpenClose = slotObj.type === "opening" || slotObj.type === "closing";
                  const showManager = slotObj.type === "coach";
                  const managerKey = `${day}-${slotLabel}-MANAGER`;
                  const managerVal = selections[managerKey] ?? "";

                  return (
                    <tr
                      key={slotLabel}
                      className={`border-b transition-colors group ${
                        isOpenClose ? "bg-indigo-50/30" : "hover:bg-slate-50/50"
                      }`}
                    >
                      <td
                        className={`p-3 font-bold border-r border-slate-200 text-xs sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] transition-colors text-slate-900 w-[160px] min-w-[160px] whitespace-nowrap ${
                          isOpenClose
                            ? "bg-indigo-100/50 group-hover:bg-indigo-100/50"
                            : "bg-slate-50 group-hover:bg-slate-100"
                        }`}
                      >
                        <div className="flex flex-col">
                          <span className="font-bold text-[11px] text-slate-800 whitespace-nowrap">{slotLabel}</span>
                          {!isOpenClose && (
                            <span className="text-[9px] font-medium text-slate-400 mt-0.5 whitespace-nowrap">{getDurationLabel(slotLabel)}</span>
                          )}
                        </div>
                      </td>

                      {!isOpenClose && (
                        <td className="p-1.5 border-l border-slate-200 align-middle bg-emerald-50/10 w-[130px]">
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
                                onChange={e => setCell(day, slotLabel, "MANAGER", e.target.value)}
                                className={`w-full py-1.5 px-3 rounded-xl font-bold text-[11px] appearance-none transition-all outline-none text-center ${
                                  managerVal
                                    ? checkIfLeavingSoon(managerVal)
                                      ? "bg-red-50 text-red-700 border border-red-200"
                                      : getSoftStaffColor(managerVal)
                                    : "bg-emerald-50/40 text-emerald-600 border border-emerald-200/60 hover:bg-emerald-50/80"
                                }`}
                                style={{
                                  backgroundImage: `url("${SELECT_ARROW_DARK}")`,
                                  backgroundPosition: "right 0.35rem center",
                                  backgroundSize: "6px",
                                  backgroundRepeat: "no-repeat",
                                }}
                              >
                                <option value="" style={{ color: "black" }}>Select staff</option>
                                {mgrList.map(staffObj => {
                                  const name = staffObj.name;
                                  const usedAsStaff = COLUMNS.some(
                                    c =>
                                      selections[`${day}-${slotLabel}-${c.id}`] === name,
                                  );
                                  const isLeavingSoon = checkIfLeavingSoon(name);
                                  return (
                                    <option
                                      key={staffObj.id}
                                      value={name}
                                      disabled={usedAsStaff && managerVal !== name}
                                      style={{ color: isLeavingSoon ? "red" : "black" }}
                                    >
                                      {name}
                                      {isLeavingSoon ? " (Leaving soon)" : ""}
                                      {usedAsStaff && managerVal !== name
                                        ? " (assigned as staff)"
                                        : ""}
                                    </option>
                                  );
                                })}
                              </select>
                            );
                          })() : (
                            <div className="w-full h-[28px] rounded-xl bg-emerald-50/30 border border-dashed border-emerald-100 flex items-center justify-center">
                              <span className="text-[9px] text-emerald-300 font-bold uppercase tracking-wider">—</span>
                            </div>
                          )}
                        </td>
                      )}

                      {isOpenClose ? (
                        <td colSpan={COLUMNS.length + 2} className="p-3 border-l border-slate-200 text-center">
                          <span className="inline-flex items-center gap-2 bg-indigo-600 text-white text-[10px] uppercase tracking-wider font-extrabold px-4 py-1.5 rounded-xl shadow-xs">
                            All Staff — Executive ({slotObj.type === "opening" ? "Opening" : "Closing"})
                          </span>
                        </td>
                      ) : (
                        <>
                          {COLUMNS.map(col => {
                            const val = selections[`${day}-${slotLabel}-${col.id}`] ?? "";
                            const isExec = col.type === "exec";
                            const isTraining = col.type === "training";
                            const isStar = col.type === "star";

                            let colBg = "bg-blue-50/10";
                            if (isExec) colBg = "bg-purple-50/10";
                            else if (isTraining) colBg = "bg-amber-50/10";
                            else if (isStar) colBg = "bg-rose-50/10";

                            const selectTheme = val
                              ? checkIfLeavingSoon(val)
                                ? "bg-red-50 text-red-700 border border-red-200"
                                : getSoftStaffColor(val)
                              : isExec
                                ? "bg-purple-50/40 text-purple-600 border border-purple-200/60 hover:bg-purple-50/80"
                                : isTraining
                                  ? "bg-amber-50/40 text-amber-600 border border-amber-200/60 hover:bg-amber-50/80"
                                  : isStar
                                    ? "bg-rose-50/40 text-rose-600 border border-rose-200/60 hover:bg-rose-50/80"
                                    : "bg-blue-50/40 text-blue-600 border border-blue-200/60 hover:bg-blue-50/80";

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
                                .map(c => selections[`${day}-${slotLabel}-${c.id}`])
                                .filter((n): n is string => !!n),
                              ...(managerVal ? [managerVal] : []),
                            ]);
                            return (
                              <td
                                key={col.id}
                                className={`p-1.5 border-l border-slate-200 align-middle ${colBg}`}
                              >
                                <select
                                  disabled={!isEditing}
                                  value={val}
                                  onChange={e => setCell(day, slotLabel, col.id, e.target.value)}
                                  className={`w-full py-1.5 px-3 rounded-xl font-bold text-[11px] appearance-none transition-all outline-none text-center ${selectTheme}`}
                                  style={{
                                    backgroundImage: `url("${SELECT_ARROW_DARK}")`,
                                    backgroundPosition: "right 0.35rem center",
                                    backgroundSize: "6px",
                                    backgroundRepeat: "no-repeat",
                                  }}
                                >
                                  <option value="" style={{ color: "black" }}>None</option>
                                  {colStaff.map(staffObj => {
                                    const name = staffObj.name;
                                    const isLeavingSoon = checkIfLeavingSoon(name);
                                    return (
                                      <option
                                        key={staffObj.id}
                                        value={name}
                                        disabled={namesUsedInSlot.has(name) && val !== name}
                                        style={{ color: isLeavingSoon ? "red" : "black" }}
                                      >
                                        {name}
                                        {isLeavingSoon ? " (Leaving soon)" : ""}
                                        {namesUsedInSlot.has(name) && val !== name ? " (assigned)" : ""}
                                      </option>
                                    );
                                  })}
                                </select>
                              </td>
                            );
                          })}
                          <td className="p-1.5 border-l border-slate-200 w-[180px] bg-white">
                            <textarea
                              disabled={!isEditing}
                              value={notes[`${day}-${slotLabel}-notes`] ?? ""}
                              onChange={e =>
                                setNotes(p => ({
                                  ...p,
                                  [`${day}-${slotLabel}-notes`]: e.target.value,
                                }))
                              }
                              placeholder="Add remarks..."
                              className="w-full p-1 text-[11px] border border-slate-200 rounded-xl bg-white resize-none h-[28px] overflow-y-auto outline-none focus:border-blue-500 transition-all font-medium italic text-slate-600 block"
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
          )}
          </>
          )}
        </div>

        <SummaryTable title="Weekly Hours Summary" data={summaryData} />

        {!isReadOnly && (
          <div className="mt-16 text-center pb-10">
            {errorMsg && (
              <p className="text-sm font-bold text-red-600 mb-4">{errorMsg}</p>
            )}
            <button
              onClick={scheduleType === "actual" ? handleArchiveWeek : handleSaveWeeklyPlan}
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
                (scheduleType === "actual" ? "Final Submit & Archive" : "Save Weekly Plan")}
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
