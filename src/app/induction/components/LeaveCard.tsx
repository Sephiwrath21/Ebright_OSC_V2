import Link from "next/link";
import { Plane, Stethoscope } from "lucide-react";
import type { LeaveOnDateRow } from "@/app/induction/queries";
import { CardHoverPreview, type HoverPreviewItem } from "./CardHoverPreview";
import { titleCaseName } from "@/lib/text";

// Merged from the former AnnualLeaveCard + MCCard, which were identical
// except theme colors, icon, title, window label, and copy. Full class
// strings live in THEMES so Tailwind's JIT still detects every utility.

export type LeaveVariant = "mc" | "annual-leave";

interface VariantTheme {
  href: string;
  title: string;
  Icon: typeof Plane;
  windowLabel: string;
  keyPrefix: string;
  previewSide: "right" | "left" | "below";
  cardClass: string;
  blurTop: string;
  blurBottom: string;
  iconBg: string;
  titleText: string;
  /** Shared by window label, "Total" caption, and the footer line. */
  labelText: string;
  totalText: string;
  frontItemBg: string;
  /** Front-list sub-line + the "+N more" row. */
  frontSubText: string;
  frontEmptyText: string;
  emptyMessage: string;
  previewAccent: "indigo" | "yellow";
  previewTitle: string;
  previewEmpty: string;
}

const THEMES: Record<LeaveVariant, VariantTheme> = {
  "annual-leave": {
    href: "/induction/hr-dashboard/annual-leave-detail",
    title: "Annual Leave",
    Icon: Plane,
    windowLabel: "today → +2 weeks",
    keyPrefix: "al",
    previewSide: "left",
    cardClass:
      "border border-indigo-200 bg-gradient-to-br from-indigo-50 via-violet-100 to-purple-100 focus-visible:ring-indigo-500 dark:border-indigo-700 dark:from-indigo-950 dark:via-violet-950 dark:to-purple-950",
    blurTop: "bg-violet-300/30 dark:bg-violet-500/10",
    blurBottom: "bg-indigo-300/20 dark:bg-indigo-500/10",
    iconBg: "bg-indigo-600",
    titleText: "text-indigo-900 dark:text-indigo-200",
    labelText: "text-indigo-700 dark:text-indigo-300",
    totalText: "text-indigo-900 dark:text-indigo-200",
    frontItemBg: "bg-white/60 text-indigo-950 dark:bg-black/20 dark:text-indigo-100",
    frontSubText: "text-indigo-800 dark:text-indigo-300",
    frontEmptyText: "text-indigo-800/70 dark:text-indigo-300/70",
    emptyMessage: "No upcoming annual leave.",
    previewAccent: "indigo",
    previewTitle: "Upcoming Annual Leave",
    previewEmpty: "No upcoming annual leave.",
  },
  mc: {
    href: "/induction/hr-dashboard/mc-detail",
    title: "MC",
    Icon: Stethoscope,
    windowLabel: "-1 week → today",
    keyPrefix: "mc",
    previewSide: "right",
    cardClass:
      "border border-amber-200 bg-gradient-to-br from-amber-50 via-yellow-100 to-orange-100 focus-visible:ring-amber-500 dark:border-amber-700 dark:from-amber-950 dark:via-yellow-950 dark:to-orange-950",
    blurTop: "bg-yellow-300/30 dark:bg-yellow-500/10",
    blurBottom: "bg-orange-300/20 dark:bg-orange-500/10",
    iconBg: "bg-amber-500",
    titleText: "text-amber-900 dark:text-amber-200",
    labelText: "text-amber-700 dark:text-amber-300",
    totalText: "text-amber-900 dark:text-amber-200",
    frontItemBg: "bg-white/60 text-amber-950 dark:bg-black/20 dark:text-amber-100",
    frontSubText: "text-amber-800 dark:text-amber-300",
    frontEmptyText: "text-amber-800/70 dark:text-amber-300/70",
    emptyMessage: "No MC in the past week.",
    previewAccent: "yellow",
    previewTitle: "Recent MC",
    previewEmpty: "No MC records in the past week.",
  },
};

interface Props {
  variant: LeaveVariant;
  rows: LeaveOnDateRow[];
  /** Overrides the variant's default preview side. */
  previewSide?: "right" | "left" | "below";
}

export function LeaveCard({ variant, rows, previewSide }: Props) {
  const t = THEMES[variant];
  const { Icon } = t;

  const previewItems: HoverPreviewItem[] = rows.slice(0, 8).map((r) => ({
    key: `${t.keyPrefix}-${r.leaveId}`,
    title: titleCaseName(r.fullName) || r.fullName,
    subtitle: r.leaveTypeName,
    meta: r.startDate === r.endDate ? r.startDate : `${r.startDate} → ${r.endDate}`,
  }));

  const front = rows.slice(0, 3);

  return (
    <div className="group relative">
      <Link
        href={t.href}
        className={`relative block overflow-hidden rounded-2xl p-6 shadow-sm transition hover:shadow-xl hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${t.cardClass}`}
      >
        <div className={`pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full blur-3xl ${t.blurTop}`} />
        <div className={`pointer-events-none absolute -left-10 -bottom-10 h-36 w-36 rounded-full blur-3xl ${t.blurBottom}`} />

        <div className="relative flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-md ${t.iconBg}`}>
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className={`text-sm font-extrabold uppercase tracking-wider ${t.titleText}`}>
                {t.title}
              </h3>
            </div>
            <p className={`mt-2 text-xs font-medium ${t.labelText}`}>{t.windowLabel}</p>

            <ul className="mt-4 space-y-1.5">
              {front.length === 0 ? (
                <li className={`text-sm italic ${t.frontEmptyText}`}>{t.emptyMessage}</li>
              ) : (
                front.map((r) => (
                  <li
                    key={r.leaveId}
                    className={`rounded-lg px-3 py-1.5 text-sm backdrop-blur-sm ${t.frontItemBg}`}
                  >
                    <p className="truncate font-semibold">
                      {titleCaseName(r.fullName) || r.fullName}
                    </p>
                    <p className={`truncate text-xs ${t.frontSubText}`}>
                      {r.leaveTypeName} · {r.startDate}
                    </p>
                  </li>
                ))
              )}
              {rows.length > front.length && (
                <li className={`px-3 pt-1 text-xs font-semibold uppercase tracking-wide ${t.frontSubText}`}>
                  +{rows.length - front.length} more
                </li>
              )}
            </ul>
          </div>

          <div className="text-right">
            <p className={`text-[10px] font-semibold uppercase tracking-wider ${t.labelText}`}>
              Total
            </p>
            <p className={`mt-1 text-5xl font-black leading-none tabular-nums drop-shadow-sm ${t.totalText}`}>
              {rows.length}
            </p>
          </div>
        </div>

        <p className={`relative mt-5 text-center text-[10px] font-semibold uppercase tracking-wider ${t.labelText}`}>
          Hover for full list · Click to view detail
        </p>
      </Link>

      <CardHoverPreview
        accent={t.previewAccent}
        side={previewSide ?? t.previewSide}
        title={t.previewTitle}
        items={previewItems}
        emptyText={t.previewEmpty}
        totalLabel={`${rows.length} total · showing top ${Math.min(rows.length, 8)}`}
      />
    </div>
  );
}
