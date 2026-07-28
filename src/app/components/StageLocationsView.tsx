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
    <div className="min-h-full bg-slate-50">
      <div className="max-w-3xl mx-auto px-6 pt-4 pb-10">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 mb-6">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 transition-colors">
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/employee-folder" className="hover:text-slate-900 transition-colors">
            Employee Overview
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 font-medium">{stageLabel}</span>
        </nav>

        <div className="bg-white rounded-[27px] p-6">
          <div className="flex gap-2 mb-6">
            <Link
              href={`/employee-folder/${stage}?by=branch`}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                groupBy === "branch" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              By Branch
            </Link>
            <Link
              href={`/employee-folder/${stage}?by=department`}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                groupBy === "department" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              By Department
            </Link>
          </div>

          <h1 className="text-2xl font-medium text-slate-900 mb-4">{groupBy === "branch" ? "Branch" : "Department"}</h1>

          <div className="divide-y divide-slate-100">
            {locations.map((loc) => (
              <Link
                key={loc.code}
                href={`/employee-folder/${stage}/${groupBy}/${loc.code}`}
                className="flex items-center justify-between gap-3 py-4 hover:bg-slate-50 -mx-2 px-2 rounded-lg transition-colors"
              >
                <span className="text-slate-900 font-medium">{loc.name}</span>
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
