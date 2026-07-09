"use client";

import Link from "next/link";

interface DashboardCard {
  id: string;
  title: string;
  icon: string;
  color: string;
  items: {
    name: string;
    href: string;
    icon: string;
  }[];
}

const dashboards: DashboardCard[] = [
  {
    id: "library",
    title: "Library",
    icon: "📚",
    color: "bg-purple-500",
    items: [
      { name: "Documents", href: "#", icon: "📄" },
      { name: "Resources", href: "#", icon: "📁" },
    ],
  },
  {
    id: "internal-dashboard",
    title: "Internal Dashboard",
    icon: "📊",
    color: "bg-green-500",
    items: [
      { name: "Analytics", href: "#", icon: "📈" },
      { name: "Reports", href: "#", icon: "📋" },
    ],
  },
  {
    id: "hrms",
    title: "HRMS",
    icon: "👥",
    color: "bg-blue-500",
    items: [
      { name: "Employee Dashboard", href: "/dashboard-employee-management", icon: "📊" },
      { name: "Manpower Planning", href: "/manpower-schedule", icon: "🗂️" },
      { name: "Attendance", href: "/attendance", icon: "📅" },
      { name: "Claims", href: "/claims", icon: "💰" },
      { name: "Manpower Cost Report", href: "/manpower-cost-report", icon: "💸" },
    ],
  },
  {
    id: "crm",
    title: "CRM",
    icon: "📰",
    color: "bg-yellow-500",
    items: [
      { name: "Lead", href: "/crm/lead", icon: "📞" },
      { name: "Ticket", href: "/crm/ticket", icon: "🎫" },
    ],
  },
  {
    id: "sms",
    title: "SMS",
    icon: "🧑‍🎓",
    color: "bg-indigo-500",
    items: [
      { name: "Students", href: "#", icon: "🧑‍🎓" },
      { name: "Enrollment", href: "#", icon: "📝" },
    ],
  },
  {
    id: "inventory",
    title: "Inventory",
    icon: "📦",
    color: "bg-pink-500",
    items: [
      { name: "Stock Management", href: "#", icon: "📊" },
      { name: "Warehouse", href: "#", icon: "🏭" },
    ],
  },
  {
    id: "academy",
    title: "Academy",
    icon: "🎓",
    color: "bg-indigo-600",
    items: [
      { name: "Event Management", href: "/academy", icon: "📅" },
      { name: "Courses", href: "#", icon: "📖" },
    ],
  },
  {
    id: "clickup",
    title: "ClickUp Tasks",
    icon: "✅",
    color: "bg-teal-500",
    items: [
      { name: "Branch Dashboards", href: "/clickup-dashboard", icon: "🏢" },
      { name: "Operations by Day", href: "/clickup-dashboard/operations", icon: "📅" },
    ],
  },
];

export default function DashboardHome({ userRole }: { userRole?: string; userEmail?: string }) {
  const isSuperadmin = userRole === "superadmin";
  const isAdmin = userRole === "admin";
  const restrictedForAdmin = new Set<string>([]);

  const isLocked = (id: string) => {
    if (isSuperadmin) return false;
    if (isAdmin && restrictedForAdmin.has(id)) return true;
    return false;
  };

  const accessibleCount = dashboards.filter((d) => !isLocked(d.id)).length;

  return (
    <div className="min-h-full bg-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-10">
        <header className="mb-10">
          <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 tracking-tight">Welcome</h1>
          <p className="mt-1 text-sm text-slate-500">
            {accessibleCount} accessible dashboard{accessibleCount !== 1 ? "s" : ""}
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {dashboards.map((dashboard) => {
            const isDisabled = isLocked(dashboard.id);
            const targetHref = dashboard.id === "academy" ? "/academy" : dashboard.id === "sms" ? "/sms" : dashboard.id === "clickup" ? "/clickup-dashboard" : `/dashboards/${dashboard.id}`;
            const href = isDisabled ? "#" : targetHref;

            return (
              <Link key={dashboard.id} href={href} aria-disabled={isDisabled} className={isDisabled ? "pointer-events-none" : ""}>
                <div className={`p-3 rounded-lg flex items-center justify-center gap-3 aspect-square transition-all duration-300
                  ${isDisabled ? "bg-slate-300 text-slate-500 opacity-60 grayscale" : `${dashboard.color} text-white hover:shadow-lg hover:scale-105`}
                `}>
                  <div className="text-center">
                    <span className="text-2xl block mb-1">{dashboard.icon}</span>
                    <h2 className="text-sm font-bold">{dashboard.title}</h2>
                    {isDisabled && (
                      <span className="text-[10px] uppercase font-black tracking-widest mt-2 block bg-slate-400/20 px-2 py-1 rounded">Locked</span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
