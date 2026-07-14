import Link from "next/link";
import { UserPlus, UserMinus, Flag, AlertOctagon } from "lucide-react";
import { CardHoverPreview, type HoverPreviewItem } from "./CardHoverPreview";

// Merged from the former OnboardingCard + OffboardingCard, which were
// identical except for theme colors, icon, title, href, preview side, and
// the hover-preview copy. Full class strings live in THEMES so Tailwind's
// JIT still detects every utility (no constructed class names).

export type LifecycleVariant = "onboarding" | "offboarding" | "flagged" | "mia";

interface VariantTheme {
  href: string;
  title: string;
  Icon: typeof UserPlus;
  previewSide: "right" | "left" | "below";
  /** border + gradient + focus ring color */
  cardClass: string;
  blurTop: string;
  blurBottom: string;
  iconBg: string;
  titleText: string;
  /** Shared by the window label and the "Total" caption. */
  labelText: string;
  totalText: string;
  pillClass: string;
  previewAccent: "emerald" | "rose" | "amber" | "sky";
  previewTitle: string;
  previewEmpty: string;
  previewFooter: string;
}

const THEMES: Record<LifecycleVariant, VariantTheme> = {
  onboarding: {
    href: "/induction/hr-dashboard/onboarding-detail",
    title: "Onboarding",
    Icon: UserPlus,
    previewSide: "right",
    cardClass:
      "border border-emerald-200 bg-gradient-to-br from-emerald-50 via-emerald-100 to-teal-100 focus-visible:ring-emerald-500",
    blurTop: "bg-emerald-300/30",
    blurBottom: "bg-teal-300/20",
    iconBg: "bg-emerald-600",
    titleText: "text-emerald-900",
    labelText: "text-emerald-700",
    totalText: "text-emerald-900",
    pillClass: "bg-emerald-600/10 text-emerald-800",
    previewAccent: "emerald",
    previewTitle: "Onboarding Pipeline",
    previewEmpty: "No upcoming hires.",
    previewFooter: "Highlighted rows start within 7 days.",
  },
  offboarding: {
    href: "/induction/hr-dashboard/offboarding-detail",
    title: "Offboarding",
    Icon: UserMinus,
    previewSide: "left",
    cardClass:
      "border border-rose-200 bg-gradient-to-br from-rose-50 via-rose-100 to-pink-100 focus-visible:ring-rose-500",
    blurTop: "bg-rose-300/30",
    blurBottom: "bg-pink-300/20",
    iconBg: "bg-rose-600",
    titleText: "text-rose-900",
    labelText: "text-rose-700",
    totalText: "text-rose-900",
    pillClass: "bg-rose-600/10 text-rose-800",
    previewAccent: "rose",
    previewTitle: "Offboarding Pipeline",
    previewEmpty: "No upcoming exits.",
    previewFooter: "Highlighted rows leave within 7 days.",
  },
  flagged: {
    href: "/induction/hr-dashboard#flagged",
    title: "Flagged",
    Icon: Flag,
    previewSide: "right",
    cardClass:
      "border border-amber-200 bg-gradient-to-br from-amber-50 via-amber-100 to-orange-100 focus-visible:ring-amber-500",
    blurTop: "bg-amber-300/30",
    blurBottom: "bg-orange-300/20",
    iconBg: "bg-amber-600",
    titleText: "text-amber-900",
    labelText: "text-amber-700",
    totalText: "text-amber-900",
    pillClass: "bg-amber-600/10 text-amber-800",
    previewAccent: "amber",
    previewTitle: "Flagged staff (≥ 3 SL this month)",
    previewEmpty: "No-one flagged this month.",
    previewFooter: "Counts approved SL leaves in the selected month.",
  },
  mia: {
    href: "/induction/hr-dashboard#mia",
    title: "MIA",
    Icon: AlertOctagon,
    previewSide: "left",
    cardClass:
      "border border-sky-200 bg-gradient-to-br from-sky-50 via-sky-100 to-cyan-100 focus-visible:ring-sky-500",
    blurTop: "bg-sky-300/30",
    blurBottom: "bg-cyan-300/20",
    iconBg: "bg-sky-600",
    titleText: "text-sky-900",
    labelText: "text-sky-700",
    totalText: "text-sky-900",
    pillClass: "bg-sky-600/10 text-sky-800",
    previewAccent: "sky",
    previewTitle: "MIA — UL leaves + missing today",
    previewEmpty: "No-one missing.",
    previewFooter: "UL leaves last 2 weeks + scheduled today but not scanned.",
  },
};

interface Props {
  variant: LifecycleVariant;
  total: number;
  windowLabel: string;
  previewItems?: HoverPreviewItem[];
  /** Overrides the variant's default preview side. */
  previewSide?: "right" | "left" | "below";
}

export function LifecycleCard({
  variant,
  total,
  windowLabel,
  previewItems = [],
  previewSide,
}: Props) {
  const t = THEMES[variant];
  const { Icon } = t;
  return (
    <div className="group relative">
      <Link
        href={t.href}
        className={`relative block overflow-hidden rounded-2xl p-8 shadow-sm transition hover:shadow-xl hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${t.cardClass}`}
      >
        {/* Decorative blur */}
        <div className={`pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full blur-3xl ${t.blurTop}`} />
        <div className={`pointer-events-none absolute -left-10 -bottom-10 h-36 w-36 rounded-full blur-3xl ${t.blurBottom}`} />

        <div className="relative flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-md ${t.iconBg}`}>
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className={`text-sm font-extrabold uppercase tracking-wider ${t.titleText}`}>
                {t.title}
              </h3>
            </div>
            <p className={`mt-2 text-xs font-medium ${t.labelText}`}>{windowLabel}</p>
          </div>

          <div className="text-right">
            <p className={`text-[10px] font-semibold uppercase tracking-wider ${t.labelText}`}>
              Total
            </p>
            <p className={`mt-1 text-7xl font-black leading-none tabular-nums drop-shadow-sm ${t.totalText}`}>
              {total}
            </p>
          </div>
        </div>

        <div className="relative mt-6 flex justify-end">
          <span className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wider ${t.pillClass}`}>
            Hover · Click
          </span>
        </div>
      </Link>

      <CardHoverPreview
        accent={t.previewAccent}
        side={previewSide ?? t.previewSide}
        title={t.previewTitle}
        items={previewItems}
        emptyText={t.previewEmpty}
        totalLabel={`${total} total`}
        footer={t.previewFooter}
      />
    </div>
  );
}
