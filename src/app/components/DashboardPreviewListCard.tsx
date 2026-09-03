"use client";

import type { ReactNode } from "react";
import { initialsFromName } from "@/lib/text";

export interface PreviewRow {
  id: string | number;
  name: string;
  subLabel: string;
  /** Optional right-aligned slot — e.g. Employee Records' stage dot+label. */
  trailing?: ReactNode;
}

interface Props {
  title: string;
  badgeText: string;
  /** Tailwind bg+text classes shared by the count badge and each row's
   *  avatar circle — one accent per card (2026-08-26, see conversation:
   *  reference screenshot uses a distinct color per card). */
  accentClass: string;
  rows: PreviewRow[];
  emptyText: string;
  viewAllLabel: string;
  onViewAll: () => void;
}

// Shared "compact preview list" card for the /home dashboard's new Employee
// Overview section (2026-08-26, see conversation) — same container/row/
// button style for both the "Not Clicked Task" and "Employee Records" cards
// so the two sit consistently side by side, per the reference mockup's own
// "card style unchanged" note.
export default function DashboardPreviewListCard({ title, badgeText, accentClass, rows, emptyText, viewAllLabel, onViewAll }: Props) {
  return (
    <div
      className="flex h-full flex-col bg-white dark:bg-slate-900 rounded-[16px] shadow-[0_2px_6px_rgba(0,0,0,0.12),0_8px_20px_rgba(0,0,0,0.10)] p-5"
      style={{ border: "0.5px solid var(--border-neutral)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">{title}</h3>
        <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${accentClass}`}>{badgeText}</span>
      </div>

      {rows.length === 0 ? (
        <p className="flex-1 py-6 text-center text-sm text-slate-400 dark:text-slate-500">{emptyText}</p>
      ) : (
        <ul className="flex-1 space-y-3 mb-4">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${accentClass}`}>
                {initialsFromName(row.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{row.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{row.subLabel}</p>
              </div>
              {row.trailing}
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={onViewAll}
        className="w-full h-11 shrink-0 rounded-lg border-2 border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
      >
        {viewAllLabel}
      </button>
    </div>
  );
}
