import type { ReactNode } from "react";

export interface HoverPreviewItem {
  key: string;
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  highlight?: boolean;
}

interface Props {
  title: string;
  items: HoverPreviewItem[];
  emptyText: string;
  totalLabel?: string;
  accent: "emerald" | "rose" | "yellow" | "indigo" | "amber" | "sky";
  footer?: ReactNode;
  /** Where the popover appears relative to the card. Defaults to "right". */
  side?: "right" | "left" | "below";
}

const ACCENT_BORDER: Record<Props["accent"], string> = {
  emerald: "border-emerald-200 dark:border-emerald-700",
  rose: "border-rose-200 dark:border-rose-700",
  yellow: "border-yellow-200 dark:border-yellow-700",
  indigo: "border-indigo-200 dark:border-indigo-700",
  amber: "border-amber-200 dark:border-amber-700",
  sky: "border-sky-200 dark:border-sky-700",
};

const ACCENT_HEADER: Record<Props["accent"], string> = {
  emerald: "text-emerald-900 dark:text-emerald-200",
  rose: "text-rose-900 dark:text-rose-200",
  yellow: "text-yellow-900 dark:text-yellow-200",
  indigo: "text-indigo-900 dark:text-indigo-200",
  amber: "text-amber-900 dark:text-amber-200",
  sky: "text-sky-900 dark:text-sky-200",
};

const ACCENT_HIGHLIGHT: Record<Props["accent"], string> = {
  emerald: "bg-emerald-50 dark:bg-emerald-900",
  rose: "bg-rose-50 dark:bg-rose-900",
  yellow: "bg-yellow-50 dark:bg-yellow-900",
  indigo: "bg-indigo-50 dark:bg-indigo-900",
  amber: "bg-amber-50 dark:bg-amber-900",
  sky: "bg-sky-50 dark:bg-sky-900",
};

const POSITION_CLASSES: Record<NonNullable<Props["side"]>, string> = {
  // Slides in from the right of the card (good for left-column cards).
  right:
    "left-full top-0 ml-3 -translate-x-1 group-hover:translate-x-0",
  // Slides in from the left of the card (good for right-column cards).
  left:
    "right-full top-0 mr-3 translate-x-1 group-hover:translate-x-0",
  // Drops below the card.
  below:
    "left-1/2 top-full mt-3 -translate-x-1/2 translate-y-1 group-hover:translate-y-0",
};

export function CardHoverPreview({
  title,
  items,
  emptyText,
  totalLabel,
  accent,
  footer,
  side = "right",
}: Props) {
  return (
    <div
      className={`pointer-events-none invisible absolute z-30 w-[420px] rounded-xl border bg-white dark:bg-slate-900 dark:ring-1 dark:ring-white/10 opacity-0 shadow-xl transition-all duration-150 group-hover:visible group-hover:opacity-100 ${POSITION_CLASSES[side]} ${ACCENT_BORDER[accent]}`}
      role="tooltip"
    >
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-4 py-2">
        <p className={`text-xs font-bold uppercase tracking-wider ${ACCENT_HEADER[accent]}`}>
          {title}
        </p>
        {totalLabel && (
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{totalLabel}</p>
        )}
      </div>

      {items.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm italic text-slate-500 dark:text-slate-400">
          {emptyText}
        </p>
      ) : (
        <ul className="max-h-72 divide-y divide-slate-100 dark:divide-slate-800 overflow-y-auto">
          {items.map((it) => (
            <li
              key={it.key}
              className={`px-4 py-2 text-left ${it.highlight ? ACCENT_HIGHLIGHT[accent] : ""}`}
            >
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{it.title}</p>
              {it.subtitle && (
                <p className="text-xs text-slate-600 dark:text-slate-300">{it.subtitle}</p>
              )}
              {it.meta && (
                <p className="text-xs text-slate-500 dark:text-slate-400">{it.meta}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {footer && (
        <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-2 text-xs text-slate-500 dark:text-slate-400">
          {footer}
        </div>
      )}
    </div>
  );
}
