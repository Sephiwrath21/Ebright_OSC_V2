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
  emerald: "border-emerald-200",
  rose: "border-rose-200",
  yellow: "border-yellow-200",
  indigo: "border-indigo-200",
  amber: "border-amber-200",
  sky: "border-sky-200",
};

const ACCENT_HEADER: Record<Props["accent"], string> = {
  emerald: "text-emerald-900",
  rose: "text-rose-900",
  yellow: "text-yellow-900",
  indigo: "text-indigo-900",
  amber: "text-amber-900",
  sky: "text-sky-900",
};

const ACCENT_HIGHLIGHT: Record<Props["accent"], string> = {
  emerald: "bg-emerald-50",
  rose: "bg-rose-50",
  yellow: "bg-yellow-50",
  indigo: "bg-indigo-50",
  amber: "bg-amber-50",
  sky: "bg-sky-50",
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
      className={`pointer-events-none invisible absolute z-30 w-[420px] rounded-xl border bg-white opacity-0 shadow-xl transition-all duration-150 group-hover:visible group-hover:opacity-100 ${POSITION_CLASSES[side]} ${ACCENT_BORDER[accent]}`}
      role="tooltip"
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
        <p className={`text-xs font-bold uppercase tracking-wider ${ACCENT_HEADER[accent]}`}>
          {title}
        </p>
        {totalLabel && (
          <p className="text-xs font-medium text-slate-500">{totalLabel}</p>
        )}
      </div>

      {items.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm italic text-slate-500">
          {emptyText}
        </p>
      ) : (
        <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
          {items.map((it) => (
            <li
              key={it.key}
              className={`px-4 py-2 text-left ${it.highlight ? ACCENT_HIGHLIGHT[accent] : ""}`}
            >
              <p className="text-sm font-medium text-slate-900">{it.title}</p>
              {it.subtitle && (
                <p className="text-xs text-slate-600">{it.subtitle}</p>
              )}
              {it.meta && (
                <p className="text-xs text-slate-500">{it.meta}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {footer && (
        <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
          {footer}
        </div>
      )}
    </div>
  );
}
