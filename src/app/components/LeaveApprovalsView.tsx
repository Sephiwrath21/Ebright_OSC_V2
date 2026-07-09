"use client";

import Link from "next/link";
import { Home, ChevronRight } from "lucide-react";
import HodApprovalTable, { type HodApprovalItem } from "@/app/components/HodApprovalTable";

export default function LeaveApprovalsView({
  mode,
  items = [],
}: {
  mode: "hod" | "hr";
  items?: HodApprovalItem[];
}) {
  const title = mode === "hod" ? "Leave Approvals" : "Final Approvals";
  const subtitle =
    mode === "hod"
      ? "Approve or reject pending requests from your department."
      : "Give final approval to HOD-approved requests, company-wide.";

  return (
    <div className="min-h-full bg-slate-50">
      <div className="max-w-7xl mx-auto px-6 pt-4 pb-10 space-y-6">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 transition-colors">
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/attendance" className="hover:text-slate-900 transition-colors">Attendance</Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 font-medium">Approvals</span>
        </nav>

        <header>
          <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </header>

        <HodApprovalTable items={items} />
      </div>
    </div>
  );
}
