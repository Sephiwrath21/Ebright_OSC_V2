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
    <div className="mt-12 bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md overflow-hidden text-slate-800 dark:text-slate-200">
      <header className="border-b border-slate-200 dark:border-slate-800 pb-4 mb-4 text-center">
        <h2 className="m-0 text-lg font-bold text-slate-800 dark:text-slate-200">
          {title}
        </h2>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="w-[60px] border border-slate-300 dark:border-slate-700 bg-slate-800 p-3 text-white font-bold text-center">No.</th>
              <th className="w-[250px] border border-slate-300 dark:border-slate-700 bg-slate-800 p-3 text-white font-bold text-left">Name</th>
              <th className="w-[240px] border border-slate-300 dark:border-slate-700 bg-slate-800 p-3 text-white font-bold text-center">Class (Coach)</th>
              <th className="w-[240px] border border-slate-300 dark:border-slate-700 bg-slate-800 p-3 text-white font-bold text-center">Executive</th>
              <th className="w-[240px] border border-slate-300 dark:border-slate-700 bg-slate-800 p-3 text-white font-bold text-center">Total (hrs:min)</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => {
              const c = fmt(row.coachHrs);
              const e = fmt(row.execHrs);
              const t = fmt(row.total);
              return (
                <tr key={row.name} className="even:bg-slate-50 hover:bg-slate-100 transition-colors dark:even:bg-slate-800/60 dark:hover:bg-slate-700">
                  <td className="border border-slate-300 dark:border-slate-700 px-3 py-3 text-center font-bold text-slate-500 dark:text-slate-400">{i + 1}</td>
                  <td className="border border-slate-300 dark:border-slate-700 px-3 py-3 font-black text-slate-800 dark:text-slate-200">{row.name}</td>
                  {[c, e, t].map((time, j) => (
                    <td key={j} className={`border border-slate-300 dark:border-slate-700 px-2 py-3 ${j === 2 ? "bg-blue-50/50 dark:bg-blue-900/40" : ""}`}>
                      <div className="flex flex-row gap-4 items-center justify-center">
                        <div className="flex items-baseline gap-1 bg-white border border-slate-200 px-2 py-1 rounded dark:bg-slate-950 dark:border-slate-700">
                          <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{time.h}</span>
                          <span className="text-[9px] uppercase font-black text-slate-400">hrs</span>
                        </div>
                        <div className="flex items-baseline gap-1 bg-white border border-slate-200 px-2 py-1 rounded dark:bg-slate-950 dark:border-slate-700">
                          <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{time.m}</span>
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

// ─── Day Schedule Table ───────────────────────────────────────────────────────

interface SlotObj {
  label: string;
  type: "opening" | "coach" | "closing";
  sequence_no: number;
}

interface ColDef {
  id: string;
  label: string;
  type: "coach" | "exec" | "training" | "star";
}

interface DayScheduleTableProps {
  day: string;
  daySlots: SlotObj[];
  COLUMNS: ColDef[];
  branch: string;
  tableSelections: Record<string, string>;
  tableNotes: Record<string, string>;
  editable: boolean;
  /** Show branch-replacement dropdowns and CLEAR column buttons in the header */
  showColumnControls: boolean;
  managerReplacementBranch: Record<string, string>;
  columnReplacementBranch: Record<string, string>;
  setManagerReplacementBranch?: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
  setColumnReplacementBranch?: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
  staffByBranch: Record<string, StaffPayload[]>;
  managersByBranch: Record<string, StaffPayload[]>;
  checkIfLeavingSoon: (name: string) => boolean;
  onCellSet?: (day: string, slot: string, colId: string, value: string) => void;
  onNoteChange?: (key: string, value: string) => void;
  onClearColumn?: (colId: string) => void;
  coachCount: number;
  execCount: number;
}

function DayScheduleTable({
  day,
  daySlots,
  COLUMNS,
  branch,
  tableSelections,
  tableNotes,
  editable,
  showColumnControls,
  managerReplacementBranch,
  columnReplacementBranch,
  setManagerReplacementBranch,
  setColumnReplacementBranch,
  staffByBranch,
  managersByBranch,
  checkIfLeavingSoon,
  onCellSet,
  onNoteChange,
  onClearColumn,
  coachCount,
  execCount,
}: DayScheduleTableProps) {
  return (
    <div className="overflow-x-auto relative">
      <table className="w-full border-collapse" style={{ minWidth: `${470 + (coachCount + execCount) * 115}px` }}>
        <thead className="bg-slate-50/50 border-b border-slate-200 text-[10px] uppercase tracking-widest text-slate-700 font-bold dark:bg-slate-800/50 dark:border-slate-700 dark:text-slate-300">
          <tr>
            <th className="p-3 text-left w-[160px] sticky left-0 z-20 bg-slate-50 border-r border-slate-200 text-slate-600 font-semibold shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] whitespace-nowrap dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300">
              Time Slot
            </th>
            {/* Manager column header */}
            <th className="p-3 text-center border-l border-slate-200 w-[130px] bg-emerald-50/40 border-b-4 border-b-emerald-400 dark:bg-emerald-900/40 dark:border-slate-700">
              <div className="flex flex-col items-center gap-1.5">
                <span className="text-[10px] font-extrabold text-slate-800 dark:text-slate-200">MANAGER</span>
                {showColumnControls && editable ? (
                  <div className="flex items-center gap-1">
                    <select
                      value={managerReplacementBranch[day] ?? ""}
                      onChange={e =>
                        setManagerReplacementBranch?.(p => ({ ...p, [day]: e.target.value }))
                      }
                      className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5 font-bold appearance-none text-center cursor-pointer hover:bg-emerald-100 transition-colors outline-none dark:bg-emerald-900 dark:text-emerald-300 dark:border-emerald-700 dark:hover:bg-emerald-800"
                    >
                      <option value="">Own Branch</option>
                      {ALL_BRANCHES.filter(b => b !== branch).map(b => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                    {managerReplacementBranch[day] && (
                      <button
                        onClick={() => setManagerReplacementBranch?.(p => ({ ...p, [day]: "" }))}
                        className="text-[10px] text-red-500 font-black hover:text-red-700 transition-colors dark:text-red-400 dark:hover:text-red-300"
                        title="Clear replacement branch"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ) : null}
                {showColumnControls && editable && (
                  <button
                    onClick={() => onClearColumn?.("MANAGER")}
                    className="text-[9px] text-red-500 font-extrabold uppercase tracking-wider hover:underline cursor-pointer dark:text-red-400"
                    title="Clear this column for the whole day"
                  >
                    Clear
                  </button>
                )}
                {(!editable || !showColumnControls) && (
                  <span className="text-[9px] bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full px-2 py-0.5 font-bold dark:bg-emerald-900 dark:text-emerald-300 dark:border-emerald-700">
                    {managerReplacementBranch[day] || "Own Branch"}
                  </span>
                )}
              </div>
            </th>
            {/* Coach / Exec / Training / Star column headers */}
            {COLUMNS.map(col => {
              const isExec = col.type === "exec";
              const isTraining = col.type === "training";
              const isStar = col.type === "star";

              let colBg = "bg-blue-50/40 border-b-blue-400 dark:bg-blue-900/40";
              let labelColor = "text-blue-800 dark:text-blue-200";
              let badgeClass = "bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 dark:bg-blue-900 dark:text-blue-300 dark:border-blue-700 dark:hover:bg-blue-800";
              let textBadge = "text-blue-600 bg-blue-50 border-blue-100 dark:text-blue-300 dark:bg-blue-900 dark:border-blue-700";

              if (isExec) {
                colBg = "bg-purple-50/40 border-b-purple-400 dark:bg-purple-900/40";
                labelColor = "text-purple-800 dark:text-purple-200";
                badgeClass = "bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 dark:bg-purple-900 dark:text-purple-300 dark:border-purple-700 dark:hover:bg-purple-800";
                textBadge = "text-purple-600 bg-purple-50 border-purple-100 dark:text-purple-300 dark:bg-purple-900 dark:border-purple-700";
              } else if (isTraining) {
                colBg = "bg-amber-50/40 border-b-amber-400 dark:bg-amber-900/40";
                labelColor = "text-amber-800 dark:text-amber-200";
                badgeClass = "bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 dark:bg-amber-900 dark:text-amber-300 dark:border-amber-700 dark:hover:bg-amber-800";
                textBadge = "text-amber-600 bg-amber-50 border-amber-100 dark:text-amber-300 dark:bg-amber-900 dark:border-amber-700";
              } else if (isStar) {
                colBg = "bg-rose-50/40 border-b-rose-400 dark:bg-rose-900/40";
                labelColor = "text-rose-800 dark:text-rose-200";
                badgeClass = "bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 dark:bg-rose-900 dark:text-rose-300 dark:border-rose-700 dark:hover:bg-rose-800";
                textBadge = "text-rose-600 bg-rose-50 border-rose-100 dark:text-rose-300 dark:bg-rose-900 dark:border-rose-700";
              }

              return (
                <th
                  key={col.id}
                  className={`p-3 text-center border-l border-slate-200 dark:border-slate-700 w-[115px] border-b-4 ${colBg}`}
                >
                  <div className="flex flex-col items-center gap-1.5">
                    <span className={`text-[10px] font-extrabold ${labelColor}`}>{col.label}</span>
                    {showColumnControls && editable ? (
                      <div className="flex items-center gap-1">
                        <select
                          value={columnReplacementBranch[`${day}-${col.id}`] ?? ""}
                          onChange={e =>
                            setColumnReplacementBranch?.(p => ({
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
                              setColumnReplacementBranch?.(p => {
                                const next = { ...p };
                                delete next[`${day}-${col.id}`];
                                return next;
                              })
                            }
                            className="text-[10px] text-red-500 font-black hover:text-red-700 transition-colors dark:text-red-400 dark:hover:text-red-300"
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
                    {showColumnControls && editable && (
                      <button
                        onClick={() => onClearColumn?.(col.id)}
                        className="text-[9px] text-red-500 font-extrabold uppercase tracking-wider hover:underline cursor-pointer dark:text-red-400"
                        title="Clear this column for the whole day"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </th>
              );
            })}
            <th className="p-3 text-center border-l border-slate-200 w-[180px] bg-slate-50 text-slate-600 font-semibold dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              Notes/Remarks
            </th>
          </tr>
        </thead>
        <tbody>
          {daySlots.map((slotObj: SlotObj) => {
            const slotLabel = slotObj.label;
            const isOpenClose = slotObj.type === "opening" || slotObj.type === "closing";
            const showManager = slotObj.type === "coach";
            const managerKey = `${day}-${slotLabel}-MANAGER`;
            const managerVal = tableSelections[managerKey] ?? "";

            return (
              <tr
                key={slotLabel}
                className={`border-b transition-colors group ${
                  isOpenClose ? "bg-indigo-50/30 dark:bg-indigo-900/30" : "hover:bg-slate-50/50 dark:hover:bg-slate-800/50"
                }`}
              >
                <td
                  className={`p-3 font-bold border-r border-slate-200 text-xs sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] transition-colors text-slate-900 w-[160px] min-w-[160px] whitespace-nowrap dark:border-slate-700 dark:text-slate-100 ${
                    isOpenClose
                      ? "bg-indigo-100/50 group-hover:bg-indigo-100/50 dark:bg-indigo-900/50 dark:group-hover:bg-indigo-900/50"
                      : "bg-slate-50 group-hover:bg-slate-100 dark:bg-slate-900 dark:group-hover:bg-slate-800"
                  }`}
                >
                  <div className="flex flex-col">
                    <span className="font-bold text-[11px] text-slate-800 whitespace-nowrap dark:text-slate-200">{slotLabel}</span>
                    {!isOpenClose && (
                      <span className="text-[9px] font-medium text-slate-400 mt-0.5 whitespace-nowrap">{getDurationLabel(slotLabel)}</span>
                    )}
                  </div>
                </td>

                {!isOpenClose && (
                  <td className="p-1.5 border-l border-slate-200 align-middle bg-emerald-50/10 w-[130px] dark:border-slate-700 dark:bg-emerald-900/10">
                    {showManager ? (() => {
                      // Manager cell uses BMs from the replacement branch
                      // when one is set on this day, otherwise own branch.
                      const mgrReplBranch = managerReplacementBranch[day] ?? "";
                      const mgrSourceBranch = mgrReplBranch || branch;
                      const mgrList = managersByBranch[mgrSourceBranch] ?? [];
                      return (
                        <select
                          disabled={!editable}
                          value={managerVal}
                          onChange={e => onCellSet?.(day, slotLabel, "MANAGER", e.target.value)}
                          className={`w-full py-1.5 px-3 rounded-xl font-bold text-[11px] appearance-none transition-all outline-none text-center ${
                            managerVal
                              ? checkIfLeavingSoon(managerVal)
                                ? "bg-red-50 text-red-700 border border-red-200 dark:bg-red-900 dark:text-red-300 dark:border-red-700"
                                : getSoftStaffColor(managerVal)
                              : "bg-emerald-50/40 text-emerald-600 border border-emerald-200/60 hover:bg-emerald-50/80 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700/60 dark:hover:bg-emerald-900/60"
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
                              c => tableSelections[`${day}-${slotLabel}-${c.id}`] === name,
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
                      <div className="w-full h-[28px] rounded-xl bg-emerald-50/30 border border-dashed border-emerald-100 flex items-center justify-center dark:bg-emerald-900/30 dark:border-emerald-800">
                        <span className="text-[9px] text-emerald-300 font-bold uppercase tracking-wider dark:text-emerald-700">—</span>
                      </div>
                    )}
                  </td>
                )}

                {isOpenClose ? (
                  <td colSpan={COLUMNS.length + 2} className="p-3 border-l border-slate-200 text-center dark:border-slate-700">
                    <span className="inline-flex items-center gap-2 bg-indigo-600 text-white text-[10px] uppercase tracking-wider font-extrabold px-4 py-1.5 rounded-xl shadow-xs">
                      All Staff — Executive ({slotObj.type === "opening" ? "Opening" : "Closing"})
                    </span>
                  </td>
                ) : (
                  <>
                    {COLUMNS.map(col => {
                      const val = tableSelections[`${day}-${slotLabel}-${col.id}`] ?? "";
                      const isExec = col.type === "exec";
                      const isTraining = col.type === "training";
                      const isStar = col.type === "star";

                      let colBg = "bg-blue-50/10 dark:bg-blue-900/10";
                      if (isExec) colBg = "bg-purple-50/10 dark:bg-purple-900/10";
                      else if (isTraining) colBg = "bg-amber-50/10 dark:bg-amber-900/10";
                      else if (isStar) colBg = "bg-rose-50/10 dark:bg-rose-900/10";

                      const selectTheme = val
                        ? checkIfLeavingSoon(val)
                          ? "bg-red-50 text-red-700 border border-red-200 dark:bg-red-900 dark:text-red-300 dark:border-red-700"
                          : getSoftStaffColor(val)
                        : isExec
                          ? "bg-purple-50/40 text-purple-600 border border-purple-200/60 hover:bg-purple-50/80 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-700/60 dark:hover:bg-purple-900/60"
                          : isTraining
                            ? "bg-amber-50/40 text-amber-600 border border-amber-200/60 hover:bg-amber-50/80 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700/60 dark:hover:bg-amber-900/60"
                            : isStar
                              ? "bg-rose-50/40 text-rose-600 border border-rose-200/60 hover:bg-rose-50/80 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-700/60 dark:hover:bg-rose-900/60"
                              : "bg-blue-50/40 text-blue-600 border border-blue-200/60 hover:bg-blue-50/80 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700/60 dark:hover:bg-blue-900/60";

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
                          .map(c => tableSelections[`${day}-${slotLabel}-${c.id}`])
                          .filter((n): n is string => !!n),
                        ...(managerVal ? [managerVal] : []),
                      ]);
                      return (
                        <td
                          key={col.id}
                          className={`p-1.5 border-l border-slate-200 dark:border-slate-700 align-middle ${colBg}`}
                        >
                          <select
                            disabled={!editable}
                            value={val}
                            onChange={e => onCellSet?.(day, slotLabel, col.id, e.target.value)}
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
                    <td className="p-1.5 border-l border-slate-200 w-[180px] bg-white dark:border-slate-700 dark:bg-slate-800">
                      <textarea
                        disabled={!editable}
                        value={tableNotes[`${day}-${slotLabel}-notes`] ?? ""}
                        onChange={e =>
                          onNoteChange?.(`${day}-${slotLabel}-notes`, e.target.value)
                        }
                        placeholder="Add remarks..."
                        className="w-full p-1 text-[11px] border border-slate-200 rounded-xl bg-white resize-none h-[28px] overflow-y-auto outline-none focus:border-blue-500 transition-all font-medium italic text-slate-600 block dark:border-slate-500 dark:bg-slate-950 dark:text-slate-300"
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

  // Actual schedule data (editable in update mode, main data in create mode)
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  // Planning schedule data (read-only top table, only populated in update mode)
  const [planningSelections, setPlanningSelections] = useState<Record<string, string>>({});
  const [planningNotes, setPlanningNotes] = useState<Record<string, string>>({});

  const [columnReplacementBranch, setColumnReplacementBranch] = useState<Record<string, string>>({});
  const [managerReplacementBranch, setManagerReplacementBranch] = useState<Record<string, string>>({});
  const [showAddEmployeeModal, setShowAddEmployeeModal] = useState(false);
  const [newEmployeeName, setNewEmployeeName] = useState("");
  const [newEmployeePosition, setNewEmployeePosition] = useState("Part Time");

  const [coachCount, setCoachCount] = useState<number>(3);
  const [execCount, setExecCount] = useState<number>(3);
  const [trainingCount, setTrainingCount] = useState<number>(0);
  const [starCount, setStarCount] = useState<number>(0);

  // Frozen column counts for the Planning (read-only) table.
  // Derived from the planning data itself so it never changes when the user
  // adjusts the Actual column selectors.
  const [planningCoachCount, setPlanningCoachCount] = useState<number>(3);
  const [planningExecCount, setPlanningExecCount] = useState<number>(3);
  const [planningTrainingCount, setPlanningTrainingCount] = useState<number>(0);
  const [planningStarCount, setPlanningStarCount] = useState<number>(0);

  // scheduleType is now derived — no longer a toggle.
  // In update mode the editable table is always "actual".
  // In create/view mode it is always "planning".
  const scheduleType: "planning" | "actual" = mode === "update" ? "actual" : "planning";

  const [periodStatus, setPeriodStatus] = useState<"draft" | "archived">("draft");
  const [changedSinceArchive, setChangedSinceArchive] = useState<boolean>(false);

  // Column list for the Actual (editable) table — reacts to user-adjustable counts.
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

  // Column list for the Planning (read-only) table — frozen from loaded data.
  const PLANNING_COLUMNS = useMemo(() => {
    const list = [];
    for (let i = 1; i <= planningCoachCount; i++) {
      list.push({ id: `coach${i}`, label: `Coach ${i}`, type: "coach" as const });
    }
    for (let i = 1; i <= planningExecCount; i++) {
      list.push({ id: `exec${i}`, label: `Exec ${i}`, type: "exec" as const });
    }
    for (let i = 1; i <= planningTrainingCount; i++) {
      list.push({ id: `training${i}`, label: `Training ${i}`, type: "training" as const });
    }
    for (let i = 1; i <= planningStarCount; i++) {
      list.push({ id: `star${i}`, label: `Star Coach ${i}`, type: "star" as const });
    }
    return list;
  }, [planningCoachCount, planningExecCount, planningTrainingCount, planningStarCount]);

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

  // Fetch staff (for dropdowns) + existing schedule(s)
  // In update mode: fetch both planning (top, read-only) and actual (bottom, editable)
  // In view mode: fetch only planning (single read-only table)
  // In create mode: no existing schedule fetch
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const staffResPromise = fetch(`/api/branch-staff`);
        const settingsResPromise = fetch(`/api/schedules/settings?branchName=${encodeURIComponent(branch)}`);
        const positionsResPromise = fetch(`/api/schedules/positions?branch=${encodeURIComponent(branch)}&weekStartDate=${startStr}`);

        // Planning schedule: needed in update mode (top table) and view mode (only table)
        const planningSchedPromise = (mode === "update" || mode === "view")
          ? fetch(`/api/schedules?branch=${encodeURIComponent(branch)}&startDate=${startStr}&endDate=${endStr}&scheduleType=planning`)
          : Promise.resolve(null);

        // Actual schedule: only needed in update mode (bottom editable table)
        const actualSchedPromise = mode === "update"
          ? fetch(`/api/schedules?branch=${encodeURIComponent(branch)}&startDate=${startStr}&endDate=${endStr}&scheduleType=actual`)
          : Promise.resolve(null);

        const [staffRes, settingsRes, positionsRes, planningSchedRes, actualSchedRes] = await Promise.all([
          staffResPromise,
          settingsResPromise,
          positionsResPromise,
          planningSchedPromise,
          actualSchedPromise,
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

        // Planning schedule data
        if (planningSchedRes && planningSchedRes.ok) {
          const data = await planningSchedRes.json();
          if (cancelled) return;
          if (data.success && data.schedule) {
            const match = data.schedule;
            const sels = (match.selections ?? {}) as Record<string, string>;
            if (mode === "update") {
              // In update mode: planning goes into the read-only top table.
              // Derive column counts by scanning the selection keys for the
              // highest coach/exec/training/star index present.
              setPlanningSelections(sels);
              setPlanningNotes((match.notes ?? {}) as Record<string, string>);

              let maxCoach = 1, maxExec = 1, maxTraining = 0, maxStar = 0;
              Object.keys(sels).forEach(key => {
                const coachMatch = key.match(/-(coach)(\d+)$/);
                if (coachMatch) maxCoach = Math.max(maxCoach, parseInt(coachMatch[2], 10));
                const execMatch = key.match(/-(exec)(\d+)$/);
                if (execMatch) maxExec = Math.max(maxExec, parseInt(execMatch[2], 10));
                const trainMatch = key.match(/-(training)(\d+)$/);
                if (trainMatch) maxTraining = Math.max(maxTraining, parseInt(trainMatch[2], 10));
                const starMatch = key.match(/-(star)(\d+)$/);
                if (starMatch) maxStar = Math.max(maxStar, parseInt(starMatch[2], 10));
              });
              setPlanningCoachCount(maxCoach);
              setPlanningExecCount(maxExec);
              setPlanningTrainingCount(maxTraining);
              setPlanningStarCount(maxStar);
            } else {
              // In view mode: planning is the single read-only table
              setSelections(sels);
              setNotes((match.notes ?? {}) as Record<string, string>);
            }
          } else {
            if (mode === "update") {
              setPlanningSelections({});
              setPlanningNotes({});
            } else {
              setSelections({});
              setNotes({});
            }
          }
        }

        // Actual schedule data (update mode bottom table)
        if (actualSchedRes && actualSchedRes.ok) {
          const data = await actualSchedRes.json();
          if (cancelled) return;
          if (data.success && data.schedule) {
            const match = data.schedule;
            const sels = (match.selections ?? {}) as Record<string, string>;
            setSelections(sels);
            setNotes((match.notes ?? {}) as Record<string, string>);
            setPeriodStatus(match.periodStatus ?? "draft");
            setChangedSinceArchive(!!match.changedSinceArchive);
          } else {
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
  }, [branch, startStr, endStr, mode]);

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

  // Compute weekly hours summary from current actual selections
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
  function setCell(dayArg: string, slot: string, colId: string, value: string) {
    setSelections(prev => {
      const next = { ...prev };
      if (!value) {
        delete next[`${dayArg}-${slot}-${colId}`];
        return next;
      }

      const slotsForDay = formatDbSlotsForDay(dbOperatingDays, dayArg, dayMapShort);
      slotsForDay.forEach(({ label: s, type }) => {
        if (type === "opening" || type === "closing") return;

        if (colId === "MANAGER") {
          // Don't put someone in Manager if they're already a coach/exec for this slot
          const usedAsStaff = COLUMNS.some(
            c => next[`${dayArg}-${s}-${c.id}`] === value,
          );
          if (usedAsStaff) return;
        } else {
          // Don't put someone in this column if they're already the manager for this slot
          if (next[`${dayArg}-${s}-MANAGER`] === value) return;
          // Or already in another coach/exec column for this slot
          const usedInOtherColumn = COLUMNS.filter(c => c.id !== colId).some(
            c => next[`${dayArg}-${s}-${c.id}`] === value,
          );
          if (usedInOtherColumn) return;
        }

        next[`${dayArg}-${s}-${colId}`] = value;
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

  // ─── Shared table props helpers ─────────────────────────────────────────────

  // Props for the Actual (editable) table — uses user-adjustable COLUMNS.
  const sharedTableProps = {
    day,
    daySlots,
    COLUMNS,
    branch,
    managerReplacementBranch,
    columnReplacementBranch,
    staffByBranch,
    managersByBranch,
    checkIfLeavingSoon,
    coachCount,
    execCount,
  };

  // Props for the Planning (read-only) table — uses frozen PLANNING_COLUMNS.
  const planningTableProps = {
    day,
    daySlots,
    COLUMNS: PLANNING_COLUMNS,
    branch,
    managerReplacementBranch,
    columnReplacementBranch,
    staffByBranch,
    managersByBranch,
    checkIfLeavingSoon,
    coachCount: planningCoachCount,
    execCount: planningExecCount,
  };

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950">
      <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-20">
        {/* Breadcrumb */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          {/* Breadcrumb */}
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 flex-wrap"
          >
            <Link
              href="/home"
              className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 transition-colors shrink-0"
            >
              <HomeIcon className="w-4 h-4" aria-hidden="true" />
              <span>Home</span>
            </Link>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
            <Link href="/dashboards/hrms" className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors shrink-0">
              HRMS
            </Link>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
            <Link
              href="/manpower-schedule"
              className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors shrink-0"
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
              className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors shrink-0"
            >
              {mode === "update"
                ? "Update Manpower Schedule"
                : mode === "view"
                ? "Archive Overview"
                : "Plan New Week"}
            </Link>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
            <span className="text-slate-900 dark:text-slate-100 font-medium shrink-0">
              {branch}
              {weekRangeLabel && (
                <span className="text-slate-500 dark:text-slate-400 font-normal">
                  {" "}
                  ({weekRangeLabel})
                </span>
              )}
            </span>
          </nav>

          {/* Column count controls: shown inline here only for create/view mode.
               In update mode they live inside the Actual section header. */}
          {!loading && mode !== "update" && (
            <div className="flex items-center gap-3 select-none shrink-0 whitespace-nowrap">
              <div className="flex items-center gap-3 bg-white border border-slate-200/60 rounded-xl px-3 py-1.5 shadow-xs text-[11px] dark:bg-slate-900 dark:border-slate-700">
                <div className="flex items-center gap-1">
                  <span className="font-semibold text-slate-500 dark:text-slate-400">Coach:</span>
                  <select
                    disabled={isReadOnly}
                    value={coachCount}
                    onChange={(e) => handleCountChange("coach", Number(e.target.value))}
                    className="bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-2 py-0.5 font-bold text-slate-700 outline-none transition-colors cursor-pointer dark:bg-slate-950 dark:hover:bg-slate-800 dark:border-slate-500 dark:text-slate-100"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-semibold text-slate-500 dark:text-slate-400">Exec:</span>
                  <select
                    disabled={isReadOnly}
                    value={execCount}
                    onChange={(e) => handleCountChange("exec", Number(e.target.value))}
                    className="bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-2 py-0.5 font-bold text-slate-700 outline-none transition-colors cursor-pointer dark:bg-slate-950 dark:hover:bg-slate-800 dark:border-slate-500 dark:text-slate-100"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-semibold text-slate-500 dark:text-slate-400">Train:</span>
                  <select
                    disabled={isReadOnly}
                    value={trainingCount}
                    onChange={(e) => handleCountChange("training", Number(e.target.value))}
                    className="bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-2 py-0.5 font-bold text-slate-700 outline-none transition-colors cursor-pointer dark:bg-slate-950 dark:hover:bg-slate-800 dark:border-slate-500 dark:text-slate-100"
                  >
                    {[0, 1].map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-semibold text-slate-500 dark:text-slate-400">Star:</span>
                  <select
                    disabled={isReadOnly}
                    value={starCount}
                    onChange={(e) => handleCountChange("star", Number(e.target.value))}
                    className="bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-2 py-0.5 font-bold text-slate-700 outline-none transition-colors cursor-pointer dark:bg-slate-950 dark:hover:bg-slate-800 dark:border-slate-500 dark:text-slate-100"
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

        {/* Archived / changed-since-archive banners (update mode only) */}
        {mode === "update" && (
          <div className="mb-4 flex flex-col gap-2">
            {periodStatus === "archived" && (
              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200/80 rounded-xl px-4 py-3 text-xs font-semibold text-emerald-800 shadow-xs dark:bg-emerald-900 dark:border-emerald-700/80 dark:text-emerald-200">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <span>This week's schedule has been Finalized &amp; Archived. Manpower cost reports have been generated.</span>
                </div>
                <span className="bg-emerald-100/80 text-emerald-800 text-[10px] uppercase px-2.5 py-1 rounded-lg dark:bg-emerald-800/80 dark:text-emerald-200">Archived</span>
              </div>
            )}
            {changedSinceArchive && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200/80 rounded-xl px-4 py-3 text-xs font-semibold text-amber-800 shadow-xs dark:bg-amber-900 dark:border-amber-700/80 dark:text-amber-200">
                <span className="bg-amber-100 text-amber-800 text-[10px] uppercase px-2.5 py-1 rounded-lg shrink-0 dark:bg-amber-800 dark:text-amber-200">Warning</span>
                <span>Schedule modified since last archive. Click "Final Submit &amp; Archive" at the bottom to update cost reports.</span>
              </div>
            )}
          </div>
        )}

        {/* ─── Main content area ──────────────────────────────────────────────── */}
        {loading ? (
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 flex flex-col items-center justify-center gap-2 py-24 px-6 text-center dark:bg-slate-900 dark:border-slate-800">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
              Loading schedule…
            </span>
          </div>
        ) : mode === "update" ? (
          /* ── UPDATE MODE: Planning (top, read-only) + Actual (bottom, editable) ── */
          <div className="flex flex-col">
            {/* Shared day-tab bar — sticky flush strip, no card rounding so it sits tight to the TopBar */}
            <div className="sticky top-0 z-20 -mx-6 bg-white border-b-2 border-slate-200 shadow-sm dark:bg-slate-900 dark:border-slate-800">
              <div className="px-6 py-3 flex justify-between items-center relative gap-4 flex-wrap md:flex-nowrap">
                {/* Day tabs */}
                <div className="flex gap-1 bg-slate-100/80 p-1 rounded-xl select-none z-10 dark:bg-slate-800/80">
                  {workingDays.map(d => {
                    const active = selectedDay === d;
                    return (
                      <button
                        key={d}
                        onClick={() => setSelectedDay(d)}
                        className={`px-3.5 py-1.5 rounded-lg font-bold text-xs transition-all ${
                          active
                            ? "bg-white text-indigo-600 shadow-xs dark:bg-slate-900 dark:text-indigo-400"
                            : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                        }`}
                      >
                        {d.slice(0, 3).toUpperCase()}
                      </button>
                    );
                  })}
                </div>

                {/* Day title centered */}
                <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none hidden md:flex">
                  <h2 className="text-sm font-extrabold text-slate-800 m-0 leading-none tracking-tight dark:text-slate-200">
                    {day}
                  </h2>
                  <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider mt-0.5">
                    {dateForDay(startStr, day)}
                  </span>
                </div>

                {/* Right spacer */}
                <div className="ml-auto" />
              </div>
            </div>

            {/* ── Planning Table (read-only top) — greyed out to signal non-editable ── */}
            <div className="mt-5 rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-800">
              {/* Planning section header — intentionally a fixed dark bar in both themes */}
              <div className="bg-slate-600 px-5 py-3 flex items-center gap-3">
                <span className="text-slate-300 font-black uppercase tracking-widest text-xs">Planning</span>
                <span className="text-[10px] font-bold text-slate-400 bg-slate-700 border border-slate-500 px-2.5 py-0.5 rounded-full">
                  Read-only
                </span>
              </div>

              {/* Grey wash over the table body to reinforce read-only state */}
              <div
                className="bg-slate-100 dark:bg-slate-800 select-none pointer-events-none"
                style={{ filter: "grayscale(0.55) opacity(0.72)" }}
              >
                {daySlots.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-12 px-6 text-center">
                    <span className="text-sm font-bold text-slate-500 dark:text-slate-400">
                      {workingDays.length === 0
                        ? `No operating days set up for ${branch} yet`
                        : `No schedule set up for ${branch} on ${day}`}
                    </span>
                  </div>
                ) : (
                  <DayScheduleTable
                    {...planningTableProps}
                    tableSelections={planningSelections}
                    tableNotes={planningNotes}
                    editable={false}
                    showColumnControls={false}
                  />
                )}
              </div>
            </div>

            {/* ── Actual Table (editable bottom) ── */}
            <div className="mt-5 bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:bg-slate-900 dark:border-slate-800">
              {/* Actual section header — contains column-count controls + action buttons */}
              <div className="bg-[#2D3F50] px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
                <span className="text-white font-black uppercase tracking-widest text-xs shrink-0">Actual</span>

                {/* Right side: column filters + action buttons */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Column count selectors */}
                  <div className="flex items-center gap-2 bg-[#1e2e3d] rounded-xl px-3 py-1.5 text-[11px] select-none">
                    <div className="flex items-center gap-1">
                      <span className="font-semibold text-slate-400">Coach:</span>
                      <select
                        value={coachCount}
                        onChange={(e) => handleCountChange("coach", Number(e.target.value))}
                        className="bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg px-2 py-0.5 font-bold text-slate-200 outline-none transition-colors cursor-pointer"
                      >
                        {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="font-semibold text-slate-400">Exec:</span>
                      <select
                        value={execCount}
                        onChange={(e) => handleCountChange("exec", Number(e.target.value))}
                        className="bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg px-2 py-0.5 font-bold text-slate-200 outline-none transition-colors cursor-pointer"
                      >
                        {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="font-semibold text-slate-400">Train:</span>
                      <select
                        value={trainingCount}
                        onChange={(e) => handleCountChange("training", Number(e.target.value))}
                        className="bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg px-2 py-0.5 font-bold text-slate-200 outline-none transition-colors cursor-pointer"
                      >
                        {[0, 1].map(n => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="font-semibold text-slate-400">Star:</span>
                      <select
                        value={starCount}
                        onChange={(e) => handleCountChange("star", Number(e.target.value))}
                        className="bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg px-2 py-0.5 font-bold text-slate-200 outline-none transition-colors cursor-pointer"
                      >
                        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="w-px h-5 bg-slate-600 mx-1 shrink-0" />

                  {/* Clear All + Save Day / Edit Day */}
                  {isEditing && (
                    <button
                      onClick={() => clearAllForDay(day)}
                      className="text-red-300 font-extrabold uppercase text-[10px] hover:text-red-200 transition-colors px-2 py-1"
                    >
                      Clear All
                    </button>
                  )}
                  {isEditing ? (
                    <button
                      onClick={() => handleSaveDay(day)}
                      className="bg-indigo-500 hover:bg-indigo-400 text-white px-5 py-1.5 rounded-xl font-bold text-xs transition-colors shadow-xs"
                    >
                      Save Day
                    </button>
                  ) : (
                    <button
                      onClick={() => setEditingDays(p => ({ ...p, [day]: true }))}
                      className="text-slate-200 border border-slate-500 bg-slate-600/50 hover:bg-slate-500/60 px-5 py-1.5 rounded-xl font-bold text-xs transition-colors"
                    >
                      Edit Day
                    </button>
                  )}
                </div>
              </div>

              {daySlots.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-12 px-6 text-center">
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                    {workingDays.length === 0
                      ? `No operating days set up for ${branch} yet`
                      : `No schedule set up for ${branch} on ${day}`}
                  </span>
                  <Link
                    href="/manpower-schedule/settings"
                    className="mt-2 text-indigo-600 border border-indigo-200 bg-indigo-50/50 hover:bg-indigo-50 px-4 py-2 rounded-xl font-bold text-xs transition-colors dark:text-indigo-400 dark:border-indigo-700 dark:bg-indigo-900/50 dark:hover:bg-indigo-900"
                  >
                    Go to Settings
                  </Link>
                </div>
              ) : (
                <DayScheduleTable
                  {...sharedTableProps}
                  tableSelections={selections}
                  tableNotes={notes}
                  editable={isEditing}
                  showColumnControls={true}
                  setManagerReplacementBranch={setManagerReplacementBranch}
                  setColumnReplacementBranch={setColumnReplacementBranch}
                  onCellSet={setCell}
                  onNoteChange={(key, value) =>
                    setNotes(p => ({ ...p, [key]: value }))
                  }
                  onClearColumn={clearColumnForDay}
                />
              )}
            </div>
          </div>
        ) : (
          /* ── CREATE / VIEW MODE: Single table ── */
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:bg-slate-900 dark:border-slate-800">
            {loading ? (
              <div className="flex flex-col items-center justify-center gap-2 py-24 px-6 text-center">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  Loading schedule…
                </span>
              </div>
            ) : (
              <>
                <header className="bg-white p-4 border-b flex justify-between items-center relative gap-4 flex-wrap md:flex-nowrap dark:bg-slate-900 dark:border-slate-800">
                  {/* Day tabs */}
                  <div className="flex gap-1 bg-slate-100/80 p-1 rounded-xl select-none z-10 dark:bg-slate-800/80">
                    {workingDays.map(d => {
                      const active = selectedDay === d;
                      return (
                        <button
                          key={d}
                          onClick={() => setSelectedDay(d)}
                          className={`px-3.5 py-1.5 rounded-lg font-bold text-xs transition-all ${
                            active
                              ? "bg-white text-indigo-600 shadow-xs dark:bg-slate-900 dark:text-indigo-400"
                              : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                          }`}
                        >
                          {d.slice(0, 3).toUpperCase()}
                        </button>
                      );
                    })}
                  </div>

                  {/* Day title centered */}
                  <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none hidden md:flex">
                    <h2 className="text-sm font-extrabold text-slate-800 m-0 leading-none tracking-tight dark:text-slate-200">
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
                        className="text-red-500 font-extrabold uppercase text-[10px] hover:underline px-2 py-1 dark:text-red-400"
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
                        className="text-indigo-600 border border-indigo-200 bg-indigo-50/50 hover:bg-indigo-50 px-5 py-2 rounded-xl font-bold text-xs transition-colors dark:text-indigo-400 dark:border-indigo-700 dark:bg-indigo-900/50 dark:hover:bg-indigo-900"
                      >
                        Edit Day
                      </button>
                    )}
                  </div>
                </header>

                {daySlots.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-16 px-6 text-center">
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                      {workingDays.length === 0
                        ? `No operating days set up for ${branch} yet`
                        : `No schedule set up for ${branch} on ${day}`}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 max-w-md">
                      This branch has no operating hours or time slots configured{workingDays.length === 0 ? "" : " for this day"} yet.
                      An Admin needs to set them up in Manpower Schedule Settings before staff can be assigned.
                    </span>
                    <Link
                      href="/manpower-schedule/settings"
                      className="mt-2 text-indigo-600 border border-indigo-200 bg-indigo-50/50 hover:bg-indigo-50 px-4 py-2 rounded-xl font-bold text-xs transition-colors dark:text-indigo-400 dark:border-indigo-700 dark:bg-indigo-900/50 dark:hover:bg-indigo-900"
                    >
                      Go to Settings
                    </Link>
                  </div>
                ) : (
                  <DayScheduleTable
                    {...sharedTableProps}
                    tableSelections={selections}
                    tableNotes={notes}
                    editable={isEditing}
                    showColumnControls={isEditing}
                    setManagerReplacementBranch={setManagerReplacementBranch}
                    setColumnReplacementBranch={setColumnReplacementBranch}
                    onCellSet={setCell}
                    onNoteChange={(key, value) =>
                      setNotes(p => ({ ...p, [key]: value }))
                    }
                    onClearColumn={clearColumnForDay}
                  />
                )}
              </>
            )}
          </div>
        )}

        <SummaryTable title="Weekly Hours Summary" data={summaryData} />

        {!isReadOnly && (
          <div className="mt-16 text-center pb-10">
            {errorMsg && (
              <p className="text-sm font-bold text-red-600 dark:text-red-400 mb-4">{errorMsg}</p>
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
          <div className="mt-12 mx-auto max-w-md text-center bg-slate-100 border border-slate-200 px-6 py-4 rounded-xl dark:bg-slate-800 dark:border-slate-700">
            <span className="font-semibold text-slate-500 dark:text-slate-400 text-sm">
              Read-only view
            </span>
          </div>
        )}

        {loading && (
          <div className="fixed bottom-6 right-6 bg-white border border-slate-200 shadow-lg rounded-xl px-4 py-2 text-xs font-bold text-slate-500 uppercase tracking-widest dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400">
            Loading...
          </div>
        )}
      </div>

      {/* Add Employee modal (visual only) */}
      {showAddEmployeeModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white p-8 rounded-[2rem] shadow-2xl border border-slate-100 w-full max-w-sm flex flex-col gap-5 dark:bg-slate-900 dark:border-slate-800">
            <h2 className="text-lg font-bold text-slate-800 text-center dark:text-slate-200">
              Add Employee
            </h2>
            <div className="text-xs text-slate-500 text-center font-medium bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 dark:bg-slate-950 dark:border-slate-800 dark:text-slate-400">
              Branch: <span className="font-semibold text-slate-700 dark:text-slate-300">{branch}</span>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Full Name</label>
              <input
                type="text"
                value={newEmployeeName}
                onChange={e => setNewEmployeeName(e.target.value)}
                placeholder="e.g. Ahmad Bin Ali"
                className="w-full p-3 border-2 border-slate-200 rounded-xl bg-slate-50 font-bold text-slate-700 outline-none focus:border-green-500 transition-colors dark:border-slate-500 dark:bg-slate-950 dark:text-slate-100"
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Role</label>
              <select
                value={newEmployeePosition}
                onChange={e => setNewEmployeePosition(e.target.value)}
                className="w-full p-3 border-2 border-slate-200 rounded-xl bg-slate-50 font-bold text-slate-700 outline-none focus:border-green-500 transition-colors dark:border-slate-500 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="Part Time">Part Time</option>
                <option value="Full Time">Full Time</option>
                <option value="Branch Manager">Branch Manager</option>
              </select>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowAddEmployeeModal(false)}
                className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200 text-sm transition-colors dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
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
        <div className="flex items-center justify-center h-full text-blue-600 dark:text-blue-400 font-semibold text-lg">
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
          <div className="flex items-center justify-center h-full text-slate-500 dark:text-slate-400">
            Loading week...
          </div>
        }
      >
        <PlanNewWeekGridContent />
      </Suspense>
    </AppShell>
  );
}
