"use client";

import Link from "next/link";
import type { ComponentType, SVGProps } from "react";
import {
  Home,
  ChevronRight,
  CalendarPlus,
  LayoutDashboard,
  CalendarCog,
  Archive,
  Settings,
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

const modules: SubModule[] = [
  {
    id: "plan-new-week",
    title: "Plan New Week",
    description: "Build the upcoming week's manpower roster",
    href: "/manpower-schedule/plan-new-week",
    Icon: CalendarPlus,
    accent: "bg-emerald-600",
    accentHover: "group-hover:bg-emerald-700",
  },
  {
    id: "manpower-dashboard",
    title: "Manpower Dashboard",
    description: "See live coverage, gaps, and headcount at a glance",
    href: "/manpower-schedule/dashboard",
    Icon: LayoutDashboard,
    accent: "bg-violet-600",
    accentHover: "group-hover:bg-violet-700",
  },
  {
    id: "update-schedule",
    title: "Update Manpower Schedule",
    description: "Adjust shifts and assignments for active weeks",
    href: "/manpower-schedule/update",
    Icon: CalendarCog,
    accent: "bg-amber-600",
    accentHover: "group-hover:bg-amber-700",
  },
  {
    id: "archive",
    title: "Archive Overview",
    description: "Browse historical schedules and past rosters",
    href: "/manpower-schedule/archive",
    Icon: Archive,
    accent: "bg-sky-600",
    accentHover: "group-hover:bg-sky-700",
  },
  {
    id: "settings",
    title: "Schedule Settings",
    description: "Manage branch active days, customize time slots, and setup duty seats",
    href: "/manpower-schedule/settings",
    Icon: Settings,
    accent: "bg-slate-700",
    accentHover: "group-hover:bg-slate-800",
  },
];

export default function ManpowerPlanningDashboard() {
  return (
    <div className="min-h-full bg-slate-50">
      <div className="max-w-7xl mx-auto px-6 pt-4 pb-12">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 mb-6">
          <Link
            href="/home"
            className="flex items-center gap-1 hover:text-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded"
          >
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link
            href="/dashboards/hrms"
            className="hover:text-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded"
          >
            HRMS
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 font-medium">Manpower Planning</span>
        </nav>

        <header className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Manpower Planning</h1>
          <p className="text-sm text-slate-500 mt-0.5">Plan upcoming weeks, adjust live schedules, and review past rosters.</p>
        </header>

        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {modules.map(({ id, title, description, href, Icon, accent, accentHover }) => (
            <li key={id}>
              <Link
                href={href}
                className="group block h-full bg-white border border-slate-200 rounded-2xl p-6 transition-all duration-200 hover:border-slate-300 hover:shadow-lg hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className={`${accent} ${accentHover} w-12 h-12 rounded-xl flex items-center justify-center transition-colors duration-200 shrink-0`}>
                    <Icon className="w-6 h-6 text-white" aria-hidden="true" />
                  </div>
                  <ChevronRight
                    className="w-5 h-5 text-slate-300 transition-all duration-200 group-hover:text-slate-600 group-hover:translate-x-1"
                    aria-hidden="true"
                  />
                </div>
                <h2 className="mt-5 text-base font-semibold text-slate-900">{title}</h2>
                <p className="mt-1 text-sm text-slate-600 leading-relaxed">{description}</p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
