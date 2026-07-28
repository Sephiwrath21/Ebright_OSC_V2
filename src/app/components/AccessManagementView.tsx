"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Home,
  ChevronRight,
  ChevronDown,
  Check,
  Minus,
  Lock,
  Save,
  MoreHorizontal,
  RotateCcw,
  Copy,
  CircleUser,
  ShieldAlert,
} from "lucide-react";
import AccessTabs from "@/app/components/AccessTabs";
import {
  MODULES,
  ACTION_COLUMNS,
  isCeilingLocked,
  type PermAction,
  type FeatureDef,
} from "@/lib/accessMatrix";

type Role = { role_id: number; role_type: string };

// featureKey -> action -> true (absence = not allowed). Only stores grants.
type Grants = Record<string, Partial<Record<PermAction, boolean>>>;

type CellKind = "allowed" | "denied" | "partial" | "na" | "locked";

const EXPAND_STORAGE_KEY = "access-matrix-expanded-v1";

function prettyRole(roleType: string): string {
  return roleType
    .split(/[\s_-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** Strip falsy entries so baseline/current compare cleanly for dirty-tracking. */
function normalize(grants: Grants): string {
  const out: Grants = {};
  for (const fk of Object.keys(grants).sort()) {
    const actions = grants[fk];
    const kept: Partial<Record<PermAction, boolean>> = {};
    for (const a of Object.keys(actions).sort() as PermAction[]) {
      if (actions[a]) kept[a] = true;
    }
    if (Object.keys(kept).length) out[fk] = kept;
  }
  return JSON.stringify(out);
}

function featureCellKind(
  feature: FeatureDef,
  action: PermAction,
  grants: Grants,
): CellKind {
  if (!feature.applies.includes(action)) return "na";
  if (isCeilingLocked(feature.key, action)) return "locked";
  return grants[feature.key]?.[action] ? "allowed" : "denied";
}

/** Roll a module's children up to a single parent state for one column. */
function parentCellKind(
  features: FeatureDef[],
  action: PermAction,
  grants: Grants,
): CellKind {
  const applicable = features.filter((f) => f.applies.includes(action));
  if (applicable.length === 0) return "na";

  const hasLocked = applicable.some((f) => isCeilingLocked(f.key, action));
  // Any locked child makes the whole feature superadmin-only for this column.
  if (hasLocked) return "locked";

  const allowedCount = applicable.filter(
    (f) => grants[f.key]?.[action],
  ).length;
  if (allowedCount === 0) return "denied";
  if (allowedCount === applicable.length) return "allowed";
  return "partial";
}

export default function AccessManagementView({ roles }: { roles: Role[] }) {
  const editableRoles = useMemo(
    () => roles.filter((r) => r.role_type.toLowerCase() !== "superadmin"),
    [roles],
  );

  const [roleId, setRoleId] = useState<number | null>(
    editableRoles[0]?.role_id ?? null,
  );

  // Per-role working state + baseline (baseline = last "saved"). Stubbed: both
  // start empty (all not-allowed) until a real role_permissions source exists.
  const [grantsByRole, setGrantsByRole] = useState<Record<number, Grants>>({});
  const [baselineByRole, setBaselineByRole] = useState<Record<number, Grants>>(
    {},
  );

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [savedFlash, setSavedFlash] = useState(false);

  // Restore expand state per session.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(EXPAND_STORAGE_KEY);
      if (raw) setExpanded(JSON.parse(raw));
      else setExpanded(Object.fromEntries(MODULES.map((m) => [m.key, true])));
    } catch {
      setExpanded(Object.fromEntries(MODULES.map((m) => [m.key, true])));
    }
  }, []);

  const persistExpanded = (next: Record<string, boolean>) => {
    setExpanded(next);
    try {
      window.localStorage.setItem(EXPAND_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const grants: Grants = roleId != null ? grantsByRole[roleId] ?? {} : {};
  const baseline: Grants = roleId != null ? baselineByRole[roleId] ?? {} : {};
  const dirty = normalize(grants) !== normalize(baseline);

  const setGrant = (featureKey: string, action: PermAction, value: boolean) => {
    if (roleId == null) return;
    setSavedFlash(false);
    setGrantsByRole((prev) => {
      const roleGrants: Grants = { ...(prev[roleId] ?? {}) };
      const fg = { ...(roleGrants[featureKey] ?? {}) };
      if (value) fg[action] = true;
      else delete fg[action];
      if (Object.keys(fg).length) roleGrants[featureKey] = fg;
      else delete roleGrants[featureKey];
      return { ...prev, [roleId]: roleGrants };
    });
  };

  const toggleFeatureCell = (feature: FeatureDef, action: PermAction) => {
    const kind = featureCellKind(feature, action, grants);
    if (kind === "na" || kind === "locked") return;
    setGrant(feature.key, action, kind !== "allowed");
  };

  const toggleParentCell = (features: FeatureDef[], action: PermAction) => {
    if (roleId == null) return;
    const kind = parentCellKind(features, action, grants);
    if (kind === "na" || kind === "locked") return;
    // allowed -> clear all; denied/partial -> set all (non-locked, applicable)
    const target = kind !== "allowed";
    setSavedFlash(false);
    setGrantsByRole((prev) => {
      const roleGrants: Grants = { ...(prev[roleId] ?? {}) };
      for (const f of features) {
        if (!f.applies.includes(action)) continue;
        if (isCeilingLocked(f.key, action)) continue;
        const fg = { ...(roleGrants[f.key] ?? {}) };
        if (target) fg[action] = true;
        else delete fg[action];
        if (Object.keys(fg).length) roleGrants[f.key] = fg;
        else delete roleGrants[f.key];
      }
      return { ...prev, [roleId]: roleGrants };
    });
  };

  const handleSave = () => {
    if (roleId == null || !dirty) return;
    // STUB: no persistence yet — promote current state to baseline so the UI
    // reflects a successful save. Real server action + role_permissions TBD.
    setBaselineByRole((prev) => ({
      ...prev,
      [roleId]: JSON.parse(JSON.stringify(grants)),
    }));
    setSavedFlash(true);
  };

  const handleResetToDefault = () => {
    if (roleId == null) return;
    // STUB action — clears all grants for the current role back to none.
    setGrantsByRole((prev) => ({ ...prev, [roleId]: {} }));
    setSavedFlash(false);
  };

  if (editableRoles.length === 0) {
    return (
      <Shell>
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-10 text-center">
          <ShieldAlert className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">
            No editable roles found. (Superadmin is always full-access and is not
            listed here.)
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-slate-200">
          <label className="inline-flex items-center h-10 rounded-xl border border-slate-200 bg-white px-3 gap-2 text-sm focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition-all duration-200">
            <CircleUser className="w-4 h-4 text-slate-500" aria-hidden="true" />
            <span className="text-slate-500">Role</span>
            <select
              value={roleId ?? ""}
              onChange={(e) => {
                setRoleId(Number(e.target.value));
                setSavedFlash(false);
              }}
              className="bg-transparent text-sm font-semibold text-slate-800 focus:outline-none pr-1"
            >
              {editableRoles.map((r) => (
                <option key={r.role_id} value={r.role_id}>
                  {prettyRole(r.role_type)}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center gap-2">
            {dirty ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                Unsaved changes
              </span>
            ) : savedFlash ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                <Check className="w-3.5 h-3.5" aria-hidden="true" />
                Saved
              </span>
            ) : null}

            <OverflowMenu onResetToDefault={handleResetToDefault} />

            <button
              type="button"
              onClick={handleSave}
              disabled={!dirty}
              className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-all duration-200"
            >
              <Save className="w-4 h-4" aria-hidden="true" />
              Save permissions
            </button>
          </div>
        </div>

        {/* Matrix */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700">
                <th className="text-left px-6 py-3 font-semibold sticky left-0 bg-slate-100 z-10 min-w-[260px]">
                  Module / Feature
                </th>
                {ACTION_COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    className="px-4 py-3 font-semibold text-center w-[92px]"
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MODULES.map((mod) => {
                const isOpen = expanded[mod.key] ?? true;
                return (
                  <ModuleRows
                    key={mod.key}
                    moduleKey={mod.key}
                    label={mod.label}
                    features={mod.features}
                    grants={grants}
                    open={isOpen}
                    onToggleOpen={() =>
                      persistExpanded({ ...expanded, [mod.key]: !isOpen })
                    }
                    onToggleParent={(action) =>
                      toggleParentCell(mod.features, action)
                    }
                    onToggleChild={(feature, action) =>
                      toggleFeatureCell(feature, action)
                    }
                  />
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4 border-t border-slate-200 bg-slate-50/60 text-xs text-slate-600">
          <LegendItem>
            <CellBox kind="allowed" />
            <span>Allowed</span>
          </LegendItem>
          <LegendItem>
            <CellBox kind="denied" />
            <span>Not allowed</span>
          </LegendItem>
          <LegendItem>
            <CellBox kind="partial" />
            <span>Partially allowed</span>
          </LegendItem>
          <LegendItem>
            <span className="w-6 text-center text-slate-400 font-semibold">—</span>
            <span>Not applicable to this feature</span>
          </LegendItem>
          <LegendItem>
            <CellBox kind="locked" />
            <span>Superadmin only — no role can grant this</span>
          </LegendItem>
        </div>
      </section>
    </Shell>
  );
}

// ──────────────────────────────────────────────────────────
// Layout shell (breadcrumb + header + tabs)
// ──────────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-slate-50">
      <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-16 space-y-6">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 text-sm text-slate-500"
        >
          <Link
            href="/home"
            className="flex items-center gap-1 hover:text-slate-900 transition-all duration-200"
          >
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 font-medium">Access Management</span>
        </nav>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-slate-800">Access Management</h1>
          <AccessTabs />
        </div>

        {children}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Rows
// ──────────────────────────────────────────────────────────

function ModuleRows({
  moduleKey,
  label,
  features,
  grants,
  open,
  onToggleOpen,
  onToggleParent,
  onToggleChild,
}: {
  moduleKey: string;
  label: string;
  features: FeatureDef[];
  grants: Grants;
  open: boolean;
  onToggleOpen: () => void;
  onToggleParent: (action: PermAction) => void;
  onToggleChild: (feature: FeatureDef, action: PermAction) => void;
}) {
  return (
    <>
      <tr className="bg-white border-b border-slate-200">
        <td className="px-6 py-3 sticky left-0 bg-white z-10">
          <button
            type="button"
            onClick={onToggleOpen}
            aria-expanded={open}
            className="inline-flex items-center gap-2 text-sm font-bold text-slate-800 hover:text-indigo-700 transition-colors duration-200"
          >
            <ChevronDown
              className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                open ? "" : "-rotate-90"
              }`}
              aria-hidden="true"
            />
            {label}
          </button>
        </td>
        {ACTION_COLUMNS.map((c) => {
          const kind = parentCellKind(features, c.key, grants);
          return (
            <td key={c.key} className="px-4 py-3 text-center">
              <MatrixCell
                kind={kind}
                onToggle={() => onToggleParent(c.key)}
                label={`${label} — ${c.label}`}
              />
            </td>
          );
        })}
      </tr>

      {open &&
        features.map((f) => (
          <tr
            key={f.key}
            className="bg-slate-50/40 border-b border-slate-100 hover:bg-slate-100/60 transition-colors duration-150"
          >
            <td className="px-6 py-2.5 sticky left-0 bg-inherit z-10">
              <span className="pl-6 text-sm font-medium text-slate-600">
                {f.label}
              </span>
            </td>
            {ACTION_COLUMNS.map((c) => {
              const kind = featureCellKind(f, c.key, grants);
              return (
                <td key={c.key} className="px-4 py-2.5 text-center">
                  <MatrixCell
                    kind={kind}
                    onToggle={() => onToggleChild(f, c.key)}
                    label={`${f.label} — ${c.label}`}
                  />
                </td>
              );
            })}
          </tr>
        ))}
    </>
  );
}

// ──────────────────────────────────────────────────────────
// Cell
// ──────────────────────────────────────────────────────────

function MatrixCell({
  kind,
  onToggle,
  label,
}: {
  kind: CellKind;
  onToggle: () => void;
  label: string;
}) {
  if (kind === "na") {
    return (
      <span
        className="inline-block w-6 text-center text-slate-300 font-semibold select-none"
        title="Not applicable to this feature"
        aria-label={`${label}: not applicable`}
      >
        —
      </span>
    );
  }
  if (kind === "locked") {
    return (
      <span
        className="inline-flex items-center justify-center w-6 h-6"
        title="Superadmin only — no role can grant this"
        aria-label={`${label}: superadmin only`}
      >
        <Lock className="w-4 h-4 text-slate-300" aria-hidden="true" />
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={kind === "allowed"}
      aria-label={`${label}: ${
        kind === "allowed"
          ? "allowed"
          : kind === "partial"
            ? "partially allowed"
            : "not allowed"
      }`}
      className="inline-flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 rounded-md"
    >
      <CellBox kind={kind} />
    </button>
  );
}

function CellBox({ kind }: { kind: CellKind }) {
  if (kind === "allowed") {
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-emerald-500 text-white shadow-sm">
        <Check className="w-3.5 h-3.5" strokeWidth={3} aria-hidden="true" />
      </span>
    );
  }
  if (kind === "partial") {
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-indigo-100 border border-indigo-300 text-indigo-600">
        <Minus className="w-3.5 h-3.5" strokeWidth={3} aria-hidden="true" />
      </span>
    );
  }
  if (kind === "locked") {
    return (
      <span className="inline-flex items-center justify-center w-5 h-5">
        <Lock className="w-4 h-4 text-slate-300" aria-hidden="true" />
      </span>
    );
  }
  // denied
  return (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-md border border-slate-300 bg-white hover:border-slate-400 transition-colors duration-150" />
  );
}

function LegendItem({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1.5">{children}</span>;
}

// ──────────────────────────────────────────────────────────
// Overflow menu (secondary actions — stubbed)
// ──────────────────────────────────────────────────────────

function OverflowMenu({
  onResetToDefault,
}: {
  onResetToDefault: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More actions"
        className="inline-flex items-center justify-center h-10 w-10 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-all duration-200"
      >
        <MoreHorizontal className="w-5 h-5" aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1 w-56 rounded-xl border border-slate-200 bg-white shadow-lg py-1 z-20"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onResetToDefault();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors duration-150"
          >
            <RotateCcw className="w-4 h-4 text-slate-400" aria-hidden="true" />
            Reset to default
          </button>
          <button
            type="button"
            role="menuitem"
            disabled
            title="Coming soon"
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-400 cursor-not-allowed"
          >
            <Copy className="w-4 h-4" aria-hidden="true" />
            Copy from another role
          </button>
        </div>
      )}
    </div>
  );
}
