"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { 
  Home as HomeIcon, 
  ChevronRight, 
  Store, 
  Clock, 
  Plus, 
  Trash2, 
  ArrowDown, 
  Check, 
  Save, 
  Undo,
  Calendar,
  Building,
  AlertCircle,
  Copy,
  Clipboard
} from "lucide-react";
import AppShell from "@/app/components/AppShell";
import { ALL_BRANCHES } from "@/lib/manpowerUtils";

// Define the structure of a Time Slot
interface TimeSlot {
  id: string;
  startTime: string; // e.g. "16:15" (24-hour style for input compatibility) or text "04:15 PM"
  endTime: string;
  type: "Opening" | "Class" | "Closing";
}

// Define the schedule for a single day
interface DaySchedule {
  branch_operating_day_id?: number;
  isOpen: boolean;
  openingTime: string;
  closingTime: string;
  slots: TimeSlot[];
}

// Helper to format 24h string "16:15" to 12h string "04:15 PM"
function format24to12(time24: string): string {
  if (!time24) return "";
  const parts = time24.split(":");
  if (parts.length < 2) return time24;
  let hrs = parseInt(parts[0], 10);
  const mins = parts[1];
  const ampm = hrs >= 12 ? "PM" : "AM";
  hrs = hrs % 12;
  hrs = hrs ? hrs : 12; // the hour '0' should be '12'
  const formattedHrs = hrs < 10 ? `0${hrs}` : hrs;
  return `${formattedHrs}:${mins} ${ampm}`;
}

// Helper to parse "04:15 PM" back to 24h format for standard time inputs
function format12to24(time12: string): string {
  if (!time12) return "00:00";
  const match = time12.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return "00:00";
  let [_, hrsStr, mins, ampm] = match;
  let hrs = parseInt(hrsStr, 10);
  if (ampm.toUpperCase() === "PM" && hrs !== 12) hrs += 12;
  if (ampm.toUpperCase() === "AM" && hrs === 12) hrs = 0;
  const formattedHrs = hrs < 10 ? `0${hrs}` : hrs;
  return `${formattedHrs}:${mins}`;
}

// Helper to calculate duration between two 24h times in hours
function calculateDuration(start: string, end: string): string {
  if (!start || !end) return "0.00h";
  
  const parseToMins = (time: string) => {
    const parts = time.split(":");
    if (parts.length < 2) return 0;
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  };

  const startMins = parseToMins(start);
  const endMins = parseToMins(end);
  let diff = endMins - startMins;

  if (diff < 0) {
    // If end time is before start time, assume it wraps to the next day
    diff += 24 * 60;
  }

  const hours = diff / 60;
  return `${hours.toFixed(2)}h`;
}

// Helper to add hours and minutes to a 24h format time string
function addTime(time24: string, hoursToAdd: number, minsToAdd: number): string {
  if (!time24) return "00:00";
  const parts = time24.split(":");
  if (parts.length < 2) return time24;
  let h = parseInt(parts[0], 10);
  let m = parseInt(parts[1], 10);
  
  m += minsToAdd;
  h += hoursToAdd + Math.floor(m / 60);
  m = m % 60;
  h = h % 24;

  const formattedH = h < 10 ? `0${h}` : h;
  const formattedM = m < 10 ? `0${m}` : m;
  return `${formattedH}:${formattedM}`;
}

// Initial mock schedule data generator
const initialWeekSchedule: Record<string, DaySchedule> = {
  Mon: {
    isOpen: true,
    openingTime: "16:00",
    closingTime: "22:00",
    slots: [
      { id: "1", startTime: "16:00", endTime: "16:30", type: "Opening" },
      { id: "2", startTime: "16:30", endTime: "18:00", type: "Class" },
      { id: "3", startTime: "18:00", endTime: "22:00", type: "Class" },
    ]
  },
  Tue: {
    isOpen: true,
    openingTime: "16:00",
    closingTime: "22:00",
    slots: [
      { id: "1", startTime: "16:00", endTime: "16:30", type: "Opening" },
      { id: "2", startTime: "16:30", endTime: "19:00", type: "Class" },
      { id: "3", startTime: "19:00", endTime: "22:00", type: "Class" },
    ]
  },
  Wed: {
    isOpen: true,
    openingTime: "16:15",
    closingTime: "22:00",
    slots: [
      { id: "w1", startTime: "16:15", endTime: "16:30", type: "Opening" },
      { id: "w2", startTime: "16:30", endTime: "17:45", type: "Class" },
      { id: "w3", startTime: "18:00", endTime: "19:15", type: "Class" },
    ]
  },
  Thu: {
    isOpen: true,
    openingTime: "16:00",
    closingTime: "22:00",
    slots: [
      { id: "1", startTime: "16:00", endTime: "16:30", type: "Opening" },
      { id: "2", startTime: "16:30", endTime: "22:00", type: "Class" },
    ]
  },
  Fri: {
    isOpen: true,
    openingTime: "16:00",
    closingTime: "22:00",
    slots: [
      { id: "1", startTime: "16:00", endTime: "16:30", type: "Opening" },
      { id: "2", startTime: "16:30", endTime: "22:00", type: "Class" },
    ]
  },
  Sat: {
    isOpen: false,
    openingTime: "09:00",
    closingTime: "18:00",
    slots: []
  },
  Sun: {
    isOpen: false,
    openingTime: "09:00",
    closingTime: "18:00",
    slots: []
  }
};

// Only these three map to valid DB slot_type values
const slotTypes = ["Opening", "Class", "Closing"] as const;

// Map DB slot_type → UI label
function dbToUi(dbType: string): TimeSlot["type"] {
  if (dbType === "coach")   return "Class";
  if (dbType === "closing") return "Closing";
  return "Opening"; // default for "opening" and any unknown
}

// Map UI label → DB slot_type
function uiToDb(uiType: string): string {
  if (uiType === "Class")   return "coach";
  if (uiType === "Closing") return "closing";
  return "opening"; // default for "Opening"
}

function ScheduleSettingsContent() {
  const [selectedBranch, setSelectedBranch] = useState("Subang Taipan");
  const [selectedDay, setSelectedDay] = useState<"Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun">("Wed");
  
  // Keep schedule in memory per branch-day combination for complete simulation
  // Keys: "BranchName-Day" -> DaySchedule
  const [schedules, setSchedules] = useState<Record<string, DaySchedule>>({});
  const [positions, setPositions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedDaySchedule, setCopiedDaySchedule] = useState<{
    isOpen: boolean;
    openingTime: string;
    closingTime: string;
    slots: { startTime: string; endTime: string; type: TimeSlot["type"] }[];
  } | null>(null);

  // Fetch branch schedule settings from the database
  useEffect(() => {
    let cancelled = false;
    async function loadSettings() {
      setLoading(true);
      try {
        const res = await fetch(`/api/schedules/settings?branchName=${encodeURIComponent(selectedBranch)}`);
        if (!res.ok) {
          const bodyText = await res.text().catch(() => "");
          throw new Error(`Failed to load settings (status: ${res.status}, body: ${bodyText})`);
        }
        const data = await res.json();
        if (cancelled) return;
        
        if (data.success && data.operatingDays && data.operatingDays.length > 0) {
          const newSchedules: Record<string, DaySchedule> = {};

          // Days with no branch_operating_day row for this branch are genuinely
          // unconfigured — show an empty/closed state, not another branch's
          // (or a generic mock) template.
          const daysOfWeek = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
          daysOfWeek.forEach(day => {
            newSchedules[`${selectedBranch}-${day}`] = {
              branch_operating_day_id: undefined,
              isOpen: false,
              openingTime: "09:00",
              closingTime: "18:00",
              slots: []
            };
          });

          // Overlay DB values
          data.operatingDays.forEach((od: any) => {
            newSchedules[`${selectedBranch}-${od.day_of_week}`] = {
              branch_operating_day_id: od.branch_operating_day_id,
              isOpen: od.is_active,
              openingTime: od.open_time || "09:00",
              closingTime: od.close_time || "22:00",
              slots: od.slots.map((s: any) => ({
                id: s.slot_id.toString(),
                startTime: s.slot_start,
                endTime: s.slot_end,
                type: dbToUi(s.slot_type),
              }))
            };
          });

          setSchedules(prev => ({ ...prev, ...newSchedules }));
          setPositions(data.positions || []);
        } else {
          // Branch has no operating-day setup at all — show an empty/closed
          // state for every day rather than a generic mock schedule.
          const newSchedules: Record<string, DaySchedule> = {};
          const daysOfWeek = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
          daysOfWeek.forEach(day => {
            newSchedules[`${selectedBranch}-${day}`] = {
              branch_operating_day_id: undefined,
              isOpen: false,
              openingTime: "09:00",
              closingTime: "18:00",
              slots: []
            };
          });
          setSchedules(prev => ({ ...prev, ...newSchedules }));
          setPositions([]);
        }
      } catch (err) {
        console.error("Load settings error:", err);
        showToast("Error loading branch settings");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    
    loadSettings();
    return () => {
      cancelled = true;
    };
  }, [selectedBranch]);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const currentScheduleKey = `${selectedBranch}-${selectedDay}`;
  const currentSchedule = useMemo(() => {
    return schedules[currentScheduleKey] || {
      isOpen: false,
      openingTime: "09:00",
      closingTime: "18:00",
      slots: []
    };
  }, [schedules, currentScheduleKey]);

  // Update schedule handlers
  const handleToggleOpen = async (isOpen: boolean) => {
    // 1. Update local state immediately
    setSchedules(prev => ({
      ...prev,
      [currentScheduleKey]: {
        ...prev[currentScheduleKey],
        isOpen
      }
    }));

    // 2. Auto-save this toggle to the database!
    setLoading(true);
    try {
      const sched = schedules[currentScheduleKey] || {
        branch_operating_day_id: undefined,
        isOpen: false,
        openingTime: "09:00",
        closingTime: "22:00",
        slots: []
      };

      let openTime = sched.openingTime;
      let closeTime = sched.closingTime;
      if (sched.slots.length > 0) {
        openTime = sched.slots[0].startTime;
        closeTime = sched.slots[sched.slots.length - 1].endTime;
      }

      const singleDayPayload = {
        branch_operating_day_id: sched.branch_operating_day_id,
        day_of_week: selectedDay,
        open_time: openTime,
        close_time: closeTime,
        is_active: isOpen,
        slots: sched.slots.map(s => ({
          slot_start: s.startTime,
          slot_end:   s.endTime,
          slot_type:  uiToDb(s.type),
        }))
      };

      const res = await fetch("/api/schedules/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          branchName: selectedBranch,
          operatingDays: [singleDayPayload]
        })
      });

      if (!res.ok) throw new Error("POST request failed");
      const data = await res.json();
      if (data.success) {
        showToast(`${selectedDay} is now set as ${isOpen ? "Open" : "Closed"}. Saved!`);
        if (data.operatingDays) {
          setSchedules(prev => {
            const newSchedules = { ...prev };
            data.operatingDays.forEach((od: any) => {
              newSchedules[`${selectedBranch}-${od.day_of_week}`] = {
                branch_operating_day_id: od.branch_operating_day_id,
                isOpen: od.is_active,
                openingTime: od.open_time || "09:00",
                closingTime: od.close_time || "22:00",
                slots: od.slots.map((s: any) => ({
                  id: s.slot_id.toString(),
                  startTime: s.slot_start,
                  endTime: s.slot_end,
                  type: dbToUi(s.slot_type)
                }))
              };
            });
            return newSchedules;
          });
        }
      } else {
        showToast("Error: " + (data.error || "Failed to save settings"));
      }
    } catch (err) {
      console.error("Auto-save toggle error:", err);
      showToast("Error saving day status");
    } finally {
      setLoading(false);
    }
  };

  const handleTimeChange = (field: "openingTime" | "closingTime", val: string) => {
    setSchedules(prev => ({
      ...prev,
      [currentScheduleKey]: {
        ...prev[currentScheduleKey],
        [field]: val
      }
    }));
  };

  const handleUpdateSlot = (slotId: string, updates: Partial<TimeSlot>) => {
    setSchedules(prev => {
      const current = prev[currentScheduleKey];
      const slotsCopy = current.slots.map(s => ({ ...s }));
      
      const targetIndex = slotsCopy.findIndex(s => s.id === slotId);
      if (targetIndex === -1) return prev;

      // 1. Apply updates to the target slot
      const targetSlot = slotsCopy[targetIndex];
      const merged = { ...targetSlot, ...updates };
      
      if (merged.type === "Class") {
        if (updates.startTime !== undefined || updates.type !== undefined) {
          merged.endTime = addTime(merged.startTime, 1, 15);
        }
      }
      slotsCopy[targetIndex] = merged;

      // 2. Cascade forward to all subsequent slots
      for (let i = targetIndex + 1; i < slotsCopy.length; i++) {
        slotsCopy[i].startTime = slotsCopy[i - 1].endTime;
        if (slotsCopy[i].type === "Class") {
          slotsCopy[i].endTime = addTime(slotsCopy[i].startTime, 1, 15);
        }
      }

      return {
        ...prev,
        [currentScheduleKey]: {
          ...current,
          slots: slotsCopy
        }
      };
    });
  };

  const handleAddSlot = () => {
    setSchedules(prev => {
      const current = prev[currentScheduleKey];
      const lastSlot = current.slots[current.slots.length - 1];
      
      // Smart default values: start slot after last slot, or at opening time
      const startTime = lastSlot ? lastSlot.endTime : current.openingTime;
      // Default to Class type with automatic 1.25h (1h 15m) duration
      const type = "Class";
      const endTime = addTime(startTime, 1, 15);

      const newSlot: TimeSlot = {
        id: Date.now().toString(),
        startTime,
        endTime,
        type
      };

      return {
        ...prev,
        [currentScheduleKey]: {
          ...current,
          slots: [...current.slots, newSlot]
        }
      };
    });

    showToast("Added new time slot");
  };

  const handleDeleteSlot = (slotId: string) => {
    setSchedules(prev => {
      const current = prev[currentScheduleKey];
      return {
        ...prev,
        [currentScheduleKey]: {
          ...current,
          slots: current.slots.filter(s => s.id !== slotId)
        }
      };
    });
    showToast("Deleted time slot");
  };

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleCopyDay = () => {
    setCopiedDaySchedule({
      isOpen: currentSchedule.isOpen,
      openingTime: currentSchedule.openingTime,
      closingTime: currentSchedule.closingTime,
      slots: currentSchedule.slots.map(s => ({
        startTime: s.startTime,
        endTime: s.endTime,
        type: s.type
      }))
    });
    showToast(`Copied ${selectedBranch} - ${selectedDay} schedule to clipboard!`);
  };

  const handlePasteDay = () => {
    if (!copiedDaySchedule) return;
    setSchedules(prev => {
      const current = prev[currentScheduleKey];
      return {
        ...prev,
        [currentScheduleKey]: {
          ...current,
          isOpen: copiedDaySchedule.isOpen,
          openingTime: copiedDaySchedule.openingTime,
          closingTime: copiedDaySchedule.closingTime,
          slots: copiedDaySchedule.slots.map((s, idx) => ({
            id: `pasted-${Date.now()}-${idx}`,
            startTime: s.startTime,
            endTime: s.endTime,
            type: s.type
          }))
        }
      };
    });
    showToast(`Pasted schedule onto ${selectedDay}! (Remember to click Save Changes)`);
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const sched = schedules[currentScheduleKey] || {
        branch_operating_day_id: undefined,
        isOpen: false,
        openingTime: "09:00",
        closingTime: "22:00",
        slots: []
      };
      
      let openTime = sched.openingTime;
      let closeTime = sched.closingTime;
      if (sched.slots.length > 0) {
        openTime = sched.slots[0].startTime;
        closeTime = sched.slots[sched.slots.length - 1].endTime;
      }

      const singleDayPayload = {
        branch_operating_day_id: sched.branch_operating_day_id,
        day_of_week: selectedDay,
        open_time: openTime,
        close_time: closeTime,
        is_active: sched.isOpen,
        slots: sched.slots.map(s => ({
          slot_start: s.startTime,
          slot_end:   s.endTime,
          slot_type:  uiToDb(s.type),   // map UI → DB before saving
        }))
      };

      const res = await fetch("/api/schedules/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          branchName: selectedBranch,
          operatingDays: [singleDayPayload]
        })
      });

      if (!res.ok) throw new Error("POST request failed");
      const data = await res.json();
      if (data.success) {
        showToast(`Settings for ${selectedDay} saved successfully!`);
        if (data.operatingDays) {
          setSchedules(prev => {
            const newSchedules = { ...prev };
            data.operatingDays.forEach((od: any) => {
              newSchedules[`${selectedBranch}-${od.day_of_week}`] = {
                branch_operating_day_id: od.branch_operating_day_id,
                isOpen: od.is_active,
                openingTime: od.open_time || "09:00",
                closingTime: od.close_time || "22:00",
                slots: od.slots.map((s: any) => ({
                  id: s.slot_id.toString(),
                  startTime: s.slot_start,
                  endTime: s.slot_end,
                  type: dbToUi(s.slot_type)
                }))
              };
            });
            return newSchedules;
          });
        }
      } else {
        showToast("Error: " + (data.error || "Failed to save settings"));
      }
    } catch (err) {
      console.error("Save settings error:", err);
      showToast("Error saving schedule changes");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    // Reset to defaults for the current branch-day
    setSchedules(prev => {
      const base = initialWeekSchedule[selectedDay];
      const current = prev[currentScheduleKey];
      return {
        ...prev,
        [currentScheduleKey]: {
          ...JSON.parse(JSON.stringify(base)),
          branch_operating_day_id: current?.branch_operating_day_id // Preserve DB ID
        }
      };
    });
    showToast("Reset current day settings to defaults");
  };

  return (
    <div className="min-h-full bg-slate-50 relative pb-16">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-xl flex items-center gap-2 border border-slate-700 animate-in fade-in slide-in-from-top-4 duration-300">
          <Check className="w-5 h-5 text-emerald-500" />
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-6 pt-4 pb-12">
        
        {/* Breadcrumb Navigation */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 mb-6">
          <Link
            href="/home"
            className="flex items-center gap-1 hover:text-slate-900 transition-colors focus-visible:outline-none rounded"
          >
            <HomeIcon className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link
            href="/dashboards/hrms"
            className="hover:text-slate-900 transition-colors focus-visible:outline-none rounded"
          >
            HRMS
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link
            href="/manpower-schedule"
            className="hover:text-slate-900 transition-colors focus-visible:outline-none rounded"
          >
            Manpower Planning
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 font-medium">Schedule Settings</span>
        </nav>

        {/* Page Header */}
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Schedule Settings</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Configure active hours and recurring timetables for Ebright branches.
          </p>
        </header>

        {/* Combined Branch & Day Selector Row */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Left: Branch selector */}
          <div className="flex items-center gap-2.5 flex-1 max-w-md">
            <div className="flex items-center gap-2 text-slate-700 shrink-0">
              <Building className="w-5 h-5 text-slate-400" />
              <span className="font-semibold text-sm">Branch:</span>
            </div>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-sm font-medium text-slate-800 shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            >
              {ALL_BRANCHES.map(branch => (
                <option key={branch} value={branch}>
                  {branch}
                </option>
              ))}
            </select>
          </div>

          {/* Right: Days selector */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
            {(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const).map(day => {
              const isSelected = selectedDay === day;
              // Check if open on this day
              const isOpenOnDay = schedules[`${selectedBranch}-${day}`]?.isOpen;
              
              return (
                <button
                  key={day}
                  onClick={() => setSelectedDay(day)}
                  className={`
                    px-4 py-2 rounded-xl border text-sm font-medium transition-all duration-200 shrink-0
                    ${isSelected 
                      ? "border-blue-500 bg-blue-50/50 text-blue-600 shadow-sm" 
                      : isOpenOnDay
                        ? "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                        : "border-slate-100 bg-white text-slate-300 border-dashed hover:text-slate-400"
                    }
                  `}
                >
                  {day}
                </button>
              );
            })}

            <button className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors shrink-0">
              <span className="text-xl leading-none font-bold">···</span>
            </button>
          </div>
        </div>

        {/* Main Configuration Card */}
        <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden mb-6">
          
          {/* Top Bar inside Card */}
          <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <Store className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800">{selectedBranch}</h3>
                <p className="text-xs text-slate-500 capitalize">{selectedDay}day schedule settings</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleCopyDay}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 transition-all rounded-xl text-xs font-semibold shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                title="Copy current day schedule"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy Day
              </button>
              {copiedDaySchedule && (
                <button
                  onClick={handlePasteDay}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-blue-200 text-blue-700 bg-blue-50/50 hover:bg-blue-50 transition-all rounded-xl text-xs font-semibold shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  title="Paste copied schedule onto this day"
                >
                  <Clipboard className="w-3.5 h-3.5" />
                  Paste Day
                </button>
              )}
              <div className="h-5 w-px bg-slate-200 mx-1" />
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={currentSchedule.isOpen}
                  onChange={(e) => handleToggleOpen(e.target.checked)}
                  className="w-4.5 h-4.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-semibold text-slate-700">Open this day</span>
              </label>
            </div>
          </div>

          {loading ? (
            <div className="p-16 text-center bg-white flex flex-col items-center justify-center min-h-[300px]">
              <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-sm font-medium text-slate-500 animate-pulse">Loading branch schedule...</p>
            </div>
          ) : currentSchedule.isOpen ? (
            <div className="p-6">

              {/* Time Slots Headers */}
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-bold text-slate-900">Time slots</h4>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleReset}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 transition-colors rounded-xl text-xs font-semibold shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <Undo className="w-3.5 h-3.5" />
                    Reset Defaults
                  </button>
                  <button
                    onClick={handleSave}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white transition-colors rounded-xl text-xs font-semibold shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save Changes
                  </button>
                  <div className="h-4 w-px bg-slate-200 mx-1.5" />
                  <button
                    onClick={handleAddSlot}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors rounded-xl text-xs font-semibold shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add slot
                  </button>
                </div>
              </div>

              {/* Dynamic Time Slots List */}
              {currentSchedule.slots.length === 0 ? (
                <div className="text-center py-10 bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
                  <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">No time slots specified yet.</p>
                  <p className="text-xs text-slate-400 mt-1">Click &quot;Add slot&quot; to define active shift times.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3 relative">
                  {currentSchedule.slots.map((slot, index) => {
                    const duration = calculateDuration(slot.startTime, slot.endTime);
                    const isLast = index === currentSchedule.slots.length - 1;
                    
                    return (
                      <div key={slot.id} className="relative group">
                        
                        {/* Time Slot Row Card */}
                        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center gap-4 transition-shadow hover:shadow-md">
                          
                          {/* Start Time input */}
                          <div className="flex items-center gap-2 w-full md:w-auto">
                            <div className="relative flex-1 md:w-36">
                              <input
                                type="time"
                                value={slot.startTime}
                                onChange={(e) => handleUpdateSlot(slot.id, { startTime: e.target.value })}
                                className="w-full pl-3 pr-8 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                              <Clock className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                            <span className="text-xs text-slate-400 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded md:hidden shrink-0">
                              {format24to12(slot.startTime)}
                            </span>
                          </div>

                          <span className="text-sm text-slate-400 font-medium self-center px-1">to</span>

                          {/* End Time input */}
                          <div className="flex items-center gap-2 w-full md:w-auto">
                            <div className="relative flex-1 md:w-36">
                              <input
                                type="time"
                                value={slot.endTime}
                                onChange={(e) => handleUpdateSlot(slot.id, { endTime: e.target.value })}
                                disabled={slot.type === "Class"}
                                className={`w-full pl-3 pr-8 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 ${slot.type === "Class" ? "bg-slate-50 text-slate-400 cursor-not-allowed opacity-90" : ""}`}
                              />
                              <Clock className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                            <span className="text-xs text-slate-400 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded md:hidden shrink-0">
                              {format24to12(slot.endTime)}
                            </span>
                          </div>

                          {/* Slot Type Dropdown */}
                          <div className="w-full md:w-44">
                            <select
                              value={slot.type}
                              onChange={(e) => handleUpdateSlot(slot.id, { type: e.target.value as TimeSlot["type"] })}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 font-medium focus:outline-none"
                            >
                              {slotTypes.map(t => (
                                <option key={t} value={t}>
                                  {t}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Duration Badge */}
                          <div className="shrink-0 flex items-center">
                            <span className={`
                              px-3 py-1 rounded-full text-xs font-semibold shadow-xs
                              ${slot.type === "Opening" ? "bg-blue-100/70 text-blue-700" : ""}
                              ${slot.type === "Class"   ? "bg-emerald-100/70 text-emerald-700" : ""}
                              ${slot.type === "Closing" ? "bg-amber-100/70 text-amber-700" : ""}
                            `}>
                              {duration}
                            </span>
                          </div>

                          {/* Delete Slot Button */}
                          <button
                            onClick={() => handleDeleteSlot(slot.id)}
                            className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-2 rounded-xl border border-slate-100 hover:border-rose-100 transition-colors ml-auto md:ml-2 focus:outline-none focus:ring-2 focus:ring-rose-500"
                            aria-label="Delete slot"
                          >
                            <Trash2 className="w-4.5 h-4.5" />
                          </button>

                        </div>

                        {/* Centered Connection Down Arrow overlaying the gap between rows */}
                        {!isLast && (
                          <div className="absolute left-1/2 -bottom-5.5 -translate-x-1/2 z-10 flex items-center justify-center">
                            <div className="w-7 h-7 bg-white border border-slate-200 rounded-full flex items-center justify-center shadow-sm">
                              <ArrowDown className="w-3.5 h-3.5 text-slate-400" />
                            </div>
                          </div>
                        )}

                        {/* Extra margin for arrow gap */}
                        {!isLast && <div className="h-4.5 pointer-events-none" aria-hidden="true" />}

                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* Closed State Container */
            <div className="p-12 text-center bg-slate-50/50">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
                <AlertCircle className="w-6 h-6 text-slate-400" />
              </div>
              <h4 className="font-semibold text-slate-700 mb-1">Branch is closed on {selectedDay}s</h4>
              <p className="text-sm text-slate-400 max-w-sm mx-auto mb-4">
                Operational schedules, shift hours, and manpower assignments are disabled for closed days.
              </p>
              <button
                onClick={() => handleToggleOpen(true)}
                className="px-4 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 font-semibold text-xs rounded-xl shadow-xs transition-colors"
              >
                Mark day as Open
              </button>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}

// ─── Authentication Wrapper and Layout Shell ───────────────────────────────────

export default function ManpowerSettingsPage() {
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      redirect("/login");
    },
  });

  if (status === "loading") {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-full text-blue-600 font-semibold text-lg">
          Loading...
        </div>
      </AppShell>
    );
  }

  const userEmail = session?.user?.email ?? "";
  const userRole = (session?.user as { role?: string } | undefined)?.role ?? "USER";
  const userName = session?.user?.name ?? null;

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <ScheduleSettingsContent />
    </AppShell>
  );
}
