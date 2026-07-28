"use client";

import { useEffect, useState } from "react";
import { type DeptDataset } from "@/lib/clickup";

const fontStack =
  'Inter, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

type Seg = "complete" | "pending" | "na";

export default function ClickUpPieModal({
  departmentName,
  dataset,
  onClose,
  onViewMembers,
  onSelectMember,
}: {
  departmentName: string;
  dataset: DeptDataset;
  onClose: () => void;
  onViewMembers: () => void;
  onSelectMember: (id: string) => void;
}) {
  const [selected, setSelected] = useState<Seg | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const totals = dataset.week;
  const total = totals.total || 1;
  const pct = (n: number) => Math.round((n / total) * 100);

  const perMember = dataset.members.map((m) => ({ id: m.id, name: m.name, s: m.week }));
  const membersWith = (pick: (s: typeof perMember[number]["s"]) => number) =>
    perMember
      .filter((x) => pick(x.s) > 0)
      .map((x) => ({ id: x.id, name: x.name, count: pick(x.s) }))
      .sort((a, b) => b.count - a.count);
  const completeMembers = membersWith((s) => s.done);
  const pendingMembers = membersWith((s) => s.pending);
  const naMembers = membersWith((s) => s.notApplicable);

  const segments = [
    { key: "complete" as Seg, label: "Complete", value: totals.done, pct: pct(totals.done), color: "#0F6E56" },
    { key: "pending" as Seg, label: "Pending", value: totals.pending, pct: pct(totals.pending), color: "#DC2626" },
    { key: "na" as Seg, label: "Not Applicable", value: totals.notApplicable, pct: pct(totals.notApplicable), color: "#EAB308" },
  ];

  // Donut geometry (computed before render — no mutation during JSX).
  const size = 260;
  const stroke = 40;
  const r = (size - stroke - 12) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const arcs: { key: Seg; color: string; dash: number; offset: number }[] = [];
  let offset = 0;
  for (const seg of segments) {
    const dash = (seg.value / total) * circ;
    arcs.push({ key: seg.key, color: seg.color, dash, offset });
    offset += dash;
  }

  const activeSeg = segments.find((s) => s.key === selected) ?? null;
  const activeList =
    selected === "pending"
      ? pendingMembers
      : selected === "complete"
        ? completeMembers
        : selected === "na"
          ? naMembers
          : null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        fontFamily: fontStack,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#FFFFFF",
          borderRadius: 16,
          width: "min(740px, 100%)",
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "0.5px solid #E5E7EB",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#111827" }}>
            Weekly ClickUp · {departmentName}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: "#94A3B8",
              fontSize: 18,
              display: "inline-flex",
            }}
          >
            <i className="ti ti-x" />
          </button>
        </header>

        <div style={{ display: "flex", gap: 24, padding: 24, flexWrap: "wrap" }}>
          {/* Interactive donut */}
          <div
            style={{
              flex: "0 0 auto",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
            }}
          >
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
              <g transform={`rotate(-90 ${c} ${c})`}>
                {arcs.map((a) => {
                  const active = selected === a.key;
                  return (
                    <circle
                      key={a.key}
                      cx={c}
                      cy={c}
                      r={r}
                      fill="none"
                      stroke={a.color}
                      strokeWidth={active ? stroke + 10 : stroke}
                      strokeDasharray={`${a.dash} ${circ - a.dash}`}
                      strokeDashoffset={-a.offset}
                      opacity={selected && !active ? 0.35 : 1}
                      style={{ cursor: "pointer", transition: "stroke-width 0.15s, opacity 0.15s" }}
                      onClick={() => setSelected((prev) => (prev === a.key ? null : a.key))}
                    />
                  );
                })}
              </g>
              <text
                x={c}
                y={c - 4}
                textAnchor="middle"
                style={{ fontSize: 34, fontWeight: 700, fill: activeSeg ? activeSeg.color : "#111827" }}
              >
                {activeSeg ? `${activeSeg.pct}%` : total}
              </text>
              <text
                x={c}
                y={c + 20}
                textAnchor="middle"
                style={{ fontSize: 12, fill: "#94A3B8", letterSpacing: "0.05em" }}
              >
                {activeSeg ? activeSeg.label.toUpperCase() : "TASKS"}
              </text>
            </svg>

            {/* Legend (also hoverable) */}
            <div style={{ display: "flex", gap: 18 }}>
              {segments.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSelected((prev) => (prev === s.key ? null : s.key))}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: 13,
                  }}
                >
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color }} />
                  <span style={{ fontWeight: 600, color: "#1F2937" }}>{s.label}</span>
                  <span style={{ color: "#6B7280" }}>
                    {s.value} ({s.pct}%)
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Member list for the selected segment */}
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 10 }}>
              {selected === "pending"
                ? "Members with pending tasks"
                : selected === "complete"
                  ? "Members with completed tasks"
                  : selected === "na"
                    ? "Members with N/A tasks"
                    : "Click a segment to see members"}
            </div>
            {activeList ? (
              activeList.length > 0 ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    maxHeight: 280,
                    overflowY: "auto",
                    paddingRight: 4,
                  }}
                >
                  {activeList.map((x) => (
                    <button
                      key={x.id}
                      type="button"
                      onClick={() => onSelectMember(x.id)}
                      title={`Open ${x.name}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                        padding: "7px 12px",
                        background: "#F8FAFC",
                        border: "none",
                        borderRadius: 8,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        width: "100%",
                        textAlign: "left",
                      }}
                    >
                      <span style={{ fontSize: 13, color: "#1F2937" }}>{x.name}</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: selected === "pending" ? "#854F0B" : "#0F6E56",
                          }}
                        >
                          {x.count}
                        </span>
                        <i className="ti ti-chevron-right" style={{ color: "#94A3B8", fontSize: 14 }} />
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "#94A3B8" }}>None.</div>
              )
            ) : (
              <div style={{ fontSize: 13, color: "#94A3B8", lineHeight: 1.5 }}>
                Click the <strong style={{ color: "#0F6E56" }}>Complete</strong> or{" "}
                <strong style={{ color: "#854F0B" }}>Pending</strong> part of the chart to see its
                percentage and the members involved.
              </div>
            )}
          </div>
        </div>

        <footer
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            padding: "12px 20px",
            borderTop: "0.5px solid #E5E7EB",
          }}
        >
          <button
            type="button"
            onClick={onViewMembers}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "9px 16px",
              border: "none",
              borderRadius: 8,
              background: "#185FA5",
              color: "#FFFFFF",
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            View all members <i className="ti ti-arrow-right" />
          </button>
        </footer>
      </div>
    </div>
  );
}
