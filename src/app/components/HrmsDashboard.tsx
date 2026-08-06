"use client";

import Link from "next/link";
import type { ComponentType, SVGProps } from "react";
import {
  LayoutDashboard,
  CalendarRange,
  Receipt,
  CalendarCheck,
  UserPlus,
  UserMinus,
  PiggyBank,
  Users,
  Home,
  ChevronRight,
  Sparkles,
  Workflow,
  FolderOpen,
} from "lucide-react";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

const MANAGE_INDUCTION_ROLE_TYPES = new Set(["superadmin", "hr", "od"]);
const WORKFLOW_CENTER_ROLE_TYPES = new Set(["superadmin", "admin", "hr", "od", "hod"]);

interface HrmsModule {
  id: string;
  title: string;
  description: string;
  href: string;
  Icon: IconComponent;
  accent: string;
  accentHover: string;
  /** Coarse role gate (induction-type tiles). */
  requiredRoles?: ReadonlySet<string>;
  /** Access-Management feature this tile requires `view` on. */
  feature?: string;
}

const modules: HrmsModule[] = [
  {
    id: "employee-dashboard",
    title: "Employee Dashboard",
    description: "View and manage all employees",
    href: "/dashboard-employee-management",
    Icon: LayoutDashboard,
    accent: "bg-blue-600",
    accentHover: "group-hover:bg-blue-700",
    feature: "employee_dashboard",
  },
  {
    id: "manpower-planning",
    title: "Manpower Planning",
    description: "Schedule shifts and plan staffing",
    href: "/manpower-schedule",
    Icon: CalendarRange,
    accent: "bg-violet-600",
    accentHover: "group-hover:bg-violet-700",
    feature: "manpower_plan",
  },
  {
    id: "claims",
    title: "Claims",
    description: "Submit and approve expense claims",
    href: "/claim",
    Icon: Receipt,
    accent: "bg-emerald-600",
    accentHover: "group-hover:bg-emerald-700",
    feature: "claim",
  },
  {
    id: "attendance",
    title: "Attendance",
    description: "Track clock-in, leaves, and hours",
    href: "/attendance",
    Icon: CalendarCheck,
    accent: "bg-amber-600",
    accentHover: "group-hover:bg-amber-700",
    feature: "attendance_overview",
  },
  {
    id: "hr-dashboard",
    title: "HR Dashboard",
    description: "Overview of onboarding, offboarding, MC & leave",
    href: "/induction/hr-dashboard",
    Icon: LayoutDashboard,
    accent: "bg-blue-600",
    accentHover: "group-hover:bg-blue-700",
    requiredRoles: MANAGE_INDUCTION_ROLE_TYPES,
  },
  {
    id: "manpower-cost-report",
    title: "Manpower Cost Report",
    description: "Breakdown of labor costs",
    href: "/manpower-cost-report",
    Icon: PiggyBank,
    accent: "bg-teal-600",
    accentHover: "group-hover:bg-teal-700",
    feature: "manpower_cost",
  },
  // Induction Control Centre tile removed in Phase D — induction management
  // is now done directly from the Onboarding tile (HR onboarding dashboard).
  {
    id: "onboarding",
    title: "Onboarding",
    description: "Manage new employee inductions",
    href: "/induction/onboarding-dashboard?type=onboarding",
    Icon: UserPlus,
    accent: "bg-emerald-600",
    accentHover: "group-hover:bg-emerald-700",
    requiredRoles: MANAGE_INDUCTION_ROLE_TYPES,
  },
  {
    id: "offboarding",
    title: "Offboarding",
    description: "Manage employee exits",
    href: "/dashboards/offboarding",
    Icon: UserMinus,
    accent: "bg-rose-600",
    accentHover: "group-hover:bg-rose-700",
    requiredRoles: MANAGE_INDUCTION_ROLE_TYPES,
  },
  {
    id: "induction-training",
    title: "Induction Training",
    description: "Open the interactive 3-day training experience",
    href: "/onboarding-preview/index.html",
    Icon: Sparkles,
    accent: "bg-pink-600",
    accentHover: "group-hover:bg-pink-700",
    requiredRoles: MANAGE_INDUCTION_ROLE_TYPES,
  },
  {
    id: "workflow-center",
    title: "Workflow Center",
    description: "Manage department onboarding workflows",
    href: "/dashboards/workflow-center",
    Icon: Workflow,
    accent: "bg-violet-600",
    accentHover: "group-hover:bg-violet-700",
    requiredRoles: WORKFLOW_CENTER_ROLE_TYPES,
  },
  {
    id: "staff-directory",
    title: "Staff Directory",
    description: "Browse staff contacts and details",
    href: "/staff-directory",
    Icon: Users,
    accent: "bg-indigo-600",
    accentHover: "group-hover:bg-indigo-700",
    feature: "staff_directory",
  },
  // No `feature` gate — see Sidebar.tsx's matching Employee Folder entry
  // for why (its real access control is employeeScope.ts, not the
  // role_permission matrix this tile's feature key checks against).
  {
    id: "employee-folder",
    title: "Employee Folder",
    description: "Access individual employee records and documents",
    href: "/employee-folder",
    Icon: FolderOpen,
    accent: "bg-cyan-600",
    accentHover: "group-hover:bg-cyan-700",
  },
];

interface HrmsDashboardProps {
  role?: string | null;
  /** Access-Management features the viewer has `view` on. */
  features?: string[];
  /** superadmin/ceo — sees every tile. */
  privileged?: boolean;
}

export default function HrmsDashboard({
  role,
  features = [],
  privileged = false,
}: HrmsDashboardProps = {}) {
  const normalizedRole = (role ?? "").toLowerCase();
  const granted = new Set(features);
  const visibleModules = modules.filter((m) => {
    if (privileged) return true;
    // Coarse role-gated tiles (onboarding/offboarding/etc.) keep their role check.
    if (m.requiredRoles) return m.requiredRoles.has(normalizedRole);
    // Feature-gated tiles must have the Access-Management grant.
    if (m.feature) return granted.has(m.feature);
    return true;
  });

  return (
    <div className="min-h-full bg-slate-50">
      <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-10">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 mb-6">
          <Link
            href="/home"
            className="flex items-center gap-1 hover:text-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded"
          >
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 font-medium">HRMS</span>
        </nav>

        <header className="mb-10">
          <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight">
            Human Resource Management
          </h1>
        </header>

        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {visibleModules.map(({ id, title, description, href, Icon, accent, accentHover }) => (
            <li key={id}>
              <Link
                href={href}
                className="group block h-full bg-white border border-slate-200 rounded-2xl p-6 transition-all duration-200 hover:border-slate-300 hover:shadow-lg hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                <div className="flex items-start justify-between gap-4">
                  <div
                    className={`${accent} ${accentHover} w-12 h-12 rounded-xl flex items-center justify-center transition-colors duration-200 shrink-0`}
                  >
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
