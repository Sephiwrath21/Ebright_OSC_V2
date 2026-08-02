"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Home,
  ChevronRight,
  Search,
  Check,
  X,
  Loader2,
  AlertCircle,
  ShieldCheck,
} from "lucide-react";
import { reviewJustification } from "@/app/attendance/justifications/actions";

export interface ApprovalRow {
  id: string;
  emp_no: string | null;
  emp_name: string | null;
  branch: string | null;
  just_date: string;
  reason: string | null;
  status: string | null;
  source: string | null;
  justified_by: string | null;
  reviewed_by: string | null;
  review_note: string | null;
  reviewed_at: string | null;
}

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-rose-100 text-rose-700",
};

type Filter = "pending" | "all";

export default function JustificationApprovalsView({ rows }: { rows: ApprovalRow[] }) {
  const [filter, setFilter] = useState<Filter>("pending");
  const [query, setQuery] = useState("");

  const pendingCount = useMemo(
    () => rows.filter((r) => (r.status ?? "") === "pending").length,
    [rows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "pending" && (r.status ?? "") !== "pending") return false;
      if (q) {
        const hay = [r.emp_name, r.emp_no, r.branch, r.reason]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filter, query]);

  return (
    <div className="min-h-full bg-slate-50">
      <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-16 space-y-6">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 transition-all duration-200">
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 font-medium">Attendance Justifications</span>
        </nav>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Attendance Justifications</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Review staff-submitted reasons for absent or late days.
            </p>
          </div>
          {pendingCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 text-amber-700 px-3 py-1 text-sm font-semibold">
              <ShieldCheck className="w-4 h-4" aria-hidden="true" />
              {pendingCount} pending
            </span>
          )}
        </div>

        <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="border-b border-slate-200 px-4 sm:px-6 py-4 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" aria-hidden="true" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, emp no, branch, reason…"
                className="h-10 w-full pl-9 pr-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all duration-200"
              />
            </div>
            <div className="inline-flex rounded-xl border border-slate-200 overflow-hidden">
              {(["pending", "all"] as Filter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`h-10 px-4 text-sm font-semibold capitalize transition-colors ${
                    filter === f ? "bg-blue-600 text-white" : "bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100 text-sm font-semibold text-slate-700">
                  <th className="text-left px-6 py-3">Employee</th>
                  <th className="text-left px-6 py-3">Date</th>
                  <th className="text-left px-6 py-3">Reason</th>
                  <th className="text-center px-6 py-3">Status</th>
                  <th className="text-right px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-16 text-center text-sm font-medium text-slate-400">
                      {filter === "pending" ? "No pending justifications." : "No justifications in range."}
                    </td>
                  </tr>
                ) : (
                  filtered.map((r, idx) => (
                    <ApprovalRowView key={r.id || `${r.emp_no}-${r.just_date}-${idx}`} row={r} zebra={idx % 2 === 1} />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function ApprovalRowView({ row, zebra }: { row: ApprovalRow; zebra: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const status = row.status ?? "pending";
  const isPending = status === "pending";

  const submit = (decision: "approve" | "reject") => {
    if (!row.emp_no) {
      setError("Missing employee number.");
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set("emp_no", row.emp_no);
    fd.set("date", row.just_date);
    fd.set("decision", decision);
    if (decision === "reject" && note.trim()) fd.set("note", note.trim());
    startTransition(async () => {
      const res = await reviewJustification(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setRejecting(false);
      setNote("");
      router.refresh();
    });
  };

  return (
    <tr className={`${zebra ? "bg-slate-50/50" : "bg-white"} border-b border-slate-100 last:border-b-0 align-top`}>
      <td className="px-6 py-4">
        <div className="font-semibold text-slate-800">{row.emp_name ?? "—"}</div>
        <div className="text-[12px] text-slate-500">
          <span className="font-mono">{row.emp_no ?? "—"}</span>
          {row.branch && <span> · {row.branch}</span>}
        </div>
        {row.source === "staff" && (
          <span className="mt-1 inline-flex items-center rounded-full bg-blue-50 text-blue-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
            Self-submitted
          </span>
        )}
      </td>
      <td className="px-6 py-4 tabular-nums text-slate-700">{row.just_date}</td>
      <td className="px-6 py-4 max-w-[320px]">
        <p className="text-slate-700 whitespace-pre-wrap">{row.reason ?? "—"}</p>
        {row.reviewed_by && (
          <p className="mt-1 text-[11px] text-slate-400">
            {status === "approved" ? "Approved" : "Reviewed"} by {row.reviewed_by}
            {row.reviewed_at ? ` · ${row.reviewed_at}` : ""}
            {row.review_note ? ` · "${row.review_note}"` : ""}
          </p>
        )}
        {error && (
          <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-rose-600">
            <AlertCircle className="w-3 h-3" aria-hidden="true" />
            {error}
          </p>
        )}
      </td>
      <td className="px-6 py-4 text-center">
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold capitalize ${STATUS_STYLE[status] ?? "bg-slate-100 text-slate-600"}`}>
          {status}
        </span>
      </td>
      <td className="px-6 py-4">
        {isPending ? (
          rejecting ? (
            <div className="flex flex-col items-end gap-2 min-w-[220px]">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Reason for rejection (optional)"
                className="h-9 w-full rounded-lg border border-slate-200 px-3 text-xs focus:outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setRejecting(false); setNote(""); }}
                  disabled={pending}
                  className="h-8 px-3 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => submit("reject")}
                  disabled={pending}
                  className="inline-flex items-center gap-1 h-8 px-3 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 disabled:opacity-60"
                >
                  {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                  Confirm reject
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejecting(true)}
                disabled={pending}
                className="inline-flex items-center gap-1 h-8 px-3 rounded-lg border border-slate-200 text-slate-700 text-xs font-semibold hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-60"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
                Reject
              </button>
              <button
                type="button"
                onClick={() => submit("approve")}
                disabled={pending}
                className="inline-flex items-center gap-1 h-8 px-3 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-60"
              >
                {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Approve
              </button>
            </div>
          )
        ) : (
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => submit(status === "approved" ? "reject" : "approve")}
              disabled={pending}
              className="h-8 px-3 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-100 disabled:opacity-60"
            >
              {pending ? "…" : status === "approved" ? "Revoke" : "Approve"}
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
