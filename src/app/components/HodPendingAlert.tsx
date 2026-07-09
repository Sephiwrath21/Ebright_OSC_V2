"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Hourglass } from "lucide-react";
import { HOD_POSITION } from "@/app/attendance/leave/approval-logic";

/**
 * Yellow alert shown on the home page to a FT HOD when their department has pending
 * leave requests. Reuses /api/leave/approvals/count (which returns the HOD's pending
 * count for a FT HOD).
 */
export default function HodPendingAlert({ position }: { position?: string | null }) {
  const isHod = position === HOD_POSITION;
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isHod) return;
    let cancelled = false;
    fetch("/api/leave/approvals/count", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d && typeof d.count === "number") setCount(d.count);
      })
      .catch(() => {
        // network flake — no-op
      });
    return () => {
      cancelled = true;
    };
  }, [isHod]);

  if (!isHod || count === 0) return null;

  return (
    <div className="px-6 pt-4">
      <div className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <Hourglass className="w-4 h-4 shrink-0 text-amber-600" aria-hidden="true" />
        <span className="flex-1">
          {count === 1
            ? "There is 1 pending leave request awaiting your approval."
            : `There are ${count} pending leave requests awaiting your approval.`}
        </span>
        <Link
          href="/attendance/leave/approvals"
          className="shrink-0 inline-flex items-center justify-center rounded-lg bg-amber-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-amber-700 transition-colors"
        >
          Review
        </Link>
      </div>
    </div>
  );
}
