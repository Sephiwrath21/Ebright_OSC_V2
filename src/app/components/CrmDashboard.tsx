"use client";

import Link from "next/link";
import type { ComponentType, SVGProps } from "react";
import { Phone, Ticket, Home, ChevronRight } from "lucide-react";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

interface CrmModule {
  id: string;
  title: string;
  description: string;
  href: string;
  Icon: IconComponent;
  accent: string;
  accentHover: string;
}

const modules: CrmModule[] = [
  {
    id: "lead",
    title: "Lead",
    description: "Track and manage sales leads",
    href: "/crm/lead",
    Icon: Phone,
    accent: "bg-blue-600",
    accentHover: "group-hover:bg-blue-700",
  },
  {
    id: "ticket",
    title: "Ticket",
    description: "Handle customer support tickets",
    href: "/crm/ticket",
    Icon: Ticket,
    accent: "bg-amber-600",
    accentHover: "group-hover:bg-amber-700",
  },
];

export default function CrmDashboard() {
  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950">
      <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-10">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 mb-6 dark:text-slate-400">
          <Link
            href="/home"
            className="flex items-center gap-1 hover:text-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded dark:hover:text-slate-100 dark:focus-visible:ring-offset-slate-950"
          >
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 font-medium dark:text-slate-100">CNS</span>
        </nav>

        <header className="mb-10">
          <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight dark:text-slate-100">
            Client Nexus System
          </h1>
        </header>

        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {modules.map(({ id, title, description, href, Icon, accent, accentHover }) => (
            <li key={id}>
              <Link
                href={href}
                className="group block h-full bg-white border border-slate-200 rounded-2xl p-6 transition-all duration-200 hover:border-slate-300 hover:shadow-lg hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:bg-slate-900 dark:border-slate-800 dark:hover:border-slate-700 dark:focus-visible:ring-offset-slate-950"
              >
                <div className="flex items-start justify-between gap-4">
                  <div
                    className={`${accent} ${accentHover} w-12 h-12 rounded-xl flex items-center justify-center transition-colors duration-200 shrink-0`}
                  >
                    <Icon className="w-6 h-6 text-white" aria-hidden="true" />
                  </div>
                  <ChevronRight
                    className="w-5 h-5 text-slate-300 transition-all duration-200 group-hover:text-slate-600 group-hover:translate-x-1 dark:text-slate-600 dark:group-hover:text-slate-300"
                    aria-hidden="true"
                  />
                </div>
                <h2 className="mt-5 text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
                <p className="mt-1 text-sm text-slate-600 leading-relaxed dark:text-slate-300">{description}</p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
