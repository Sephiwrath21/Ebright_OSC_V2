"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  Home,
  ChevronRight,
  ArrowLeft,
  Pencil,
  User,
  Briefcase,
  Landmark,
  HeartPulse,
} from "lucide-react";
import type { EmployeeDetailFull } from "@/lib/employeeQueries";

type TabKey = "profile" | "employment" | "bank" | "emergency";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "profile", label: "User Profile" },
  { key: "employment", label: "Employment" },
  { key: "bank", label: "Bank Details" },
  { key: "emergency", label: "Emergency Contact" },
];

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-50 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-200 ring-emerald-600/20 dark:ring-emerald-700/40",
  onboarding: "bg-amber-50 dark:bg-amber-900 text-amber-700 dark:text-amber-200 ring-amber-600/20 dark:ring-amber-700/40",
  inactive: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-slate-500/20 dark:ring-slate-600/40",
  archive: "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 ring-zinc-500/20 dark:ring-zinc-600/40",
};
const STATUS_DOT: Record<string, string> = {
  active: "bg-emerald-500",
  onboarding: "bg-amber-500",
  inactive: "bg-slate-400",
  archive: "bg-zinc-500",
};

function getInitials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function statusLabel(s: string | null): string {
  if (!s) return "—";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function EmployeeDetail({ employee }: { employee: EmployeeDetailFull }) {
  const [activeTab, setActiveTab] = useState<TabKey>("profile");
  const statusKey = employee.status ?? "";
  const orgUnitLabel = employee.branchCode
    ? `${employee.branchCode} — ${employee.branchName ?? ""} (Branch)`
    : employee.departmentCode
      ? `${employee.departmentCode} — ${employee.departmentName ?? ""} (Department)`
      : "—";

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950">
      <div className="max-w-5xl mx-auto px-6 pt-4 pb-10">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-6">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 transition-colors">
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/dashboards/hrms" className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors">HRMS</Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/dashboard-employee-management" className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors">Employees</Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 dark:text-slate-100 font-medium truncate max-w-[220px]">{employee.fullName}</span>
        </nav>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <span className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-lg flex items-center justify-center shrink-0">
                {getInitials(employee.fullName)}
              </span>
              <div className="min-w-0">
                <h1 className="text-xl md:text-2xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight truncate">{employee.fullName}</h1>
                <div className="mt-1 flex items-center gap-2 flex-wrap text-sm text-slate-500 dark:text-slate-400">
                  <span className="tabular-nums">{employee.employeeId ?? "No ID"}</span>
                  {employee.nickName && (<><span className="text-slate-300 dark:text-slate-600">·</span><span>{employee.nickName}</span></>)}
                  <span className="text-slate-300 dark:text-slate-600">·</span>
                  <span>{employee.email}</span>
                </div>
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  {employee.role && (
                    <span className="inline-flex items-center rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-700 dark:text-slate-300 ring-1 ring-inset ring-slate-200 dark:ring-slate-700">
                      {employee.role}
                    </span>
                  )}
                  {statusKey && (
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[statusKey] ?? STATUS_STYLES.inactive}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[statusKey] ?? STATUS_DOT.inactive}`} aria-hidden="true" />
                      {statusLabel(statusKey)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <Link
              href={`/dashboard-employee-management/${employee.id}/edit`}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <Pencil className="w-4 h-4" aria-hidden="true" />
              Edit
            </Link>
          </div>
        </div>

        <div className="space-y-6 mt-6">
          {activeTab === "profile" && (
            <Section
              Icon={User}
              title="User Profile"
              description="Personal identity and contact details."
              actions={<TabNav active={activeTab} onChange={setActiveTab} />}
            >
              <Item label="Full Name" value={employee.fullName} span={2} />
              <Item label="Nick Name" value={employee.nickName} />
              <Item label="Email" value={employee.email} />
              <Item label="Phone" value={employee.phone} />
              <Item label="Gender" value={employee.gender} />
              <Item label="Date of Birth" value={formatDate(employee.dob)} />
              <Item label="NRIC" value={employee.nric} mono />
              <Item label="Nationality" value={employee.nationality} />
              <Item label="Home Address" value={employee.homeAddress} span={2} />
            </Section>
          )}

          {activeTab === "employment" && (
            <Section
              Icon={Briefcase}
              title="Employment"
              description="Role, branch, and contract terms."
              actions={<TabNav active={activeTab} onChange={setActiveTab} />}
            >
              <Item label="Employee ID" value={employee.employeeId} mono />
              <Item label="Role" value={employee.role} />
              <Item label="Branch / Department" value={orgUnitLabel} span={2} />
              <Item label="Employment Type" value={employee.employmentType} />
              {employee.role === "PT COACH" && <Item label="Rate" value={employee.rate} />}
              <Item label="Status" value={statusLabel(employee.status)} />
              <Item label="Start Date" value={formatDate(employee.startDate)} />
              <Item label="End Date" value={formatDate(employee.endDate)} />
              <Item label="Probation" value={employee.probation ? "Yes" : "No"} />
            </Section>
          )}

          {activeTab === "bank" && (
            <Section
              Icon={Landmark}
              title="Bank Details"
              description="Used for salary disbursement."
              actions={<TabNav active={activeTab} onChange={setActiveTab} />}
            >
              <Item label="Bank Name" value={employee.bankName} />
              <Item label="Account Holder Name" value={employee.accountName} />
              <Item label="Account Number" value={employee.bankAccount} mono span={2} />
            </Section>
          )}

          {activeTab === "emergency" && (
            <Section
              Icon={HeartPulse}
              title="Emergency Contact"
              description="Person to reach in case of emergency."
              actions={<TabNav active={activeTab} onChange={setActiveTab} />}
            >
              <Item label="Contact Name" value={employee.emergencyName} />
              <Item label="Contact Phone" value={employee.emergencyPhone} />
              <Item label="Relation" value={employee.emergencyRelation} />
            </Section>
          )}
        </div>

        <div className="mt-8">
          <Link
            href="/dashboard-employee-management"
            className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            Back to Employees
          </Link>
        </div>
      </div>
    </div>
  );
}

function TabNav({ active, onChange }: { active: TabKey; onChange: (key: TabKey) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Employee detail sections"
      className="inline-flex items-center gap-1 p-1 rounded-full bg-slate-100 dark:bg-slate-800"
    >
      {TABS.map((t) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.key)}
            className={`h-9 px-5 rounded-full text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${
              isActive
                ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function Section({
  Icon,
  title,
  description,
  actions,
  children,
}: {
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
      <header className="flex items-center gap-3 px-6 py-5 border-b border-slate-100 dark:border-slate-800">
        <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-blue-600 dark:text-blue-300" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{description}</p>
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </header>
      <dl className="p-6 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
        {children}
      </dl>
    </section>
  );
}

function Item({
  label,
  value,
  span = 1,
  mono = false,
}: {
  label: string;
  value: string | null | undefined;
  span?: 1 | 2;
  mono?: boolean;
}) {
  const display = value && String(value).trim() ? String(value) : "—";
  return (
    <div className={span === 2 ? "md:col-span-2" : ""}>
      <dt className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</dt>
      <dd className={`mt-1 text-sm text-slate-900 dark:text-slate-100 ${mono ? "tabular-nums" : ""} break-words`}>
        {display}
      </dd>
    </div>
  );
}
