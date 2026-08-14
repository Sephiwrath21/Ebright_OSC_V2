"use client";

import { useEffect, useState, useCallback, type ReactNode } from "react";
import GreetingHeader from "@/app/components/GreetingHeader";
import {
  Compass,
  Calendar,
  Activity,
  UserPlus,
  UserMinus,
  FileText,
  Sparkles,
  Phone,
  Mail,
  User,
  MapPin,
  Clock,
  Globe,
} from "lucide-react";

interface AttendanceData {
  onboarding: number;
  offboarding: number;
  mc: number;
  al: number;
}

interface CRMLead {
  id: number;
  full_name: string;
  phone_number: string;
  email: string;
  branch: string | null;
  submitted_at_my: string;
}

function formatBranch(branch: string | null | undefined): string {
  if (!branch) return "General / Unassigned";
  return branch
    .replace(/_/g, " ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return isoString;
  }
}

export default function OperationsDashboard({
  userName,
  userEmail,
  taskOverview,
}: {
  userName?: string | null;
  userEmail?: string | null;
  /** Server-rendered department Task Manager overview (real data slot). */
  taskOverview?: ReactNode;
}) {
  const greetName =
    userName?.split(" ")[0] ||
    userEmail?.split("@")[0] ||
    "operations";

  const [loading, setLoading] = useState(true);
  const [attendance, setAttendance] = useState<AttendanceData>({
    onboarding: 0,
    offboarding: 0,
    mc: 0,
    al: 0,
  });
  const [leads, setLeads] = useState<CRMLead[]>([]);
  const [braindump, setBraindump] = useState("");

  // Load backend stats & CRM leads
  const loadBackend = useCallback(() => {
    setLoading(true);
    fetch("/api/operations/dashboard")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          if (d.attendance) setAttendance(d.attendance);
          if (d.leads) setLeads(d.leads);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error loading Operations dashboard data:", err);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadBackend();
  }, [loadBackend]);

  // Load braindump from localStorage
  useEffect(() => {
    const savedBraindump = localStorage.getItem("operations_braindump");
    if (savedBraindump) setBraindump(savedBraindump);
  }, []);

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950">
      <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-12 space-y-6">

        {/* Header */}
        <div className="mb-6 w-full space-y-2">
          <GreetingHeader name={greetName} style={{ padding: "8px 0 4px" }} />
          <div className="flex justify-between items-center flex-wrap gap-2">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Hi, Operations Department! Here is your custom executive workspace.
            </p>
            {loading && (
              <span className="text-xs text-slate-400 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 animate-pulse font-medium dark:bg-slate-800 dark:border-slate-700">
                Syncing databases...
              </span>
            )}
          </div>
        </div>

        {/* --- MAIN GRID SECTION --- */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

          {/* Left Column (Width 7/12) */}
          <div className="lg:col-span-7 space-y-6">

            {/* 1. Attendance Tracker */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm dark:bg-slate-900 dark:border-slate-800">
              <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2 dark:text-slate-100">
                <Compass className="w-5 h-5 text-blue-500" />
                Attendance Tracker
              </h2>
              <div className="grid grid-cols-2 gap-4">
                {/* Onboarding */}
                <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100 flex items-center gap-4 dark:bg-blue-900/40 dark:border-blue-700">
                  <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center text-white">
                    <UserPlus className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-blue-600/80 uppercase tracking-wider dark:text-blue-300">Onboarding</p>
                    <p className="text-2xl font-bold text-slate-800 mt-0.5 dark:text-slate-200">{attendance.onboarding}</p>
                  </div>
                </div>

                {/* Offboarding */}
                <div className="p-4 bg-orange-50/50 rounded-2xl border border-orange-100 flex items-center gap-4 dark:bg-orange-900/40 dark:border-orange-700">
                  <div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center text-white">
                    <UserMinus className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-orange-600/80 uppercase tracking-wider dark:text-orange-300">Offboarding</p>
                    <p className="text-2xl font-bold text-slate-800 mt-0.5 dark:text-slate-200">{attendance.offboarding}</p>
                  </div>
                </div>

                {/* Annual Leave */}
                <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100 flex items-center gap-4 dark:bg-emerald-900/40 dark:border-emerald-700">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center text-white">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-emerald-600/80 uppercase tracking-wider dark:text-emerald-300">Annual Leave</p>
                    <p className="text-2xl font-bold text-slate-800 mt-0.5 dark:text-slate-200">{attendance.al}</p>
                  </div>
                </div>

                {/* Medical Leave */}
                <div className="p-4 bg-rose-50/50 rounded-2xl border border-rose-100 flex items-center gap-4 dark:bg-rose-900/40 dark:border-rose-700">
                  <div className="w-10 h-10 rounded-xl bg-rose-500 flex items-center justify-center text-white">
                    <Activity className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-rose-600/80 uppercase tracking-wider dark:text-rose-300">Medical Leave (MC)</p>
                    <p className="text-2xl font-bold text-slate-800 mt-0.5 dark:text-slate-200">{attendance.mc}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. CRM Leads Feed */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm dark:bg-slate-900 dark:border-slate-800">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2 dark:text-slate-100">
                  <Globe className="w-5 h-5 text-indigo-500" />
                  Latest CRM Leads ({leads.length})
                </h2>
                <span className="text-[9px] font-bold text-slate-400 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded uppercase tracking-wide dark:bg-slate-800 dark:border-slate-700">
                  Database Active
                </span>
              </div>

              <div className="space-y-3 max-h-[250px] overflow-y-auto pr-1">
                {leads.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-12">No CRM leads synced recently.</p>
                ) : (
                  leads.map((lead, idx) => (
                    <div
                      key={lead.id}
                      className="p-4 bg-slate-50 border border-slate-100 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs dark:bg-slate-800/50 dark:border-slate-800"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-slate-400" />
                          <span className="font-bold text-slate-800 text-sm dark:text-slate-200">
                            {idx + 1}. {lead.full_name}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-4 text-slate-500 dark:text-slate-400">
                          <span className="flex items-center gap-1">
                            <Phone className="w-3.5 h-3.5 text-slate-400" />
                            {lead.phone_number}
                          </span>
                          <span className="flex items-center gap-1">
                            <Mail className="w-3.5 h-3.5 text-slate-400" />
                            {lead.email}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-slate-600 font-medium dark:text-slate-300">
                          <MapPin className="w-3.5 h-3.5 text-indigo-400" />
                          {formatBranch(lead.branch)}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 text-[10px] text-slate-400 font-bold self-end sm:self-center font-mono">
                        <Clock className="w-3.5 h-3.5 text-slate-300" />
                        {formatTime(lead.submitted_at_my)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

          {/* Right Column (Width 5/12) */}
          <div className="lg:col-span-5 space-y-6">

            {/* 4. Braindump Section */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between dark:bg-slate-900 dark:border-slate-800">
              <div className="flex-1 flex flex-col">
                <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center justify-between dark:text-slate-100">
                  <span className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-purple-500" />
                    Braindump
                  </span>
                  <span className="text-[10px] uppercase font-black tracking-widest text-slate-400 flex items-center gap-1 font-mono">
                    <Sparkles className="w-3 h-3 text-purple-400" />
                    Autosaved
                  </span>
                </h2>
                <textarea
                  value={braindump}
                  onChange={(e) => {
                    setBraindump(e.target.value);
                    localStorage.setItem("operations_braindump", e.target.value);
                  }}
                  placeholder="Write down any notes, thoughts, tasks, ideas or processes to improve here..."
                  className="w-full flex-1 min-h-[160px] border border-slate-200 rounded-xl p-3 text-sm bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none font-mono leading-relaxed dark:border-slate-500 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
            </div>

          </div>

        </div>

        {/* Real department Task Manager status (server-rendered slot) —
            ALWAYS the LAST section on Home, for every account type
            (2026-07-28 placement decision). */}
        {taskOverview}
      </div>
    </div>
  );
}
