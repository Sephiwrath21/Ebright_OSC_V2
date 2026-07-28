"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { format, parseISO } from "date-fns";
import Link from "next/link";
import { Home as HomeIcon, ChevronRight, Undo2, Redo2 } from "lucide-react";
import AppShell from "@/app/components/AppShell";
import {
  ALL_BRANCHES,
  isManagerOnDutySlot,
  getStaffColorByIndex,
  getSoftStaffColor,
  SOFT_STAFF_PALETTE,
  SELECT_ARROW_WHITE,
  SELECT_ARROW_DARK,
} from "@/lib/manpowerUtils";

// ─── API shapes ───────────────────────────────────────────────────────────────

interface StaffPayload {
  id: number;
  name: string;
  fullName?: string;
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

type AttnStatus = "Present" | "Absent" | "Late";

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
): { label: string; type: "opening" | "coach" | "closing"; sequence_no: number; startMin: number; endMin: number }[] {
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
    const toMin = (tStr: string) => {
      const p = String(tStr).split(":");
      return parseInt(p[0]) * 60 + parseInt(p[1] ?? "0");
    };
    return {
      label: `${startFormatted} - ${endFormatted}`,
      type: s.slot_type as "opening" | "coach" | "closing",
      sequence_no: s.sequence_no ?? idx + 1,
      startMin: toMin(s.slot_start),
      endMin: toMin(s.slot_end),
    };
  });
}

// ─── Summary Table ────────────────────────────────────────────────────────────

function SummaryTable({
  title,
  data,
  showAll,
  onToggleShowAll,
  dayLabel,
  colorFor,
  dateLabel,
  fullNameFor,
  collapsed,
  onToggleCollapsed,
}: {
  title: string;
  data: { name: string; coachHrs: number; execHrs: number; total: number; classes: number }[];
  showAll: boolean;
  onToggleShowAll: (all: boolean) => void;
  dayLabel: string;
  colorFor: (name: string) => string;
  dateLabel: string;
  fullNameFor: (name: string) => string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const fmt = (h: number) => {
    const hrs = Math.floor(h);
    const min = Math.round((h - hrs) * 60);
    return { h: hrs.toString(), m: min.toString().padStart(2, "0") };
  };
  // Scheduled staff first (most hours first); un-scheduled (grey) sink to bottom.
  const sorted = [...data].sort((a, b) => {
    const az = a.total === 0 ? 1 : 0;
    const bz = b.total === 0 ? 1 : 0;
    if (az !== bz) return az - bz;
    if (b.total !== a.total) return b.total - a.total;
    return fullNameFor(a.name).localeCompare(fullNameFor(b.name));
  });
  return (
    <div className={`mt-12 bg-white rounded-2xl border border-slate-200 shadow-md overflow-hidden text-slate-800 ${collapsed ? "px-8 py-4" : "p-8"}`}>
      {/* Tabs left · date absolutely centered · title + collapse toggle right */}
      <header className={`flex items-center justify-between gap-4 relative ${collapsed ? "" : "border-b border-slate-200 pb-4 mb-4"}`}>
        {!collapsed && (
          <div className="flex gap-1 bg-slate-100/80 p-1 rounded-xl select-none z-10">
            <button
              onClick={() => onToggleShowAll(true)}
              className={`px-4 py-1.5 rounded-lg font-bold text-xs transition-all ${
                showAll ? "bg-white text-indigo-600 shadow-xs" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              All week
            </button>
            <button
              onClick={() => onToggleShowAll(false)}
              className={`px-4 py-1.5 rounded-lg font-bold text-xs transition-all ${
                !showAll ? "bg-white text-indigo-600 shadow-xs" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {dayLabel}
            </button>
          </div>
        )}
        {!collapsed && (
          <div className="absolute left-1/2 -translate-x-1/2 text-sm font-bold text-slate-500 whitespace-nowrap pointer-events-none hidden lg:block">
            {dateLabel}
          </div>
        )}
        <div className="flex items-center gap-3 z-10 ml-auto">
          <h2 className="m-0 text-lg font-bold text-slate-800 whitespace-nowrap">
            {title}
          </h2>
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
            title={collapsed ? "Expand" : "Collapse"}
          >
            <ChevronRight className={`w-4 h-4 transition-transform ${collapsed ? "rotate-90" : "-rotate-90"}`} aria-hidden="true" />
          </button>
        </div>
      </header>
      {!collapsed && (
      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="w-[60px] border border-slate-300 bg-slate-800 p-3 text-white font-bold text-center">No.</th>
              <th className="w-[250px] border border-slate-300 bg-slate-800 p-3 text-white font-bold text-left">Name</th>
              <th className="w-[110px] border border-slate-300 bg-slate-800 p-3 text-white font-bold text-center">Classes</th>
              <th className="w-[240px] border border-slate-300 bg-slate-800 p-3 text-white font-bold text-center">Class (Coach)</th>
              <th className="w-[240px] border border-slate-300 bg-slate-800 p-3 text-white font-bold text-center">Executive</th>
              <th className="w-[240px] border border-slate-300 bg-slate-800 p-3 text-white font-bold text-center">Total (hrs:min)</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && (
              <tr>
                <td colSpan={6} className="border border-slate-300 px-3 py-6 text-center text-sm font-semibold text-slate-400">
                  No staff scheduled{showAll ? "" : ` for ${dayLabel}`}.
                </td>
              </tr>
            )}
            {sorted.map((row, i) => {
              const c = fmt(row.coachHrs);
              const e = fmt(row.execHrs);
              const t = fmt(row.total);
              // No assignments anywhere this week → grey out + flag.
              const noSchedule = row.total === 0;
              return (
                <tr key={row.name} className={`transition-colors ${noSchedule ? "bg-slate-50/60" : "even:bg-slate-50 hover:bg-slate-100"}`}>
                  <td className="border border-slate-300 px-3 py-3 text-center font-bold text-slate-500">{i + 1}</td>
                  <td className="border border-slate-300 px-3 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-block px-3 py-1 rounded-full border text-sm font-bold ${
                        noSchedule
                          ? "bg-slate-100 text-slate-400 border-slate-200"
                          : (colorFor(row.name) || "bg-slate-100 text-slate-700 border-slate-200")
                      }`}>
                        {fullNameFor(row.name)}
                      </span>
                      {noSchedule && (
                        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 italic">
                          No schedule this week
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="border border-slate-300 px-3 py-3 text-center">
                    <span className={`text-base font-black ${noSchedule ? "text-slate-300" : "text-slate-700"}`}>{row.classes}</span>
                  </td>
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
      )}
    </div>
  );
}

// ─── Manual Attendance Table (Update mode) ────────────────────────────────────
// BM ticks Present / Absent / Late per scheduled staff for the selected day.
// A row is "unsaved" while its current status differs from the last saved one.
function AttendanceTable({
  rows,
  currentFor,
  savedFor,
  onSet,
  onSaveAll,
  saving,
  fullNameFor,
  editable,
  dateLabel,
  dayLocked,
  dayLockSaving,
  onToggleDayLock,
  canManageLock,
}: {
  rows: { name: string; isNew: boolean }[];
  currentFor: (name: string) => AttnStatus | undefined;
  savedFor: (name: string) => AttnStatus | undefined;
  onSet: (name: string, status: AttnStatus) => void;
  onSaveAll: () => void;
  saving: boolean;
  fullNameFor: (name: string) => string;
  editable: boolean;
  dateLabel: string;
  dayLocked: boolean;
  dayLockSaving: boolean;
  onToggleDayLock: (lock: boolean) => void;
  canManageLock: boolean;
}) {
  const STATUSES: AttnStatus[] = ["Present", "Absent", "Late"];
  const unsavedCount = rows.filter(r => {
    const c = currentFor(r.name);
    return !!c && c !== savedFor(r.name);
  }).length;
  const rowEditable = editable && !dayLocked;
  const toneFor = (status: AttnStatus, active: boolean) => {
    if (!active) return "bg-white text-slate-400 border-slate-200 hover:bg-slate-50";
    if (status === "Present") return "bg-emerald-600 text-white border-emerald-600";
    if (status === "Absent") return "bg-red-600 text-white border-red-600";
    return "bg-amber-500 text-white border-amber-500";
  };

  return (
    <div className="mt-6 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
      <div className="relative flex items-center justify-center gap-2 mb-4">
        <h2 className="text-sm font-black text-center uppercase tracking-widest text-slate-800">Attendance</h2>
        {dateLabel && <span className="text-xs font-semibold text-slate-400">· {dateLabel}</span>}
        {/* Day lock control, top-right — superadmin only */}
        <div className="absolute right-0 top-1/2 -translate-y-1/2">
          {!canManageLock ? null : dayLocked ? (
            <button
              type="button"
              disabled={dayLockSaving}
              onClick={() => onToggleDayLock(false)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-bold uppercase tracking-wide transition-colors ${
                !dayLockSaving
                  ? "bg-slate-700 text-white border-slate-700 hover:bg-slate-600"
                  : "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
              }`}
              title="Unlock this day to allow attendance edits"
            >
              🔒 {dayLockSaving ? "…" : "Locked — Unlock"}
            </button>
          ) : (
            <button
              type="button"
              disabled={dayLockSaving}
              onClick={() => onToggleDayLock(true)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-bold uppercase tracking-wide transition-colors ${
                !dayLockSaving
                  ? "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
                  : "bg-white text-slate-300 border-slate-200 cursor-not-allowed"
              }`}
              title="Lock this day — prevents any further attendance changes"
            >
              {dayLockSaving ? "…" : "Lock Day"}
            </button>
          )}
        </div>
      </div>
      {dayLocked && (
        <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 border border-slate-200 text-slate-500 text-[11px] font-bold uppercase tracking-wide">
          🔒 This day is locked — attendance is read-only.
        </div>
      )}
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="text-slate-600 bg-slate-100 border-b border-slate-200">
              <tr>
                <th className="p-2 border-r border-slate-200 text-left w-10">No.</th>
                <th className="p-2 border-r border-slate-200 text-left">Name</th>
                <th className="p-2 border-r border-slate-200 text-center">Status</th>
                <th className="p-2 text-center w-20">Saved</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-4 text-center text-slate-400">
                    No staff assigned for this day yet.
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => {
                  const current = currentFor(row.name);
                  const saved = savedFor(row.name);
                  const isDirty = !!current && current !== saved;
                  return (
                    <tr key={row.name} className="hover:bg-slate-50 transition-colors">
                      <td className="p-2 border-r border-slate-100 text-center text-slate-400 font-bold">{index + 1}</td>
                      <td className="p-2 border-r border-slate-100 font-bold text-slate-700">
                        {fullNameFor(row.name)}
                        {fullNameFor(row.name) !== row.name && (
                          <span className="ml-1 text-[10px] font-normal text-slate-400">({row.name})</span>
                        )}
                        {row.isNew && (
                          <span className="ml-1.5 px-1.5 py-0.5 rounded-md bg-fuchsia-100 text-fuchsia-700 text-[9px] font-black uppercase tracking-wide align-middle">New</span>
                        )}
                      </td>
                      <td className="p-2 border-r border-slate-100">
                        <div className="flex items-center justify-center gap-1.5">
                          {STATUSES.map(status => (
                            <button
                              key={status}
                              type="button"
                              disabled={!rowEditable}
                              onClick={() => onSet(row.name, status)}
                              className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold uppercase tracking-wide transition-colors ${toneFor(status, current === status)} ${!rowEditable ? "opacity-60 cursor-not-allowed" : ""}`}
                            >
                              {status}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="p-2 text-center">
                        {!current ? (
                          <span className="text-slate-300">—</span>
                        ) : isDirty ? (
                          <span className="inline-block w-2 h-2 rounded-full bg-amber-500" title="Unsaved" />
                        ) : (
                          <span className="text-emerald-600 font-bold" title="Saved">✓</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Single save-all button */}
      <div className="mt-3 flex items-center justify-end gap-3">
        {unsavedCount > 0 && (
          <span className="text-xs font-semibold text-amber-600">{unsavedCount} unsaved</span>
        )}
        <button
          type="button"
          disabled={!rowEditable || unsavedCount === 0 || saving}
          onClick={onSaveAll}
          className={`px-6 py-2 rounded-xl text-sm font-semibold shadow-sm transition-colors ${
            rowEditable && unsavedCount > 0 && !saving
              ? "bg-[#2D3F50] text-white hover:bg-[#1f2c38]"
              : "bg-slate-100 text-slate-400 cursor-not-allowed"
          }`}
        >
          {saving ? "Saving…" : "Save Attendance"}
        </button>
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
  colorFor: (name: string) => string;
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
  colorFor,
}: DayScheduleTableProps) {
  // Notes column: always shown when editable (so remarks can be added). In a
  // read-only view, hide it entirely when this day has no remark at all; keep it
  // if even one slot has a remark.
  const hasAnyRemark = daySlots.some(
    s => (tableNotes[`${day}-${s.label}-notes`] ?? "").trim() !== "",
  );
  const showNotesCol = editable || hasAnyRemark;
  return (
    <div className="overflow-x-auto relative">
      <table className="w-full border-collapse" style={{ minWidth: `${470 + (coachCount + execCount) * 115}px` }}>
        <thead className="bg-slate-50/50 border-b border-slate-200 text-[10px] uppercase tracking-widest text-slate-700 font-bold">
          <tr>
            <th className="p-3 text-left w-[160px] sticky left-0 z-20 bg-slate-50 border-r border-slate-200 text-slate-600 font-semibold shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] whitespace-nowrap">
              Time Slot
            </th>
            {/* Manager column header */}
            <th className="p-3 text-center border-l border-slate-200 w-[130px] bg-emerald-50/40 border-b-4 border-b-emerald-400">
              <div className="flex flex-col items-center gap-1.5">
                <span className="text-[10px] font-extrabold text-slate-800">MANAGER</span>
                {showColumnControls && editable ? (
                  <div className="flex items-center gap-1">
                    <select
                      value={managerReplacementBranch[day] ?? ""}
                      onChange={e =>
                        setManagerReplacementBranch?.(p => ({ ...p, [day]: e.target.value }))
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
                        onClick={() => setManagerReplacementBranch?.(p => ({ ...p, [day]: "" }))}
                        className="text-[10px] text-red-500 font-black hover:text-red-700 transition-colors"
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
                    className="text-[9px] text-red-500 font-extrabold uppercase tracking-wider hover:underline cursor-pointer"
                    title="Clear this column for the whole day"
                  >
                    Clear
                  </button>
                )}
                {(!editable || !showColumnControls) && (
                  <span className="text-[9px] bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full px-2 py-0.5 font-bold">
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
                    {showColumnControls && editable && (
                      <button
                        onClick={() => onClearColumn?.(col.id)}
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
            {showNotesCol && (
              <th className="p-3 text-center border-l border-slate-200 w-[180px] bg-slate-50 text-slate-600 font-semibold">
                Notes/Remarks
              </th>
            )}
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
                          disabled={!editable}
                          value={managerVal}
                          onChange={e => onCellSet?.(day, slotLabel, "MANAGER", e.target.value)}
                          className={`w-full py-1.5 px-3 rounded-xl font-bold text-[11px] appearance-none transition-all outline-none text-center ${
                            managerVal
                              ? checkIfLeavingSoon(managerVal)
                                ? "bg-red-50 text-red-700 border border-red-200"
                                : colorFor(managerVal)
                              : "bg-emerald-50/40 text-emerald-600 border border-emerald-200/60 hover:bg-emerald-50/80"
                          }`}
                          style={{
                            backgroundImage: editable ? `url("${SELECT_ARROW_DARK}")` : "none",
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
                      <div className="w-full h-[28px] rounded-xl bg-emerald-50/30 border border-dashed border-emerald-100 flex items-center justify-center">
                        <span className="text-[9px] text-emerald-300 font-bold uppercase tracking-wider">—</span>
                      </div>
                    )}
                  </td>
                )}

                {isOpenClose ? (
                  <td colSpan={COLUMNS.length + (showNotesCol ? 2 : 1)} className="p-3 border-l border-slate-200 text-center">
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

                      let colBg = "bg-blue-50/10";
                      if (isExec) colBg = "bg-purple-50/10";
                      else if (isTraining) colBg = "bg-amber-50/10";
                      else if (isStar) colBg = "bg-rose-50/10";

                      const selectTheme = val
                        ? checkIfLeavingSoon(val)
                          ? "bg-red-50 text-red-700 border border-red-200"
                          : colorFor(val)
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
                          .map(c => tableSelections[`${day}-${slotLabel}-${c.id}`])
                          .filter((n): n is string => !!n),
                        ...(managerVal ? [managerVal] : []),
                      ]);
                      return (
                        <td
                          key={col.id}
                          className={`p-1.5 border-l border-slate-200 align-middle ${colBg}`}
                        >
                          <select
                            disabled={!editable}
                            value={val}
                            onChange={e => onCellSet?.(day, slotLabel, col.id, e.target.value)}
                            className={`w-full py-1.5 px-3 rounded-xl font-bold text-[11px] appearance-none transition-all outline-none text-center ${selectTheme}`}
                            style={{
                              backgroundImage: editable ? `url("${SELECT_ARROW_DARK}")` : "none",
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
                    {showNotesCol && (
                      <td className="p-1.5 border-l border-slate-200 w-[180px] bg-white">
                        {editable ? (
                          <textarea
                            value={tableNotes[`${day}-${slotLabel}-notes`] ?? ""}
                            onChange={e =>
                              onNoteChange?.(`${day}-${slotLabel}-notes`, e.target.value)
                            }
                            placeholder="Add remarks..."
                            className="w-full p-1 text-[11px] border border-slate-200 rounded-xl bg-white resize-none h-[28px] overflow-y-auto outline-none focus:border-blue-500 transition-all font-medium italic text-slate-600 block"
                          />
                        ) : (
                          <span className="block w-full px-1 text-[11px] font-medium italic text-slate-600 whitespace-pre-wrap">
                            {tableNotes[`${day}-${slotLabel}-notes`] ?? ""}
                          </span>
                        )}
                      </td>
                    )}
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

type DayCount = { coach: number; exec: number; training: number; star: number };
const DEFAULT_DAY_COUNT: DayCount = { coach: 3, exec: 3, training: 0, star: 0 };
const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// ISO date (YYYY-MM-DD) for a day name within the week starting at startStr (Mon).
function isoDateForDay(startStr: string | null, dayName: string): string | null {
  if (!startStr) return null;
  const idx = DAY_ORDER.indexOf(dayName);
  if (idx === -1) return null;
  const d = new Date(`${startStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + idx);
  return d.toISOString().slice(0, 10);
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtNiceDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function PlanNewWeekGridContent({ userRole }: { userRole: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Only superadmins may lock / unlock an attendance day.
  const canManageAttendanceLock = userRole.toLowerCase() === "superadmin";

  const branch = searchParams.get("branch") ?? "Bandar Seri Putra";
  const startStr = searchParams.get("start");
  const endStr = searchParams.get("end");
  const mode: Mode = (searchParams.get("mode") as Mode) || "create";
  const isReadOnly = mode === "view";

  const [selectedDay, setSelectedDay] = useState<string>("");
  // "All" or a day name — filters the hours summary table below.
  // Weekly Hours Summary: show the whole-week rollup, or just the selected day.
  const [summaryShowAll, setSummaryShowAll] = useState(true);
  const [summaryCollapsed, setSummaryCollapsed] = useState(false);

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

  // Column counts are PER DAY (per calendar date), keyed by day name for the
  // currently-open week. Changing one day's columns no longer affects others.
  const [dayCounts, setDayCounts] = useState<Record<string, DayCount>>({});
  const curCounts = dayCounts[selectedDay] ?? DEFAULT_DAY_COUNT;
  const coachCount = curCounts.coach;
  const execCount = curCounts.exec;
  const trainingCount = curCounts.training;
  const starCount = curCounts.star;

  // Frozen column counts for the Planning (read-only) table.
  // Derived from the planning data itself so it never changes when the user
  // adjusts the Actual column selectors.
  const [planningCoachCount, setPlanningCoachCount] = useState<number>(3);
  const [planningExecCount, setPlanningExecCount] = useState<number>(3);
  const [planningTrainingCount, setPlanningTrainingCount] = useState<number>(0);
  const [planningStarCount, setPlanningStarCount] = useState<number>(0);

  // scheduleType is now derived — no longer a toggle.
  //   create → "planning" (building the plan)
  //   update → "actual"   (adjusting what actually happened)
  //   view   → "actual"   (archive shows the finalized/updated roster)
  const scheduleType: "planning" | "actual" = mode === "create" ? "planning" : "actual";

  const [periodStatus, setPeriodStatus] = useState<"draft" | "archived">("draft");
  const [changedSinceArchive, setChangedSinceArchive] = useState<boolean>(false);
  // Unsaved-edits flag for the Update-mode Actual grid (drives the status chip
  // and the leave-page warning). Set on any edit, cleared after a save.
  const [dirty, setDirty] = useState(false);

  // Undo/redo history of the editable roster (selections + notes). Each discrete
  // edit snapshots the PRE-edit state onto the undo stack; consecutive edits to
  // the same note cell are coalesced into one step so typing isn't per-character.
  type RosterSnap = { selections: Record<string, string>; notes: Record<string, string> };
  const [undoStack, setUndoStack] = useState<RosterSnap[]>([]);
  const [redoStack, setRedoStack] = useState<RosterSnap[]>([]);
  const lastEditSigRef = useRef<string | null>(null);

  // Manual attendance (Update mode). Keyed `${isoDate}::${nickname}`.
  //   attnStatus = the currently-selected status; attnSaved = last persisted.
  // A row is "unsaved" when attnStatus differs from attnSaved.
  const [attnStatus, setAttnStatus] = useState<Record<string, AttnStatus>>({});
  const [attnSaved, setAttnSaved] = useState<Record<string, AttnStatus>>({});
  const [attnSaving, setAttnSaving] = useState(false);
  // Per-day lock overrides keyed by ISO date (true=locked, false=unlocked). No
  // entry → fall back to the auto rule (date before today ⇒ locked).
  const [dayLockOverride, setDayLockOverride] = useState<Record<string, boolean>>({});
  const [dayLockSaving, setDayLockSaving] = useState(false);

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

        // Planning schedule: load in ALL modes now.
        //   - update mode → read-only top table
        //   - view mode   → the single read-only table
        //   - create mode → pre-fill the editable grid so reopening a week you
        //     already planned shows your saved assignments instead of a blank
        //     grid. (Create mode used to skip this fetch, which is why a saved
        //     day "disappeared" on reopen even though it was persisted.)
        const planningSchedPromise =
          fetch(`/api/schedules?branch=${encodeURIComponent(branch)}&startDate=${startStr}&endDate=${endStr}&scheduleType=planning`);

        // Actual schedule: the editable bottom table in update mode, AND the
        // single read-only table in view/archive mode (archive shows what
        // actually happened — the finalized/updated roster, not the plan).
        const actualSchedPromise = (mode === "update" || mode === "view")
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

        // Positions — per-day counts (data.days is keyed by ISO date)
        if (positionsRes.ok) {
          const data = await positionsRes.json();
          if (cancelled) return;
          if (data.success && data.days) {
            const base = new Date(`${startStr}T00:00:00Z`);
            const next: Record<string, DayCount> = {};
            DAY_ORDER.forEach((dn, idx) => {
              const d = new Date(base);
              d.setUTCDate(d.getUTCDate() + idx);
              const iso = d.toISOString().slice(0, 10);
              const c = data.days[iso];
              if (c) next[dn] = {
                coach: c.coach ?? 0,
                exec: c.exec ?? 0,
                training: c.training ?? 0,
                star: c.star ?? 0,
              };
            });
            setDayCounts(next);
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
            } else if (mode === "create") {
              // Create mode: prefill the editable grid with the saved plan.
              setSelections(sels);
              setNotes((match.notes ?? {}) as Record<string, string>);
            }
            // view mode: the single table shows the ACTUAL roster, set below.
          } else {
            if (mode === "update") {
              setPlanningSelections({});
              setPlanningNotes({});
            } else if (mode === "create") {
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

        // Manual attendance (update mode only)
        if (mode === "update") {
          const attnRes = await fetch(
            `/api/schedules/attendance?branch=${encodeURIComponent(branch)}&startDate=${startStr}&endDate=${endStr}`,
          );
          if (attnRes.ok) {
            const data = await attnRes.json();
            if (cancelled) return;
            if (data.success && data.attendance) {
              const st: Record<string, AttnStatus> = {};
              Object.entries(data.attendance as Record<string, { status: string }>).forEach(
                ([k, v]) => { st[k] = v.status as AttnStatus; },
              );
              setAttnStatus(st);
              setAttnSaved(st);
              setDayLockOverride((data.dayLocks as Record<string, boolean>) ?? {});
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
  }, [branch, startStr, endStr, mode]);

  const ownStaffNames = useMemo(() => {
    return (staffByBranch[branch] ?? []).map(s => s.name);
  }, [staffByBranch, branch]);

  // Distinct, stable color per staff member. Colors are assigned by index over
  // a stable sorted roster (own-branch staff first, then any others assigned),
  // so two different people never share a color (up to the palette size) and a
  // given person keeps the same color across days/weeks. Used by BOTH the grid
  // cells and the summary table so they always match.
  const colorForName = useMemo(() => {
    const others = Array.from(
      new Set(Object.values(selections).filter(v => !!v && v !== "None" && !ownStaffNames.includes(v))),
    ).sort();
    const roster = [...[...ownStaffNames].sort(), ...others];
    const map: Record<string, string> = {};
    roster.forEach((n, i) => { map[n] = SOFT_STAFF_PALETTE[i % SOFT_STAFF_PALETTE.length]; });
    return (name: string) => {
      if (!name || name === "None" || name === "-- Select --" || name === "Select staff") return "";
      return map[name] ?? getSoftStaffColor(name);
    };
  }, [ownStaffNames, selections]);

  // Map a displayed (nick) name → the person's full name for the summary table.
  const fullNameFor = useMemo(() => {
    const map: Record<string, string> = {};
    [...Object.values(staffByBranch), ...Object.values(managersByBranch)].forEach(list => {
      list.forEach(s => { if (s.name && s.fullName) map[s.name] = s.fullName; });
    });
    return (name: string) => map[name] ?? name;
  }, [staffByBranch, managersByBranch]);

  // ─── Manual attendance (Update mode) ───
  // Rows = union of Planning ∪ Actual staff for the selected day (managers
  // included, unlike the hours summary). A name in Actual but not Planning is
  // flagged "New". Attendance state is keyed `${isoDate}::${nickname}`.
  const attendanceRows = useMemo(() => {
    const namesForDay = (sel: Record<string, string>) => {
      const out = new Set<string>();
      Object.entries(sel).forEach(([k, v]) => {
        if (!k.startsWith(`${selectedDay}-`)) return;
        if (!v || v === "None") return;
        out.add(v);
      });
      return out;
    };
    const planning = namesForDay(planningSelections);
    const actual = namesForDay(selections);
    const all = new Set<string>([...planning, ...actual]);
    return Array.from(all)
      .map(name => ({ name, isNew: actual.has(name) && !planning.has(name) }))
      .sort((a, b) => fullNameFor(a.name).localeCompare(fullNameFor(b.name)));
  }, [planningSelections, selections, selectedDay, fullNameFor]);

  const setAttendanceStatus = useCallback((name: string, status: AttnStatus) => {
    const iso = isoDateForDay(startStr, selectedDay);
    if (!iso) return;
    setAttnStatus(prev => ({ ...prev, [`${iso}::${name}`]: status }));
  }, [startStr, selectedDay]);

  // Save the whole day's attendance in one request — every row whose selected
  // status differs from what's saved.
  const saveAllAttendance = useCallback(async () => {
    const iso = isoDateForDay(startStr, selectedDay);
    if (!iso) return;
    const entries = attendanceRows
      .map(r => ({ name: r.name, status: attnStatus[`${iso}::${r.name}`] }))
      .filter((e): e is { name: string; status: AttnStatus } =>
        !!e.status && e.status !== attnSaved[`${iso}::${e.name}`]);
    if (entries.length === 0) return;
    setAttnSaving(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/schedules/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch, date: iso, entries }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? "Save failed");
      setAttnSaved(prev => {
        const next = { ...prev };
        entries.forEach(e => { next[`${iso}::${e.name}`] = e.status; });
        return next;
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save attendance");
    } finally {
      setAttnSaving(false);
    }
  }, [startStr, selectedDay, attendanceRows, attnStatus, attnSaved, branch]);

  // Day-lock for the selected day — manual only (superadmin). No auto-lock.
  const selectedIso = isoDateForDay(startStr, selectedDay);
  const dayLocked = selectedIso ? !!dayLockOverride[selectedIso] : false;

  const toggleDayLock = useCallback(async (lock: boolean) => {
    const iso = isoDateForDay(startStr, selectedDay);
    if (!iso) return;
    setDayLockSaving(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/schedules/attendance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch, date: iso, locked: lock }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? "Lock failed");
      setDayLockOverride(prev => ({ ...prev, [iso]: lock }));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to update day lock");
    } finally {
      setDayLockSaving(false);
    }
  }, [startStr, selectedDay, branch]);

  // Create/planning mode is always editable — the whole week is persisted by
  // the single bottom "Save Plan" button, so there is no per-day edit lock.
  // Update mode keeps the per-day Edit/Save toggle for recording actual
  // attendance one day at a time.
  // Update mode is directly editable (no per-day Edit/Save toggles) until the
  // week is Finalized & Archived. "Re-open for edits" flips periodStatus back to
  // draft, which re-enables editing.
  const isEditing =
    !isReadOnly && (mode === "create" || (mode === "update" && periodStatus !== "archived"));
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

  // Keep selectedDay valid once the real operating days load (they start empty
  // since dbOperatingDays is fetched asynchronously).
  useEffect(() => {
    if (workingDays.length === 0) return;
    setSelectedDay(prev => (workingDays.includes(prev) ? prev : workingDays[0]));
  }, [workingDays]);

  // Warn before leaving/refreshing with unsaved Update-mode edits.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // Undo/redo keyboard shortcuts (Update mode only). Ignored while typing in a
  // form field so the browser's native text undo still works there.
  useEffect(() => {
    if (mode !== "update" || !isEditing) return;
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undoEdit();
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        redoEdit();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // Re-bind when the roster changes so undo/redo capture the latest state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, isEditing, selections, notes]);

  const daySlots = useMemo(
    () => formatDbSlotsForDay(dbOperatingDays, selectedDay, dayMapShort),
    [dbOperatingDays, selectedDay, dayMapShort],
  );

  // Compute weekly hours summary from current actual selections
  // Hours summary, broken down PER working day plus an "All" (week) rollup.
  // Keyed by filter ("All" or a day name). Day tabs list only staff on duty
  // that day; "All" also lists own-branch staff with zero hours.
  const summaryData = useMemo(() => {
    const allNames = Array.from(
      new Set([
        ...ownStaffNames,
        ...Object.values(selections).filter(v => !!v && v !== "None"),
      ]),
    );
    type Acc = { coachHrs: number; execHrs: number; total: number; classes: number };
    const zero = (): Acc => ({ coachHrs: 0, execHrs: 0, total: 0, classes: 0 });
    const week: Record<string, Acc> = {};
    allNames.forEach(n => { week[n] = zero(); });
    const byDay: Record<string, Record<string, Acc>> = {};

    workingDays.forEach(dayName => {
      const daySlotsList = formatDbSlotsForDay(dbOperatingDays, dayName, dayMapShort);
      if (daySlotsList.length === 0) return;

      // Operating span for the day = earliest slot start → latest slot end
      // (includes opening/closing + any gaps). Everyone present that day is
      // "on duty" for this whole span; whatever isn't class time is executive.
      const dayStart = Math.min(...daySlotsList.map(s => s.startMin));
      const dayEnd = Math.max(...daySlotsList.map(s => s.endMin));
      const dailyTarget = (dayEnd - dayStart) / 60;
      byDay[dayName] = {};

      // Read assignments straight from `selections`, but bound to THIS day's
      // active column count (dayCounts[dayName]). This handles per-day column
      // layouts correctly AND ignores stale cells left in state when a column
      // is hidden by lowering the count (e.g. a filled coach3 after dropping to
      // 2 coaches) — those must not count. `seatActive` also excludes MANAGER.
      const dc = dayCounts[dayName] ?? DEFAULT_DAY_COUNT;
      const seatActive = (colId: string): { type: keyof DayCount } | null => {
        const m = colId.match(/^(coach|exec|training|star)(\d+)$/);
        if (!m) return null; // MANAGER or unknown → not a summary column
        const type = m[1] as keyof DayCount;
        return parseInt(m[2], 10) <= (dc[type] ?? 0) ? { type } : null;
      };

      const dayCoach: Record<string, number> = {};
      const dayClasses: Record<string, number> = {};
      const worked = new Set<string>();

      daySlotsList.forEach(slotObj => {
        if (slotObj.type === "opening" || slotObj.type === "closing") return;
        const durHrs = (slotObj.endMin - slotObj.startMin) / 60;
        const prefix = `${dayName}-${slotObj.label}-`;
        Object.entries(selections).forEach(([key, val]) => {
          if (!val || val === "None") return;
          if (!key.startsWith(prefix)) return;
          const parsed = seatActive(key.slice(prefix.length));
          if (!parsed) return; // hidden/stale column or manager → skip
          worked.add(val);
          // Class roles — coach, star coach, training — count as Class (Coach)
          // hours and as one class each. Exec is Executive (the span remainder).
          if (parsed.type === "coach" || parsed.type === "star" || parsed.type === "training") {
            dayCoach[val] = (dayCoach[val] ?? 0) + durHrs;
            dayClasses[val] = (dayClasses[val] ?? 0) + 1;
          }
        });
      });

      worked.forEach(emp => {
        const coach = dayCoach[emp] ?? 0;
        const classes = dayClasses[emp] ?? 0;
        const exec = Math.max(0, dailyTarget - coach);
        byDay[dayName][emp] = { coachHrs: coach, execHrs: exec, total: coach + exec, classes };
        if (!week[emp]) week[emp] = zero();
        week[emp].coachHrs += coach;
        week[emp].execHrs += exec;
        week[emp].total += coach + exec;
        week[emp].classes += classes;
      });
    });

    const toRows = (m: Record<string, Acc>) =>
      Object.entries(m).map(([name, s]) => ({ name, ...s }));

    const result: Record<string, { name: string; coachHrs: number; execHrs: number; total: number; classes: number }[]> = {};
    result["All"] = toRows(week).filter(r => r.total > 0 || ownStaffNames.includes(r.name));
    workingDays.forEach(dn => { result[dn] = toRows(byDay[dn] ?? {}); });
    return result;
  }, [selections, ownStaffNames, workingDays, dbOperatingDays, dayMapShort, dayCounts]);

  // Date shown in the summary header: the whole-week range for "All", or the
  // single date for a selected day.
  const summaryDateLabel = (() => {
    if (!startStr) return "";
    if (summaryShowAll) {
      return endStr ? `${fmtNiceDate(startStr)} – ${fmtNiceDate(endStr)}` : fmtNiceDate(startStr);
    }
    const iso = isoDateForDay(startStr, selectedDay);
    return iso ? fmtNiceDate(iso) : "";
  })();

  async function handleCountChange(type: "coach" | "exec" | "training" | "star", newCount: number) {
    if (isReadOnly) return;
    // Update ONLY the selected day's column count.
    const updated: DayCount = { ...curCounts, [type]: newCount };
    setDayCounts(prev => ({ ...prev, [selectedDay]: updated }));

    try {
      const dateISO = isoDateForDay(startStr, selectedDay);
      if (!dateISO) return;
      const res = await fetch("/api/schedules/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch,
          date: dateISO,
          counts: updated,
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

  // Save the WHOLE week's Actual roster as a draft (no lock, no cost report).
  // Returns true on success so callers (Finalize) can chain on it.
  async function handleSaveWeekActual(): Promise<boolean> {
    if (!startStr || !endStr) return false;
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
          notes,
          scheduleType: "actual",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error ?? "Save failed");
      }
      setDirty(false);
      setSaveState("idle");

      // Refresh status and warnings
      const schedRes = await fetch(`/api/schedules?branch=${encodeURIComponent(branch)}&startDate=${startStr}&endDate=${endStr}&scheduleType=actual`);
      if (schedRes.ok) {
        const schedData = await schedRes.json();
        if (schedData.success && schedData.schedule) {
          setPeriodStatus(schedData.schedule.periodStatus ?? "draft");
          setChangedSinceArchive(!!schedData.schedule.changedSinceArchive);
        }
      }
      return true;
    } catch (err) {
      setSaveState("error");
      setErrorMsg(err instanceof Error ? err.message : "Save failed");
      return false;
    }
  }

  // Re-open a Finalized & Archived week for edits. Flips the local status back
  // to draft (re-enabling the grid); the DB status returns to draft on next Save.
  function handleReopen() {
    setPeriodStatus("draft");
    setSaveState("idle");
    setErrorMsg(null);
  }

  async function handleArchiveWeek() {
    if (!startStr || !endStr) return;
    if (!confirm("Save this week's Actual schedule and update the manpower cost report?")) return;
    // Persist the latest edits first so we never archive stale data.
    const saved = await handleSaveWeekActual();
    if (!saved) return;
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
          notes,
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

  // Snapshot the current roster onto the undo stack before an edit is applied.
  // Consecutive edits to the same note cell coalesce into a single step.
  function pushHistory(sig: string) {
    if (sig.startsWith("note:") && lastEditSigRef.current === sig) return;
    lastEditSigRef.current = sig;
    setUndoStack(prev => [...prev.slice(-49), { selections, notes }]);
    setRedoStack([]);
  }

  function undoEdit() {
    setUndoStack(prev => {
      if (prev.length === 0) return prev;
      const snap = prev[prev.length - 1];
      setRedoStack(r => [...r, { selections, notes }]);
      setSelections(snap.selections);
      setNotes(snap.notes);
      setDirty(true);
      lastEditSigRef.current = null;
      return prev.slice(0, -1);
    });
  }

  function redoEdit() {
    setRedoStack(prev => {
      if (prev.length === 0) return prev;
      const snap = prev[prev.length - 1];
      setUndoStack(u => [...u.slice(-49), { selections, notes }]);
      setSelections(snap.selections);
      setNotes(snap.notes);
      setDirty(true);
      lastEditSigRef.current = null;
      return prev.slice(0, -1);
    });
  }

  // Picking a name auto-fills the same column across every non-opening/closing
  // slot of the day, but skips slots where the name is already used elsewhere
  // (manager vs staff, other coach/exec column). Clearing only clears the one
  // cell. Mirrors the old project's handleNameSelect behavior.
  function setCell(dayArg: string, slot: string, colId: string, value: string) {
    pushHistory(`cell:${dayArg}-${colId}`);
    setDirty(true);
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

  // "Clear Day" — clears the current day's assignments locally in both Planning
  // and Actual. The removal is persisted on the next Save (Save Plan / Save
  // Changes), consistent with the single-save-button model.
  function clearAllForDay(d: string) {
    pushHistory(`clearday:${d}`);
    clearLocalSelectionsForDay(d);
    setDirty(true);
  }

  // Clears one column (e.g. "MANAGER", "coach1") across every slot of the
  // current day. Local-only, same as picking "None" on each cell — persists on
  // the next Save.
  function clearColumnForDay(colId: string) {
    pushHistory(`clearcol:${day}-${colId}`);
    setDirty(true);
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
    colorFor: colorForName,
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
    colorFor: colorForName,
  };

  return (
    <div className="min-h-full bg-slate-50">
      <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 pt-2 pb-20">
        {/* Breadcrumb */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-3">
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
        </div>

        {/* ─── Main content area ──────────────────────────────────────────────── */}
        {loading ? (
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 flex flex-col items-center justify-center gap-2 py-24 px-6 text-center">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
              Loading schedule…
            </span>
          </div>
        ) : mode === "update" ? (
          /* ── UPDATE MODE: Planning (top, read-only) + Actual (bottom, editable) ── */
          <div className="flex flex-col">
            {/* Shared day-tab bar — sticky flush strip. Negative margins match the
                page padding (px-4 sm:px-6 lg:px-8) so it bleeds edge-to-edge and
                doesn't reveal the rounded table card behind it. */}
            <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 lg:-mx-8 bg-white border-b-2 border-slate-200 shadow-sm">
              <div className="px-4 sm:px-6 lg:px-8 py-3 flex justify-between items-center relative gap-4 flex-wrap md:flex-nowrap">
                {/* Day tabs */}
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

                {/* Day title centered */}
                <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none hidden md:flex">
                  <h2 className="text-sm font-extrabold text-slate-800 m-0 leading-none tracking-tight">
                    {day}
                  </h2>
                  <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider mt-0.5">
                    {dateForDay(startStr, day)}
                  </span>
                </div>

                {/* Status + single action, right-aligned */}
                <div className="ml-auto flex items-center gap-3 z-10">
                  {/* Undo / Redo */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={undoEdit}
                      disabled={!isEditing || undoStack.length === 0}
                      title="Undo (Ctrl+Z)"
                      className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <Undo2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button
                      onClick={redoEdit}
                      disabled={!isEditing || redoStack.length === 0}
                      title="Redo (Ctrl+Shift+Z)"
                      className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <Redo2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>

                  <span className="hidden sm:inline text-xs font-semibold">
                    {periodStatus === "archived" ? (
                      <span className="inline-flex items-center gap-1.5 text-emerald-700">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        Saved &amp; cost report updated
                      </span>
                    ) : dirty ? (
                      <span className="inline-flex items-center gap-1.5 text-amber-600">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                        Unsaved changes
                      </span>
                    ) : null}
                  </span>

                  {periodStatus === "archived" && (
                    <button
                      onClick={handleReopen}
                      className="px-4 py-2 rounded-xl text-xs font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      Edit again
                    </button>
                  )}
                  <button
                    onClick={handleArchiveWeek}
                    disabled={saveState === "saving" || saveState === "saved" || periodStatus === "archived"}
                    className={`px-5 py-2 rounded-xl text-xs font-semibold shadow-sm transition-colors ${
                      saveState === "saved"
                        ? "bg-emerald-600 text-white"
                        : "bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-60 disabled:cursor-not-allowed"
                    }`}
                  >
                    {saveState === "saving" && "Saving…"}
                    {saveState === "saved" && "Saved — Redirecting…"}
                    {saveState !== "saving" && saveState !== "saved" &&
                      (periodStatus === "archived" ? "Saved" : "Save and Update")}
                  </button>
                </div>
              </div>
              {errorMsg && (
                <div className="px-6 pb-2 -mt-1 text-right">
                  <span className="text-xs font-bold text-red-600">{errorMsg}</span>
                </div>
              )}
            </div>

            {/* ── Planning Table (read-only top) — greyed out to signal non-editable ── */}
            <div className="mt-5 rounded-2xl shadow-xl overflow-hidden border border-slate-200">
              {/* Planning section header */}
              <div className="bg-slate-600 px-5 py-3 flex items-center gap-3">
                <span className="text-slate-300 font-black uppercase tracking-widest text-xs">Planning</span>
                <span className="text-[10px] font-bold text-slate-400 bg-slate-700 border border-slate-500 px-2.5 py-0.5 rounded-full">
                  Read-only
                </span>
              </div>

              {/* Grey wash over the table body to reinforce read-only state */}
              <div
                className="bg-slate-100 select-none pointer-events-none"
                style={{ filter: "grayscale(0.55) opacity(0.72)" }}
              >
                {daySlots.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-12 px-6 text-center">
                    <span className="text-sm font-bold text-slate-500">
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
            <div className="mt-5 bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200">
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
                        disabled={!isEditing}
                        value={coachCount}
                        onChange={(e) => handleCountChange("coach", Number(e.target.value))}
                        className="bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg px-2 py-0.5 font-bold text-slate-200 outline-none transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="font-semibold text-slate-400">Exec:</span>
                      <select
                        disabled={!isEditing}
                        value={execCount}
                        onChange={(e) => handleCountChange("exec", Number(e.target.value))}
                        className="bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg px-2 py-0.5 font-bold text-slate-200 outline-none transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="font-semibold text-slate-400">Train:</span>
                      <select
                        disabled={!isEditing}
                        value={trainingCount}
                        onChange={(e) => handleCountChange("training", Number(e.target.value))}
                        className="bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg px-2 py-0.5 font-bold text-slate-200 outline-none transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {[0, 1].map(n => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="font-semibold text-slate-400">Star:</span>
                      <select
                        disabled={!isEditing}
                        value={starCount}
                        onChange={(e) => handleCountChange("star", Number(e.target.value))}
                        className="bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg px-2 py-0.5 font-bold text-slate-200 outline-none transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Clear this day (persists on next Save). No per-day save
                       button — the whole week is saved from the bottom bar. */}
                  {isEditing && (
                    <>
                      <div className="w-px h-5 bg-slate-600 mx-1 shrink-0" />
                      <button
                        onClick={() => clearAllForDay(day)}
                        className="text-red-300 font-extrabold uppercase text-[10px] hover:text-red-200 transition-colors px-2 py-1"
                      >
                        Clear Day
                      </button>
                    </>
                  )}
                </div>
              </div>

              {daySlots.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-12 px-6 text-center">
                  <span className="text-sm font-bold text-slate-700">
                    {workingDays.length === 0
                      ? `No operating days set up for ${branch} yet`
                      : `No schedule set up for ${branch} on ${day}`}
                  </span>
                  <Link
                    href="/manpower-schedule/settings"
                    className="mt-2 text-indigo-600 border border-indigo-200 bg-indigo-50/50 hover:bg-indigo-50 px-4 py-2 rounded-xl font-bold text-xs transition-colors"
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
                  onNoteChange={(key, value) => {
                    pushHistory(`note:${key}`);
                    setDirty(true);
                    setNotes(p => ({ ...p, [key]: value }));
                  }}
                  onClearColumn={clearColumnForDay}
                />
              )}
            </div>

            {/* Summary + Attendance live INSIDE this container so the sticky
                day-tab bar stays pinned all the way down to the attendance table. */}
            <SummaryTable
              title="Weekly Hours Summary"
              showAll={summaryShowAll}
              onToggleShowAll={setSummaryShowAll}
              dayLabel={selectedDay.slice(0, 3).toUpperCase()}
              data={(summaryShowAll ? summaryData["All"] : summaryData[selectedDay]) ?? []}
              colorFor={colorForName}
              dateLabel={summaryDateLabel}
              fullNameFor={fullNameFor}
              collapsed={summaryCollapsed}
              onToggleCollapsed={() => setSummaryCollapsed(c => !c)}
            />

            {(() => {
              const iso = isoDateForDay(startStr, selectedDay);
              const currentFor = (name: string) => (iso ? attnStatus[`${iso}::${name}`] : undefined);
              const savedFor = (name: string) => (iso ? attnSaved[`${iso}::${name}`] : undefined);
              return (
                <AttendanceTable
                  rows={attendanceRows}
                  currentFor={currentFor}
                  savedFor={savedFor}
                  onSet={setAttendanceStatus}
                  onSaveAll={saveAllAttendance}
                  saving={attnSaving}
                  fullNameFor={fullNameFor}
                  editable={true}
                  dateLabel={iso ? fmtNiceDate(iso) : ""}
                  dayLocked={dayLocked}
                  dayLockSaving={dayLockSaving}
                  onToggleDayLock={toggleDayLock}
                  canManageLock={canManageAttendanceLock}
                />
              );
            })()}
          </div>
        ) : (
          /* ── CREATE / VIEW MODE: Single table ── */
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
                  {/* Day tabs */}
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

                  {/* Day title centered */}
                  <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none hidden md:flex">
                    <h2 className="text-sm font-extrabold text-slate-800 m-0 leading-none tracking-tight">
                      {day}
                    </h2>
                    <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider mt-0.5">
                      {dateForDay(startStr, day)}
                    </span>
                  </div>

                  {/* Editing actions on the right — column-count selectors +
                      Clear All. Create/planning mode is always editable; the
                      whole week is saved by the bottom "Save Plan" button. */}
                  <div className="flex items-center gap-3 relative z-10 ml-auto">
                    {isEditing && (
                      <div className="flex items-center gap-3 bg-slate-50 border border-slate-200/60 rounded-xl px-3 py-1.5 shadow-xs text-[11px] select-none whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <span className="font-semibold text-slate-500">Coach:</span>
                          <select
                            value={coachCount}
                            onChange={(e) => handleCountChange("coach", Number(e.target.value))}
                            className="bg-white hover:bg-slate-100 border border-slate-200 rounded-lg px-2 py-0.5 font-bold text-slate-700 outline-none transition-colors cursor-pointer"
                          >
                            {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                              <option key={n} value={n}>{n}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="font-semibold text-slate-500">Exec:</span>
                          <select
                            value={execCount}
                            onChange={(e) => handleCountChange("exec", Number(e.target.value))}
                            className="bg-white hover:bg-slate-100 border border-slate-200 rounded-lg px-2 py-0.5 font-bold text-slate-700 outline-none transition-colors cursor-pointer"
                          >
                            {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                              <option key={n} value={n}>{n}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="font-semibold text-slate-500">Train:</span>
                          <select
                            value={trainingCount}
                            onChange={(e) => handleCountChange("training", Number(e.target.value))}
                            className="bg-white hover:bg-slate-100 border border-slate-200 rounded-lg px-2 py-0.5 font-bold text-slate-700 outline-none transition-colors cursor-pointer"
                          >
                            {[0, 1].map(n => (
                              <option key={n} value={n}>{n}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="font-semibold text-slate-500">Star:</span>
                          <select
                            value={starCount}
                            onChange={(e) => handleCountChange("star", Number(e.target.value))}
                            className="bg-white hover:bg-slate-100 border border-slate-200 rounded-lg px-2 py-0.5 font-bold text-slate-700 outline-none transition-colors cursor-pointer"
                          >
                            {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                              <option key={n} value={n}>{n}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                    {isEditing && (
                      <button
                        onClick={() => clearAllForDay(day)}
                        className="text-red-500 font-extrabold uppercase text-[10px] hover:underline px-2 py-1"
                      >
                        Clear All
                      </button>
                    )}
                  </div>
                </header>

                {daySlots.length === 0 ? (
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

        {/* Summary for create/view modes (update mode renders it inside the
            sticky container above). */}
        {mode !== "update" && (
          <SummaryTable
            title="Weekly Hours Summary"
            showAll={summaryShowAll}
            onToggleShowAll={setSummaryShowAll}
            dayLabel={selectedDay.slice(0, 3).toUpperCase()}
            data={(summaryShowAll ? summaryData["All"] : summaryData[selectedDay]) ?? []}
            colorFor={colorForName}
            dateLabel={summaryDateLabel}
            fullNameFor={fullNameFor}
            collapsed={summaryCollapsed}
            onToggleCollapsed={() => setSummaryCollapsed(c => !c)}
          />
        )}

        {/* ── CREATE / PLANNING: single Save Plan button ── */}
        {mode === "create" && (
          <div className="mt-16 text-center pb-10">
            {errorMsg && (
              <p className="text-sm font-bold text-red-600 mb-4">{errorMsg}</p>
            )}
            <button
              onClick={handleSaveWeeklyPlan}
              disabled={saveState === "saving" || saveState === "saved"}
              className={`px-10 py-3.5 rounded-xl text-sm font-semibold shadow-sm transition-colors ${
                saveState === "saved"
                  ? "bg-emerald-600 text-white"
                  : "bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-60 disabled:cursor-not-allowed"
              }`}
            >
              {saveState === "saving" && "Saving…"}
              {saveState === "saved" && "Saved — Redirecting…"}
              {(saveState === "idle" || saveState === "error") && "Save Plan"}
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
        <PlanNewWeekGridContent userRole={userRole} />
      </Suspense>
    </AppShell>
  );
}
