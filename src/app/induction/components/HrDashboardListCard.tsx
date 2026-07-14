import Link from "next/link";
import type { ReactNode } from "react";

// 6-card layout for /induction/hr-dashboard. Each card:
//   - Header: title (colored) + small "window" label + flexible right-side
//     stat chips (PT/FT/INT split) and/or one big-number stat.
//   - Body: scrollable item list with name (bold) + meta line + right-side
//     date + relative-time. Each item can have a small status chip.
//   - Footer: "View All N Records →" link in matching color.
//
// Five themes (emerald/rose/violet/amber/sky) cover the 6 cards in the
// reference layout. Full class strings live in THEMES so Tailwind JIT keeps
// every utility in the build.

export type DashboardCardAccent =
  | "emerald"
  | "rose"
  | "violet"
  | "amber"
  | "sky";

interface AccentTheme {
  border: string;
  titleText: string;
  labelText: string;
  totalText: string;
  totalBg: string;
  totalBorder: string;
  rowAccentBar: string;
  rowAccentBg: string;
  chipBg: string;
  chipText: string;
  chipBorder: string;
  footer: string;
  hoverRow: string;
}

const THEMES: Record<DashboardCardAccent, AccentTheme> = {
  emerald: {
    border: "border-slate-200",
    titleText: "text-emerald-700",
    labelText: "text-slate-500",
    totalText: "text-emerald-700",
    totalBg: "bg-emerald-50",
    totalBorder: "border-emerald-200",
    rowAccentBar: "before:bg-emerald-500",
    rowAccentBg: "bg-emerald-50/50",
    chipBg: "bg-emerald-50",
    chipText: "text-emerald-700",
    chipBorder: "border-emerald-200",
    footer: "text-emerald-600 hover:text-emerald-800",
    hoverRow: "hover:bg-emerald-50/30",
  },
  rose: {
    border: "border-slate-200",
    titleText: "text-rose-700",
    labelText: "text-slate-500",
    totalText: "text-rose-700",
    totalBg: "bg-rose-50",
    totalBorder: "border-rose-200",
    rowAccentBar: "before:bg-rose-500",
    rowAccentBg: "bg-rose-50/50",
    chipBg: "bg-rose-50",
    chipText: "text-rose-700",
    chipBorder: "border-rose-200",
    footer: "text-rose-600 hover:text-rose-800",
    hoverRow: "hover:bg-rose-50/30",
  },
  violet: {
    border: "border-slate-200",
    titleText: "text-violet-700",
    labelText: "text-slate-500",
    totalText: "text-violet-700",
    totalBg: "bg-violet-50",
    totalBorder: "border-violet-200",
    rowAccentBar: "before:bg-violet-500",
    rowAccentBg: "bg-violet-50/50",
    chipBg: "bg-violet-50",
    chipText: "text-violet-700",
    chipBorder: "border-violet-200",
    footer: "text-violet-600 hover:text-violet-800",
    hoverRow: "hover:bg-violet-50/30",
  },
  amber: {
    border: "border-slate-200",
    titleText: "text-amber-700",
    labelText: "text-slate-500",
    totalText: "text-amber-700",
    totalBg: "bg-amber-50",
    totalBorder: "border-amber-200",
    rowAccentBar: "before:bg-amber-500",
    rowAccentBg: "bg-amber-50/50",
    chipBg: "bg-amber-50",
    chipText: "text-amber-700",
    chipBorder: "border-amber-200",
    footer: "text-amber-600 hover:text-amber-800",
    hoverRow: "hover:bg-amber-50/30",
  },
  sky: {
    border: "border-slate-200",
    titleText: "text-sky-700",
    labelText: "text-slate-500",
    totalText: "text-sky-700",
    totalBg: "bg-sky-50",
    totalBorder: "border-sky-200",
    rowAccentBar: "before:bg-sky-500",
    rowAccentBg: "bg-sky-50/50",
    chipBg: "bg-sky-50",
    chipText: "text-sky-700",
    chipBorder: "border-sky-200",
    footer: "text-sky-600 hover:text-sky-800",
    hoverRow: "hover:bg-sky-50/30",
  },
};

export interface HrDashboardItem {
  /** Stable key for React. */
  key: string;
  /** Main row title — e.g. "AADESH ABHAYAPRADA A/L BALAMURUG..." */
  name: string;
  /** Secondary line — "PT Coach · EGR" or "BM · KW · SL · MC-Abdominal cramps". */
  meta?: string | null;
  /** Right-side date string e.g. "27 Jun 2026". */
  date?: string | null;
  /** Right-side relative tag below the date — "in 3d" / "4d ago" / "Today". */
  relative?: string | null;
  /** Highlight color band on the left of the row (per item). */
  highlight?: boolean;
  /** Small inline status chip rendered after the name (e.g. "SL", "MC"). */
  statusChip?: string | null;
}

export interface HrDashboardStat {
  /** Big number. */
  value: number | string;
  /** Tiny label below or beside, e.g. "TOTAL", "PT", "FT", "INT". */
  label: string;
  /** Visual emphasis — set "primary" for the big-number stat. */
  emphasis?: "primary" | "minor";
}

export function HrDashboardListCard({
  accent,
  title,
  windowLabel,
  stats,
  items,
  viewAllHref,
  viewAllLabel,
  emptyText = "No records.",
}: {
  accent: DashboardCardAccent;
  title: string;
  windowLabel: string;
  /** Right-side header stats. Order: minor chips first, then primary. */
  stats: HrDashboardStat[];
  items: HrDashboardItem[];
  viewAllHref?: string;
  viewAllLabel?: string;
  emptyText?: string;
}) {
  const t = THEMES[accent];
  const totalLabel = viewAllLabel ?? `View All ${items.length} Records`;
  return (
    <div className={`bg-white rounded-2xl border ${t.border} shadow-sm overflow-hidden flex flex-col max-h-[400px]`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-5 py-3 border-b border-slate-100">
        <div className="min-w-0">
          <h3 className={`text-sm font-extrabold uppercase tracking-wider ${t.titleText}`}>
            {title}
          </h3>
          <p className={`mt-0.5 text-[10px] font-semibold uppercase tracking-wider ${t.labelText}`}>
            {windowLabel}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {stats.map((s, i) => {
            const isPrimary = s.emphasis === "primary";
            return isPrimary ? (
              <div
                key={i}
                className={`inline-flex flex-col items-center justify-center min-w-[44px] h-12 px-2.5 rounded-xl border ${t.totalBg} ${t.totalBorder}`}
              >
                <span className={`text-xl font-extrabold leading-none tabular-nums ${t.totalText}`}>
                  {s.value}
                </span>
                <span className={`mt-0.5 text-[9px] font-bold uppercase tracking-wider ${t.labelText}`}>
                  {s.label}
                </span>
              </div>
            ) : (
              <div
                key={i}
                className="inline-flex flex-col items-center justify-center min-w-[32px] px-1.5 py-1"
              >
                <span className="text-sm font-bold leading-none tabular-nums text-slate-800">
                  {s.value}
                </span>
                <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Items list — scrollable */}
      <ul className="flex-1 overflow-y-auto divide-y divide-slate-100">
        {items.length === 0 ? (
          <li className="px-5 py-8 text-center text-xs font-medium italic text-slate-400">
            {emptyText}
          </li>
        ) : (
          items.map((row) => (
            <li
              key={row.key}
              className={`relative ${row.highlight ? `${t.rowAccentBg} before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 ${t.rowAccentBar}` : ""} ${t.hoverRow} px-5 py-2.5 flex items-start gap-3 transition-colors`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[13px] font-bold text-slate-900 truncate">
                    {row.name}
                  </span>
                  {row.statusChip && (
                    <span className={`inline-flex items-center rounded-full px-1.5 text-[9px] font-bold uppercase tracking-wide whitespace-nowrap leading-4 border ${t.chipBg} ${t.chipText} ${t.chipBorder}`}>
                      {row.statusChip}
                    </span>
                  )}
                </div>
                {row.meta && (
                  <p className="mt-0.5 text-[11px] font-medium text-slate-500 truncate">
                    {row.meta}
                  </p>
                )}
              </div>
              {(row.date || row.relative) && (
                <div className="text-right shrink-0">
                  {row.date && (
                    <p className="text-[11px] font-semibold text-slate-700 whitespace-nowrap">
                      {row.date}
                    </p>
                  )}
                  {row.relative && (
                    <p className={`mt-0.5 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap ${row.highlight ? t.titleText : "text-slate-400"}`}>
                      {row.relative}
                    </p>
                  )}
                </div>
              )}
            </li>
          ))
        )}
      </ul>

      {/* Footer */}
      {viewAllHref && items.length > 0 && (
        <Link
          href={viewAllHref}
          className={`border-t border-slate-100 px-5 py-2.5 text-center text-xs font-bold tracking-wide ${t.footer} transition-colors`}
        >
          {totalLabel} →
        </Link>
      )}
    </div>
  );
}

// ── Date helpers exported for use by callers building items ─────────────

export function formatPrettyDate(iso: string): string {
  // "2026-06-27" → "27 Jun 2026"
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = monthNames[Number(m[2]) - 1];
  return `${m[3]} ${month} ${m[1]}`;
}

export function relativeFromToday(iso: string): { text: string; isUpcoming: boolean } {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const target = new Date(`${iso}T00:00:00Z`);
  const days = Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return { text: "Today", isUpcoming: false };
  if (days > 0) return { text: `in ${days}d`, isUpcoming: true };
  return { text: `${-days}d ago`, isUpcoming: false };
}

/** Helper to render the "view all" link content for cards that want a custom label. */
export function viewAllLabel(count: number): ReactNode {
  return `View All ${count} Records`;
}
