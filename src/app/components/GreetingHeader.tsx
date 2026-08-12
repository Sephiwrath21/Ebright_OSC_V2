"use client";

import { useMemo } from "react";

/**
 * Standardized greeting header used across all account dashboards.
 *
 *   Welcome, {name} 👋                                   Thu, 04/06/2026
 *
 * Title on the left, date pinned to the right end, on a single line.
 * Self-contained inline styles so the font renders identically no matter
 * which view (Tailwind- or inline-styled) hosts it.
 */

const FONT_STACK =
  'Inter, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

function formatToday(): string {
  const d = new Date();
  const weekday = d.toLocaleDateString("en-GB", { weekday: "short" }); // "Thu"
  const date = d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }); // "04/06/2026"
  return `${weekday}, ${date}`;
}

export default function GreetingHeader({
  name,
  style,
}: {
  /** First name / nickname to greet. Falls back to a plain "Welcome". */
  name?: string;
  /** Optional overrides for the outer <header> (e.g. margins). */
  style?: React.CSSProperties;
}) {
  const today = useMemo(() => formatToday(), []);

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        fontFamily: FONT_STACK,
        ...style,
      }}
    >
      <h1
        style={{
          fontSize: 30,
          fontWeight: 600,
          color: "#0F172A",
          letterSpacing: "-0.02em",
          margin: 0,
          lineHeight: 1.15,
        }}
      >
        Welcome{name ? `, ${name}` : ""}
      </h1>
      <span
        style={{
          flexShrink: 0,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 12px",
          border: "1px solid var(--status-track)",
          borderRadius: 8,
          background: "#FFFFFF",
          fontSize: 14,
          fontWeight: 500,
          color: "#374151",
          whiteSpace: "nowrap",
        }}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#9CA3AF"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{ flexShrink: 0 }}
        >
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        {today}
      </span>
    </header>
  );
}
