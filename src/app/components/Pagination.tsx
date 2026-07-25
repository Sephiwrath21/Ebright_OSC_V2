"use client";

import { useState } from "react";

// Shared "show [size] of N entries" + prev/current/next + "Go to page"
// pagination — originally built inline (twice, duplicated) in
// EmployeeNamelistView.tsx's List view and its "Show More" modal; extracted
// here so every employee list (including EmployeeOverviewView's cross-stage
// "Employee Records" table) uses the exact same control. Previously rendered
// one button per page, which wrapped onto multiple ragged lines once a list
// had more than a handful of pages (e.g. 212 employees / 15 per page = 15
// buttons) — replaced with a fixed-width prev/current-page/next control plus
// a direct "Go to page" jump, so the control's width no longer grows with
// totalPages.
interface Props {
  page: number;
  totalPages: number;
  pageSize: number;
  pageSizeOptions: number[];
  totalCount: number;
  totalLabel?: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  className?: string;
}

export default function Pagination({
  page,
  totalPages,
  pageSize,
  pageSizeOptions,
  totalCount,
  totalLabel = "entries",
  onPageChange,
  onPageSizeChange,
  className = "",
}: Props) {
  const [goToValue, setGoToValue] = useState("");

  function goToPage() {
    const n = Number(goToValue);
    if (!Number.isInteger(n) || n < 1 || n > totalPages) return;
    onPageChange(n);
    setGoToValue("");
  }

  return (
    <div className={`flex flex-wrap items-center gap-2.5 text-sm text-black/67 ${className}`}>
      <span>show</span>
      <select
        value={pageSize}
        onChange={(e) => onPageSizeChange(Number(e.target.value))}
        className="h-[30px] rounded-lg border border-black/25 px-2 text-sm"
      >
        {pageSizeOptions.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <span>
        of {totalCount} {totalLabel}
      </span>

      <nav className="flex items-center gap-2 ml-auto" aria-label="Result pages">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
          className="w-7 h-7 rounded-full border border-black/15 text-slate-500 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:bg-slate-100"
        >
          ‹
        </button>
        <span
          aria-current="page"
          className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-medium flex items-center justify-center"
        >
          {page}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
          className="w-7 h-7 rounded-full border border-black/15 text-slate-500 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:bg-slate-100"
        >
          ›
        </button>

        <span className="ml-2 text-black/50">Go to page</span>
        <input
          type="number"
          min={1}
          max={totalPages}
          value={goToValue}
          onChange={(e) => setGoToValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              goToPage();
            }
          }}
          aria-label="Page number"
          className="w-16 h-8 rounded-lg border border-black/25 px-2 text-sm"
        />
        <button
          type="button"
          onClick={goToPage}
          className="h-8 px-4 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600"
        >
          Go
        </button>
      </nav>
    </div>
  );
}
