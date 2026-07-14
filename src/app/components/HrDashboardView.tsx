"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Home,
  ChevronRight,
  Calendar as CalendarIcon,
  RefreshCw,
  UserPlus,
  UserMinus,
  Plane,
  Stethoscope,
  Flag,
  AlertOctagon,
  ExternalLink,
  AlertCircle,
} from "lucide-react";

export interface BasicListItem {
  empNo: string | null;
  name: string;
  branch: string | null;
  role: string | null;
  detail?: string | null;
  date?: string | null;
}

export interface HrDashboardData {
  month: string;
  today: string;
  counts: {
    onboarding: number;
    offboarding: number;
    annualLeave: number;
    mc: number;
    flagged: number;
    mia: number;
    miaUl: number;
    miaMissingToday: number;
  };
  leadsDbAvailable: boolean;
  cards: {
    onboarding: BasicListItem[];
    offboarding: BasicListItem[];
    annualLeave: BasicListItem[];
    mc: BasicListItem[];
    flagged: BasicListItem[];
    mia: BasicListItem[];
  };
}

const ACCENTS = {
  emerald: { bar: "bg-emerald-500", tile: "bg-emerald-50", icon: "text-emerald-600", text: "text-emerald-600" },
  rose: { bar: "bg-rose-500", tile: "bg-rose-50", icon: "text-rose-600", text: "text-rose-600" },
  blue: { bar: "bg-blue-500", tile: "bg-blue-50", icon: "text-blue-600", text: "text-blue-600" },
  amber: { bar: "bg-amber-500", tile: "bg-amber-50", icon: "text-amber-600", text: "text-amber-600" },
  violet: { bar: "bg-violet-500", tile: "bg-violet-50", icon: "text-violet-600", text: "text-violet-600" },
  sky: { bar: "bg-sky-500", tile: "bg-sky-50", icon: "text-sky-600", text: "text-sky-600" },
} as const;

type Accent = keyof typeof ACCENTS;

function todayMyt(): string {
  const m = new Date(Date.now() + 8 * 60 * 60_000);
  return `${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function HrDashboardView({ initialMonth }: { initialMonth: string | null }) {
  const [month, setMonth] = useState(initialMonth ?? todayMyt());
  const [data, setData] = useState<HrDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/hr-dashboard?month=${month}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message ?? "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [month]);

  return (
    <div className="min-h-full bg-slate-50">
      <div className="max-w-7xl mx-auto px-6 pt-4 pb-16 space-y-5">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 transition-colors">
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/dashboards/hrms" className="hover:text-slate-900 transition-colors">HRMS</Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 font-medium">HR Dashboard</span>
        </nav>

        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">HR Dashboard</h1>
            <p className="mt-1 text-sm text-slate-500">
              Onboarding, offboarding, leave, and attendance flags at a glance.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center h-10 rounded-xl border border-slate-200 bg-white px-3 gap-2 text-sm text-slate-700 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
              <CalendarIcon className="w-4 h-4 text-slate-500" aria-hidden="true" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Month</span>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value || todayMyt())}
                className="bg-transparent text-sm font-semibold text-slate-800 focus:outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => setMonth((m) => m)}
              className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
              Refresh
            </button>
          </div>
        </header>

        {error && (
          <div className="flex items-start gap-2 text-sm rounded-xl px-3 py-2.5 font-medium bg-rose-50 text-rose-700 border border-rose-200">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>Failed to load dashboard: {error}</span>
          </div>
        )}

        {!data?.leadsDbAvailable && (
          <div className="flex items-start gap-2 text-xs rounded-xl px-3 py-2 font-medium bg-amber-50 text-amber-800 border border-amber-200">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              <code>LEADS_DB_URL</code> is not configured — autocount name resolution disabled.
              Some PT staff may appear under raw codes (EBPT…, INT…) until you add the URL.
            </span>
          </div>
        )}

        {/* 6-card grid */}
        <section className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          <DashboardCard
            title="Onboarding"
            subtitle="−1 month to +6 months"
            count={data?.counts.onboarding ?? 0}
            accent="emerald"
            Icon={UserPlus}
            items={data?.cards.onboarding ?? []}
            loading={loading}
            dateLabel="Start"
          />
          <DashboardCard
            title="Offboarding"
            subtitle="−1 week to +2 months"
            count={data?.counts.offboarding ?? 0}
            accent="amber"
            Icon={UserMinus}
            items={data?.cards.offboarding ?? []}
            loading={loading}
            dateLabel="End"
          />
          <DashboardCard
            title="Annual Leave"
            subtitle="Today → +14 days"
            count={data?.counts.annualLeave ?? 0}
            accent="blue"
            Icon={Plane}
            items={data?.cards.annualLeave ?? []}
            loading={loading}
            dateLabel="Leave on"
          />
          <DashboardCard
            title="MC"
            subtitle={`Non-AL leave · last 1 month`}
            count={data?.counts.mc ?? 0}
            accent="violet"
            Icon={Stethoscope}
            items={data?.cards.mc ?? []}
            loading={loading}
            dateLabel="Leave on"
          />
          <DashboardCard
            title="Flagged"
            subtitle="> 2 SL this month"
            count={data?.counts.flagged ?? 0}
            accent="rose"
            Icon={Flag}
            items={data?.cards.flagged ?? []}
            loading={loading}
          />
          <DashboardCard
            title="MIA"
            subtitle={`UL last 2 weeks (${data?.counts.miaUl ?? 0}) · Missing today (${data?.counts.miaMissingToday ?? 0})`}
            count={data?.counts.mia ?? 0}
            accent="sky"
            Icon={AlertOctagon}
            items={data?.cards.mia ?? []}
            loading={loading}
          />
        </section>

        <p className="text-xs text-slate-400">
          Data current as of {data?.today ?? "—"} (Asia/Kuala_Lumpur). Read from
          ebright_hrfs: BranchStaff, LeaveTransaction, attendance_justification,
          hikvision_attendance_all.
        </p>
      </div>
    </div>
  );
}

function DashboardCard({
  title,
  subtitle,
  count,
  accent,
  Icon,
  items,
  loading,
  dateLabel,
}: {
  title: string;
  subtitle: string;
  count: number;
  accent: Accent;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  items: BasicListItem[];
  loading: boolean;
  dateLabel?: string;
}) {
  const a = ACCENTS[accent];
  return (
    <div className="relative bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col max-h-[460px]">
      <span className={`absolute top-0 left-0 right-0 h-1 ${a.bar}`} aria-hidden="true" />
      <div className="flex items-start justify-between gap-3 px-5 pt-6 pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className={`${a.tile} w-8 h-8 rounded-lg flex items-center justify-center shrink-0`}>
              <Icon className={`w-4 h-4 ${a.icon}`} aria-hidden="true" />
            </div>
            <p className="text-sm font-bold text-slate-800">{title}</p>
          </div>
          <p className="mt-1 text-[11px] font-medium text-slate-400">{subtitle}</p>
        </div>
        <span className={`text-4xl font-bold tracking-tight tabular-nums ${a.text}`}>
          {loading ? "—" : count}
        </span>
      </div>
      <ul className="overflow-y-auto divide-y divide-slate-100 border-t border-slate-100">
        {loading ? (
          <li className="px-5 py-6 text-center text-xs font-medium text-slate-400">Loading…</li>
        ) : items.length === 0 ? (
          <li className="px-5 py-6 text-center text-xs font-medium text-slate-400">None.</li>
        ) : (
          items.slice(0, 50).map((item, i) => (
            <li
              key={`${item.empNo ?? "_"}-${i}`}
              className="px-5 py-2.5 flex items-center gap-3 hover:bg-slate-50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900 truncate">{item.name}</span>
                  {item.branch && (
                    <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-600 px-1.5 py-0 text-[9px] font-bold uppercase tracking-wide whitespace-nowrap leading-4">
                      {item.branch}
                    </span>
                  )}
                </div>
                <div className="text-[10px] font-medium text-slate-400 mt-0.5">
                  {item.role && <span>{item.role}</span>}
                  {item.role && item.empNo && <span className="mx-1">·</span>}
                  {item.empNo && <span className="font-mono">{item.empNo}</span>}
                  {item.detail && (
                    <>
                      <span className="mx-1">·</span>
                      <span>{item.detail}</span>
                    </>
                  )}
                </div>
              </div>
              {item.date && (
                <span className="text-[10px] text-slate-500 font-mono whitespace-nowrap">
                  {dateLabel ? `${dateLabel} ` : ""}{item.date}
                </span>
              )}
            </li>
          ))
        )}
        {!loading && items.length > 50 && (
          <li className="px-5 py-2.5 text-center text-[11px] font-medium text-slate-400">
            …and {items.length - 50} more.{" "}
            <Link
              href={`#${title.toLowerCase()}-detail`}
              className="text-blue-600 font-semibold hover:underline inline-flex items-center gap-0.5"
            >
              View all <ExternalLink className="w-3 h-3" aria-hidden="true" />
            </Link>
          </li>
        )}
      </ul>
    </div>
  );
}
