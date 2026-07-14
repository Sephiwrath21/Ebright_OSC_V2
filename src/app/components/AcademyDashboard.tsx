"use client";

import { useEffect, useState, useCallback } from "react";
import GreetingHeader from "@/app/components/GreetingHeader";
import ClickUpPieChart from "@/app/components/ClickUpPieChart";
import {
  Compass,
  Calendar,
  Activity,
  UserPlus,
  UserMinus,
  FileText,
  Sparkles,
  ListTodo,
  ArrowLeft,
  User,
  MapPin,
  Clock,
  BookOpen,
  GraduationCap,
} from "lucide-react";

interface AttendanceData {
  onboarding: number;
  offboarding: number;
  mc: number;
  al: number;
}

interface SMSStudent {
  id: string;
  name: string;
  branch: string | null;
  grade: number;
  active: boolean;
  created_at: string;
}

const BRANCH_MAP: Record<string, string> = {
  SA: "Shah Alam",
  SP: "Sri Petaling",
  KD: "Kota Damansara",
  AMP: "Ampang",
  AM: "Ampang",
  PU: "Puchong",
  PC: "Puchong",
  KA: "Kajang",
  SB: "Sungai Buloh",
  PJ: "Petaling Jaya",
};

function formatSmsBranch(code: string | null | undefined): string {
  if (!code) return "General / Unassigned";
  const upper = code.trim().toUpperCase();
  return BRANCH_MAP[upper] || upper;
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

export default function AcademyDashboard({
  userName,
  userEmail,
}: {
  userName?: string | null;
  userEmail?: string | null;
}) {
  const dummyDistribution = {
    PENDING: 184,
    COMPLETE: 492,
    "NOT APPLICABLE": 1,
    "N/A": 5,
  };

  const dummyDailyTasks = [
    { id: "86d3g0op1", name: "Review academy tutorial syllabus updates", status: "PENDING", listName: "Academy Core", url: "#" },
    { id: "86d3g0op2", name: "Audit SMS student registrations list", status: "PENDING", listName: "SMS Sync", url: "#" },
    { id: "86d3g0op3", name: "Prepare syllabus outline for Q3 intakes", status: "PENDING", listName: "Syllabus", url: "#" },
    { id: "86d3g0op4", name: "Verify class scheduling allocations", status: "COMPLETE", listName: "Schedules", url: "#" },
    { id: "86d3g0op5", name: "Prepare academy weekly coordinators sync", status: "COMPLETE", listName: "Academy Core", url: "#" },
  ];

  const greetName =
    userName?.split(" ")[0] ||
    userEmail?.split("@")[0] ||
    "academy";

  const [loading, setLoading] = useState(true);
  const [attendance, setAttendance] = useState<AttendanceData>({
    onboarding: 0,
    offboarding: 0,
    mc: 0,
    al: 0,
  });
  const [students, setStudents] = useState<SMSStudent[]>([]);
  const [braindump, setBraindump] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);

  // Load backend stats & SMS students
  const loadBackend = useCallback(() => {
    setLoading(true);
    fetch("/api/academy/dashboard")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          if (d.attendance) setAttendance(d.attendance);
          if (d.students) setStudents(d.students);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error loading Academy dashboard data:", err);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadBackend();
  }, [loadBackend]);

  // Load braindump from localStorage
  useEffect(() => {
    const savedBraindump = localStorage.getItem("academy_braindump");
    if (savedBraindump) setBraindump(savedBraindump);
  }, []);

  return (
    <div className="min-h-full bg-slate-50">
      <div className="max-w-7xl mx-auto px-6 pt-6 pb-12 space-y-6">
        
        {/* Header */}
        <div className="mb-6 w-full space-y-2">
          <GreetingHeader name={greetName} style={{ padding: "8px 0 4px" }} />
          <div className="flex justify-between items-center flex-wrap gap-2">
            <p className="text-sm text-slate-500">
              Hi, Academy Department! Here is your custom executive workspace.
            </p>
            {loading && (
              <span className="text-xs text-slate-400 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 animate-pulse font-medium">
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
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Compass className="w-5 h-5 text-blue-500" />
                Attendance Tracker
              </h2>
              <div className="grid grid-cols-2 gap-4">
                {/* Onboarding */}
                <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center text-white">
                    <UserPlus className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-blue-600/80 uppercase tracking-wider">Onboarding</p>
                    <p className="text-2xl font-bold text-slate-800 mt-0.5">{attendance.onboarding}</p>
                  </div>
                </div>

                {/* Offboarding */}
                <div className="p-4 bg-orange-50/50 rounded-2xl border border-orange-100 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center text-white">
                    <UserMinus className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-orange-600/80 uppercase tracking-wider">Offboarding</p>
                    <p className="text-2xl font-bold text-slate-800 mt-0.5">{attendance.offboarding}</p>
                  </div>
                </div>

                {/* Annual Leave */}
                <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center text-white">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-emerald-600/80 uppercase tracking-wider">Annual Leave</p>
                    <p className="text-2xl font-bold text-slate-800 mt-0.5">{attendance.al}</p>
                  </div>
                </div>

                {/* Medical Leave */}
                <div className="p-4 bg-rose-50/50 rounded-2xl border border-rose-100 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-rose-500 flex items-center justify-center text-white">
                    <Activity className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-rose-600/80 uppercase tracking-wider">Medical Leave (MC)</p>
                    <p className="text-2xl font-bold text-slate-800 mt-0.5">{attendance.mc}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. SMS Student Registrations Feed */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <GraduationCap className="w-5 h-5 text-indigo-500" />
                  Latest Student Registrations (SMS) ({students.length})
                </h2>
                <span className="text-[9px] font-bold text-slate-400 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded uppercase tracking-wide font-mono">
                  Database Active
                </span>
              </div>

              <div className="space-y-3 max-h-[250px] overflow-y-auto pr-1">
                {students.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-12">No student registrations synced recently.</p>
                ) : (
                  students.map((student, idx) => (
                    <div
                      key={student.id}
                      className="p-4 bg-slate-50 border border-slate-100 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-slate-400" />
                          <span className="font-bold text-slate-800 text-sm">
                            {idx + 1}. {student.name}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold border uppercase tracking-wider ${
                            student.active 
                              ? "bg-emerald-50 text-emerald-600 border-emerald-100" 
                              : "bg-slate-100 text-slate-500 border-slate-200"
                          }`}>
                            {student.active ? "Active" : "Inactive"}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-4 text-slate-500">
                          <span className="flex items-center gap-1">
                            <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                            Grade {student.grade}
                          </span>
                          <span className="flex items-center gap-1 text-slate-600 font-medium">
                            <MapPin className="w-3.5 h-3.5 text-indigo-400" />
                            {formatSmsBranch(student.branch)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 text-[10px] text-slate-400 font-bold self-end sm:self-center font-mono">
                        <Clock className="w-3.5 h-3.5 text-slate-300" />
                        {formatTime(student.created_at)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

          {/* Right Column (Width 5/12) */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* 3. ClickUp Optimization Progress */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between text-slate-800">
              <div>
                {selectedStatus === null ? (
                  <>
                    <h2 className="text-base font-semibold text-slate-900 mb-2 flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <ListTodo className="w-5 h-5 text-teal-500" />
                        Daily | Tue - Sat
                      </span>
                      <span className="text-[9px] font-bold text-slate-400 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded uppercase tracking-wide font-mono">
                        Demo Mode
                      </span>
                    </h2>

                    <div className="flex justify-center items-center py-1">
                      <ClickUpPieChart
                        distribution={dummyDistribution}
                        onSliceClick={setSelectedStatus}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                      <button
                        onClick={() => setSelectedStatus(null)}
                        className="p-1 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors flex items-center gap-1 text-xs font-bold"
                      >
                        <ArrowLeft className="w-4 h-4" />
                        Back to Chart
                      </button>
                      <span className="text-xs font-black text-slate-500 uppercase tracking-wider">
                        {selectedStatus} ({dummyDailyTasks.filter((t) => t.status === selectedStatus).length})
                      </span>
                    </div>

                    <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                      {dummyDailyTasks.filter((t) => t.status === selectedStatus).length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-12">No tasks found for this status.</p>
                      ) : (
                        dummyDailyTasks
                          .filter((t) => t.status === selectedStatus)
                          .map((t) => (
                            <a
                              key={t.id}
                              href={t.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-start gap-2.5 p-3 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-200/60 text-xs transition-all duration-200"
                            >
                              <span className="font-mono text-[10px] text-slate-400 font-bold">#{t.id}</span>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-slate-700 leading-tight hover:underline">{t.name}</p>
                                <p className="text-[9px] text-slate-400 font-bold mt-1 uppercase tracking-wider">
                                  List: {t.listName}
                                </p>
                              </div>
                            </a>
                          ))
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* 4. Braindump Section */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
              <div className="flex-1 flex flex-col">
                <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center justify-between">
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
                    localStorage.setItem("academy_braindump", e.target.value);
                  }}
                  placeholder="Write down any curriculum notes, student issues, class schedules or tutor plans here..."
                  className="w-full flex-1 min-h-[160px] border border-slate-200 rounded-xl p-3 text-sm bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none font-mono leading-relaxed"
                />
              </div>
            </div>

          </div>

        </div>
      </div>
    </div>
  );
}
