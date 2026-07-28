"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Check, ChevronDown } from "lucide-react";

// Searchable branch filter used on the Archive and Update pages. Value is the
// branch name; "" means the `allLabel` option (all branches). Type-to-filter,
// closes on outside click.
export default function BranchSearchSelect({
  value,
  onChange,
  branches,
  allLabel = "All Branches",
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  branches: readonly string[];
  allLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () => (q ? branches.filter(b => b.toLowerCase().includes(q)) : branches),
    [q, branches],
  );

  function pick(v: string) {
    onChange(v);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setQuery(""); }}
        className={
          "w-full flex items-center justify-between gap-2 p-3 border rounded-xl bg-slate-50 font-bold text-slate-700 transition-colors " +
          "focus:outline-none focus:ring-2 focus:ring-blue-400 " +
          (open ? "border-blue-500 ring-2 ring-blue-400" : "border-slate-200")
        }
      >
        <span className="truncate">{value || allLabel}</span>
        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
            <Search className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search branch…"
              className="w-full text-sm font-medium text-slate-700 placeholder:text-slate-400 outline-none bg-transparent"
            />
          </div>
          <ul className="max-h-60 overflow-y-auto py-1">
            <li>
              <Option label={allLabel} selected={value === ""} onClick={() => pick("")} />
            </li>
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-xs text-slate-400">No branches match “{query}”.</li>
            ) : (
              filtered.map(b => (
                <li key={b}>
                  <Option label={b} selected={value === b} onClick={() => pick(b)} />
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function Option({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors " +
        (selected ? "bg-blue-50 text-blue-700 font-semibold" : "text-slate-700 hover:bg-slate-50")
      }
    >
      <Check
        className={"w-4 h-4 shrink-0 " + (selected ? "text-blue-600" : "text-transparent")}
        aria-hidden="true"
      />
      <span className="truncate">{label}</span>
    </button>
  );
}
