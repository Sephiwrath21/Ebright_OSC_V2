"use client";

import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { STAGE_LABELS, type EmployeeStage } from "@/lib/employeeStages";
import type { StageLocationSummary } from "@/lib/employeeQueries";

interface Props {
  stage: EmployeeStage;
  groupBy: "branch" | "department";
  locations: StageLocationSummary[];
}

export default function StageLocationsView({ stage, groupBy, locations }: Props) {
  const stageLabel = STAGE_LABELS[stage];

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-4 pb-10">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-6">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 transition-colors dark:hover:text-slate-100">
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/employee-folder" className="hover:text-slate-900 transition-colors dark:hover:text-slate-100">
            Employee Overview
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 font-medium dark:text-slate-100">{stageLabel}</span>
        </nav>

        <div
          className="bg-white rounded-[12px] p-6 dark:bg-slate-900 dark:ring-1 dark:ring-white/10 shadow-[0_2px_6px_rgba(0,0,0,0.12),0_8px_20px_rgba(0,0,0,0.10)]"
          style={{ border: "0.5px solid var(--border-neutral)" }}
        >
          <div className="flex gap-2 mb-6">
            <Link
              href={`/employee-folder/${stage}?by=branch`}
              className={`min-h-11 flex items-center px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                groupBy === "branch" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              By Branch
            </Link>
            <Link
              href={`/employee-folder/${stage}?by=department`}
              className={`min-h-11 flex items-center px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                groupBy === "department" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              By Department
            </Link>
          </div>

          <h1 className="text-2xl font-medium text-slate-900 mb-4 dark:text-slate-100">{groupBy === "branch" ? "Branch" : "Department"}</h1>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {locations.map((loc) => (
              <Link
                key={loc.code}
                href={`/employee-folder/${stage}/${groupBy}/${loc.code}`}
                className="flex items-center justify-between gap-3 py-4 hover:bg-slate-50 -mx-2 px-2 rounded-lg transition-colors dark:hover:bg-slate-800"
              >
                <span className="text-slate-900 font-medium dark:text-slate-100">{loc.name}</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-400 tabular-nums">{loc.count}</span>
                  <ChevronRight className="w-5 h-5 text-slate-400" aria-hidden="true" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
