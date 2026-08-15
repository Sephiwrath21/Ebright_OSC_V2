"use client";

import { useMemo, useState } from "react";
import {
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

interface WeekSelectorProps {
  onConfirm: (weekData: string) => void;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function WeekSelector({ onConfirm }: WeekSelectorProps) {
  const today = useMemo(() => new Date(), []);
  const [viewDate, setViewDate] = useState<Date>(today);
  const [pickedDate, setPickedDate] = useState<Date>(today);

  const yearOptions = useMemo(() => {
    const y = today.getFullYear();
    return Array.from({ length: 7 }, (_, i) => y - 2 + i);
  }, [today]);

  const weekStart = useMemo(
    () => startOfWeek(pickedDate, { weekStartsOn: 1 }),
    [pickedDate],
  );
  const weekEnd = useMemo(
    () => endOfWeek(pickedDate, { weekStartsOn: 1 }),
    [pickedDate],
  );

  const grid = useMemo(() => {
    const monthStart = startOfMonth(viewDate);
    const monthEnd = endOfMonth(viewDate);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const days: Date[] = [];
    const cursor = new Date(gridStart);
    while (cursor <= gridEnd) {
      days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }, [viewDate]);

  const handleConfirm = () => {
    onConfirm(
      `start=${format(weekStart, "yyyy-MM-dd")}&end=${format(weekEnd, "yyyy-MM-dd")}`,
    );
  };

  const setMonth = (m: number) => {
    const next = new Date(viewDate);
    next.setMonth(m);
    setViewDate(next);
  };
  const setYear = (y: number) => {
    const next = new Date(viewDate);
    next.setFullYear(y);
    setViewDate(next);
  };

  return (
    <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-[0_8px_30px_rgba(15,23,42,0.04)] p-7">
      <h2 className="text-center text-xl font-bold tracking-wide text-slate-900 dark:text-slate-100 uppercase">
        Select a Week
      </h2>

      <div className="mt-6 flex gap-2 bg-slate-50 dark:bg-slate-950 rounded-xl p-1.5">
        <div className="flex-1 h-11 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-sm font-semibold text-slate-700 dark:text-slate-300">
          {format(weekStart, "dd MMM yyyy")}
        </div>
        <div className="flex-1 h-11 rounded-lg bg-white dark:bg-slate-900 border-2 border-blue-500 flex items-center justify-center text-sm font-semibold text-slate-900 dark:text-slate-100 shadow-sm shadow-blue-100">
          {format(weekEnd, "dd MMM yyyy")}
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setViewDate(addMonths(viewDate, -1))}
          className="w-9 h-9 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2">
          <DropdownPill>
            <select
              value={viewDate.getMonth()}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="appearance-none bg-transparent text-sm font-semibold text-slate-800 dark:text-slate-200 pr-1 pl-1 py-1.5 cursor-pointer focus:outline-none"
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i}>{m}</option>
              ))}
            </select>
          </DropdownPill>
          <DropdownPill>
            <select
              value={viewDate.getFullYear()}
              onChange={(e) => setYear(Number(e.target.value))}
              className="appearance-none bg-transparent text-sm font-semibold text-slate-800 dark:text-slate-200 pr-1 pl-1 py-1.5 cursor-pointer focus:outline-none"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </DropdownPill>
        </div>

        <button
          type="button"
          onClick={() => setViewDate(addMonths(viewDate, 1))}
          className="w-9 h-9 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center transition-colors"
          aria-label="Next month"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="mt-6">
        <div
          style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", rowGap: "4px" }}
        >
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="text-[11px] font-medium text-slate-400 text-center pb-3 uppercase tracking-wider">
              {d}
            </div>
          ))}
          {grid.map((d) => {
            const inMonth = isSameMonth(d, viewDate);
            const inWeek = inMonth && d >= weekStart && d <= weekEnd;
            const isToday = isSameDay(d, today);
            const dow = d.getDay();
            const isMon = dow === 1;
            const isSun = dow === 0;

            let cellCls = "h-10 flex items-center justify-center text-sm cursor-pointer select-none transition-colors";
            const cellStyle: React.CSSProperties = {};
            if (inWeek) {
              cellCls += " bg-blue-500 hover:bg-blue-600 text-white font-semibold";
              if (isMon) {
                cellStyle.borderTopLeftRadius = "9999px";
                cellStyle.borderBottomLeftRadius = "9999px";
              }
              if (isSun) {
                cellStyle.borderTopRightRadius = "9999px";
                cellStyle.borderBottomRightRadius = "9999px";
              }
            } else if (!inMonth) {
              cellCls += " text-slate-300 dark:text-slate-600 hover:text-slate-400 dark:hover:text-slate-400";
              cellStyle.borderRadius = "9999px";
            } else if (dow === 5 || dow === 6) {
              cellCls += " text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900 font-medium";
              cellStyle.borderRadius = "9999px";
            } else {
              cellCls += " text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium";
              cellStyle.borderRadius = "9999px";
            }

            return (
              <button
                key={d.toISOString()}
                type="button"
                onClick={() => {
                  setPickedDate(d);
                  if (!inMonth) setViewDate(d);
                }}
                className={cellCls}
                style={cellStyle}
              >
                <span className={isToday && !inWeek ? "underline underline-offset-[6px] decoration-2 decoration-blue-500" : ""}>
                  {d.getDate()}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={handleConfirm}
        className="mt-7 w-full h-12 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl font-bold uppercase tracking-wider text-[13px] shadow-lg shadow-blue-200 transition-colors"
      >
        Confirm Week: {format(weekStart, "dd MMM yyyy").toUpperCase()} – {format(weekEnd, "dd MMM yyyy").toUpperCase()}
      </button>
    </div>
  );
}

function DropdownPill({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative inline-flex items-center gap-1 px-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
      {children}
      <ChevronDown className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 pointer-events-none flex-shrink-0" />
    </div>
  );
}
