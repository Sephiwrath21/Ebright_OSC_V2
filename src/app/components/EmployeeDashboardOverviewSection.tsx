"use client";

import { Users, Building2, Network, UserPlus } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

/**
 * Employee Dashboard org overview cards.
 *   - 4 stat cards: Total Staff / Branches / Departments / Onboarding.
 *   - Every card is clickable and acts as a quick-filter for the employee
 *     list below (the parent EmployeeListView owns the filter state):
 *       Total Staff  → all employees (clears filters)
 *       Branches     → branch staff (non-HQ)
 *       Departments  → HQ / department staff
 *       Onboarding   → staff with onboarding status
 *   - The active card is highlighted; clicking it again clears the filter.
 *
 * Pure presentational — no fetching, no local filter state. The parent owns
 * the active box + click handler so the cards and the list stay in sync.
 * Box design, labels, colors, and icons are unchanged from the original.
 */

export interface OverviewStats {
  totalStaff: number;
  branchCount: number;
  departmentCount: number;
  onboardingActive: number;
  onboardingCompleted: number;
}

export type EmployeeBoxKey = "total" | "branches" | "departments" | "onboarding";

interface Props {
  stats: OverviewStats;
  activeBox: EmployeeBoxKey | null;
  onBoxClick: (key: EmployeeBoxKey) => void;
}

export function EmployeeDashboardOverviewSection({ stats, activeBox, onBoxClick }: Props) {
  return (
    <div className="mb-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Staff"
          value={stats.totalStaff}
          subtitle="Active accounts"
          accentClass="bg-blue-500"
          Icon={Users}
          onClick={() => onBoxClick("total")}
          isActive={activeBox === "total"}
        />
        <StatCard
          label="Branches"
          value={stats.branchCount}
          subtitle="HQ + others"
          accentClass="bg-violet-500"
          Icon={Building2}
          onClick={() => onBoxClick("branches")}
          isActive={activeBox === "branches"}
        />
        <StatCard
          label="Departments"
          value={stats.departmentCount}
          subtitle="Across branches"
          accentClass="bg-teal-500"
          Icon={Network}
          onClick={() => onBoxClick("departments")}
          isActive={activeBox === "departments"}
        />
        <StatCard
          label="Onboarding"
          value={stats.onboardingActive}
          subtitle="Active candidates"
          accentClass="bg-amber-500"
          Icon={UserPlus}
          onClick={() => onBoxClick("onboarding")}
          isActive={activeBox === "onboarding"}
        />
      </div>
    </div>
  );
}

// ─── Stat Card ───
function StatCard({
  label,
  value,
  subtitle,
  accentClass,
  Icon,
  onClick,
  isActive = false,
}: {
  label: string;
  value: number;
  subtitle: string;
  accentClass: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  onClick?: () => void;
  isActive?: boolean;
}) {
  const isClickable = typeof onClick === "function";

  const body = (
    <>
      <div className={`absolute top-0 left-0 right-0 h-[3px] ${accentClass}`} aria-hidden="true" />
      <Icon
        className="absolute top-3 right-3 w-10 h-10 text-slate-200 dark:text-slate-800 pointer-events-none"
        aria-hidden="true"
      />
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100 tabular-nums leading-none">{value}</p>
      <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">{subtitle}</p>
    </>
  );

  const baseClasses =
    "relative bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-2xl p-4 overflow-hidden transition";
  const stateClasses = isClickable
    ? `cursor-pointer hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-md text-left w-full ${
        isActive ? "border-slate-400 dark:border-slate-500 shadow-md ring-2 ring-slate-200 dark:ring-slate-700" : "border-slate-200 dark:border-slate-800"
      }`
    : "border-slate-200 dark:border-slate-800";

  if (isClickable) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={isActive}
        className={`${baseClasses} ${stateClasses}`}
      >
        {body}
      </button>
    );
  }

  return <div className={`${baseClasses} ${stateClasses}`}>{body}</div>;
}
