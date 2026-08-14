"use client";

import Link from "next/link";
import type { ComponentType, SVGProps } from "react";
import {
  Home,
  ChevronRight,
  LayoutGrid,
  FileBarChart,
  Scale,
  Umbrella,
  Clock,
} from "lucide-react";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

interface SubModule {
  id: string;
  title: string;
  description: string;
  href: string;
  Icon: IconComponent;
  accent: string;
  accentHover: string;
}

interface ModuleGroup {
  id: string;
  label: string;
  caption: string;
  items: SubModule[];
}

const groups: ModuleGroup[] = [
  {
    id: "overview",
    label: "Overview",
    caption: "See where the team stands today",
    items: [
      {
        id: "summary",
        title: "Summary",
        description: "Real-time attendance overview across the workforce",
        href: "/attendance/summary",
        Icon: LayoutGrid,
        accent: "bg-blue-600",
        accentHover: "group-hover:bg-blue-700",
      },
      {
        id: "report",
        title: "Report",
        description: "Daily and monthly attendance breakdowns",
        href: "/attendance/report",
        Icon: FileBarChart,
        accent: "bg-violet-600",
        accentHover: "group-hover:bg-violet-700",
      },
    ],
  },
  {
    id: "requests",
    label: "Requests",
    caption: "Submit and review time-off and corrections",
    items: [
      {
        id: "appeal",
        title: "Appeal",
        description: "Raise corrections to attendance records",
        href: "/attendance/appeal",
        Icon: Scale,
        accent: "bg-amber-600",
        accentHover: "group-hover:bg-amber-700",
      },
      {
        id: "leave",
        title: "Leave",
        description: "Apply for annual, medical, and other leave",
        href: "/attendance/leave",
        Icon: Umbrella,
        accent: "bg-emerald-600",
        accentHover: "group-hover:bg-emerald-700",
      },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    caption: "HR-only tools for shaping the workforce schedule",
    items: [
      {
        id: "working-hours",
        title: "Working Hours",
        description: "Edit weekly schedules with effective-from dates; past weeks stay frozen",
        href: "/attendance/working-hours",
        Icon: Clock,
        accent: "bg-indigo-600",
        accentHover: "group-hover:bg-indigo-700",
      },
    ],
  },
];

export default function AttendanceDashboard() {
  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950">
      <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-12">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-6">
          <Link
            href="/home"
            className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 rounded"
          >
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link
            href="/dashboards/hrms"
            className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 rounded"
          >
            HRMS
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 dark:text-slate-100 font-medium">Attendance</span>
        </nav>

        <header className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Attendance Center</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Track time, manage leave, and review the day&rsquo;s activity in one place.</p>
        </header>

        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {groups.flatMap((group) =>
            group.items.map(({ id, title, description, href, Icon, accent, accentHover }) => (
              <li key={id}>
                <Link
                  href={href}
                  className="group block h-full bg-white border border-slate-200 rounded-2xl p-6 transition-all duration-200 hover:border-slate-300 hover:shadow-lg hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:bg-slate-900 dark:border-slate-800 dark:hover:border-slate-700 dark:focus-visible:ring-offset-slate-900"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div
                      className={`${accent} ${accentHover} w-12 h-12 rounded-xl flex items-center justify-center transition-colors duration-200 shrink-0`}
                    >
                      <Icon className="w-6 h-6 text-white" aria-hidden="true" />
                    </div>
                    <ChevronRight
                      className="w-5 h-5 text-slate-300 dark:text-slate-600 transition-all duration-200 group-hover:text-slate-600 dark:group-hover:text-slate-300 group-hover:translate-x-1"
                      aria-hidden="true"
                    />
                  </div>
                  <h3 className="mt-5 text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{description}</p>
                </Link>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
