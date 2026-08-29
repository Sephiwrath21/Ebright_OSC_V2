"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export interface StaffPoolPerson {
  id: number;
  fullName: string;
  position: string | null;
  branchCode: string | null;
  branchName: string | null;
  departmentCode: string | null;
  departmentName: string | null;
}

interface LocationOption {
  code: string;
  name: string;
}

interface Props {
  /** Already scope-limited server-side (see page.tsx's own staffPoolRows
   *  comment) — a department-/branch-scoped HOD/BM's browser is never sent
   *  a person outside their own scope in the first place, so nothing this
   *  component does client-side (search, the nested filters below) can ever
   *  surface someone outside it. This is the real enforcement; the nested
   *  dropdowns being hidden for them (canFilterLocation) is just UX on top. */
  pool: StaffPoolPerson[];
  /** Only CEO/Finance ("full" access, same flag the page's own Branch/
   *  Department filters already use) get the nested Department/Branch
   *  narrowing inside this picker — HOD/BM's pool is already fixed to their
   *  one department/branch, so those dropdowns would be a single-option,
   *  do-nothing control that wrongly implies they could search wider. */
  canFilterLocation: boolean;
  branchOptions: LocationOption[];
  departmentOptions: LocationOption[];
  selectedIds: number[];
  onApply: (ids: number[]) => void;
}

export default function StaffFilterPicker({ pool, canFilterLocation, branchOptions, departmentOptions, selectedIds, onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Immediate-apply (2026-08-28, see conversation) — every tick calls onApply
  // (a real server round-trip) right away, same as Branch/Department/Role on
  // this page, instead of batching into a draft committed only when the
  // popover closes. That batching made ticking look broken: the table only
  // ever updated after clicking away, which read as "ticking doesn't filter."
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return pool.filter((p) => {
      if (deptFilter && p.departmentCode !== deptFilter) return false;
      if (branchFilter && p.branchCode !== branchFilter) return false;
      if (term && !p.fullName.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [pool, search, deptFilter, branchFilter]);

  function toggle(id: number) {
    if (selectedIds.includes(id)) onApply(selectedIds.filter((x) => x !== id));
    else onApply([...selectedIds, id]);
  }

  function tickAllShown() {
    onApply([...new Set([...selectedIds, ...filtered.map((p) => p.id)])]);
  }

  function clearTicked() {
    onApply([]);
  }

  const selectedPeople = useMemo(() => pool.filter((p) => selectedIds.includes(p.id)), [pool, selectedIds]);
  const triggerLabel =
    selectedPeople.length === 0
      ? "All staff"
      : selectedPeople.length === 1
        ? selectedPeople[0].fullName
        : `${selectedPeople.length} staff selected`;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center justify-between gap-2 min-w-[140px] max-w-[180px] h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <span className="truncate">{triggerLabel}</span>
        <ChevronDown className="w-4 h-4 shrink-0 text-slate-400" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-[340px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg p-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name..."
            className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          {canFilterLocation && (
            <div className="mt-2 flex gap-2">
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="flex-1 h-9 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All departments</option>
                {departmentOptions.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.name}
                  </option>
                ))}
              </select>
              <select
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                className="flex-1 h-9 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All branches</option>
                {branchOptions.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>
              {filtered.length} shown · {selectedIds.length} ticked
            </span>
            <span className="flex items-center gap-2">
              <button type="button" onClick={tickAllShown} className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
                Tick all shown
              </button>
              <button type="button" onClick={clearTicked} className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
                Clear
              </button>
            </span>
          </div>

          <ul className="mt-2 max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border-t border-slate-100 dark:border-slate-800">
            {filtered.length === 0 && <li className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">No matches.</li>}
            {filtered.map((p) => {
              const subtitle = [p.departmentName ?? p.branchName ?? null, p.position].filter(Boolean).join(" · ");
              return (
                <li key={p.id}>
                  <label className="flex items-start gap-2.5 py-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(p.id)}
                      onChange={() => toggle(p.id)}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{p.fullName}</span>
                      {subtitle && <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">{subtitle}</span>}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
