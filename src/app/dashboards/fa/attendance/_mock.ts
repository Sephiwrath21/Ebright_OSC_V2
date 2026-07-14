export type BranchCode = "FA1" | "FA2" | "FA3" | "FA4";
export type AttendanceStatus = "present" | "absent" | "late";

export const BRANCHES: { code: BranchCode; name: string }[] = [
  { code: "FA1", name: "Petaling Jaya" },
  { code: "FA2", name: "Cyberjaya" },
  { code: "FA3", name: "Shah Alam" },
  { code: "FA4", name: "Subang Jaya" },
];

export interface FAAttEvent {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  venue: string;
}

export interface FAAttStudent {
  id: string;
  studentId: string;
  name: string;
  branch: BranchCode;
  grade: number;
  eventId: string;
  session: string;
  status: AttendanceStatus | null;
}

export const MOCK_ATT_EVENTS: FAAttEvent[] = [
  { id: "ev-001", name: "20-21 June Weekly Showcase", startDate: "2026-06-20", endDate: "2026-06-21", venue: "KL Gateway" },
  { id: "ev-002", name: "18-19 July Weekly Showcase", startDate: "2026-07-18", endDate: "2026-07-19", venue: "Pavilion Damansara Heights" },
  { id: "ev-003", name: "16-17 May Weekly Showcase",  startDate: "2026-05-16", endDate: "2026-05-17", venue: "Mid Valley" },
];

export const MOCK_ATT_STUDENTS: FAAttStudent[] = [
  // ev-001 — June Showcase
  { id: "a001", studentId: "S001", name: "Aryan Mehta",        branch: "FA1", grade: 5, eventId: "ev-001", session: "Session 1", status: "present" },
  { id: "a002", studentId: "S002", name: "Priya Sharma",       branch: "FA2", grade: 6, eventId: "ev-001", session: "Session 1", status: "present" },
  { id: "a003", studentId: "S003", name: "Lim Wei Xian",       branch: "FA3", grade: 5, eventId: "ev-001", session: "Session 1", status: "absent"  },
  { id: "a004", studentId: "S004", name: "Muhammad Haziq",     branch: "FA1", grade: 4, eventId: "ev-001", session: "Session 2", status: "present" },
  { id: "a005", studentId: "S005", name: "Nurul Aisyah",       branch: "FA3", grade: 7, eventId: "ev-001", session: "Session 2", status: "late"    },
  { id: "a006", studentId: "S006", name: "Raj Subramaniam",    branch: "FA2", grade: 6, eventId: "ev-001", session: "Session 2", status: "present" },
  { id: "a007", studentId: "S007", name: "Kavitha Rajan",      branch: "FA4", grade: 3, eventId: "ev-001", session: "Session 3", status: "present" },
  { id: "a008", studentId: "S008", name: "Ahmad Faris",        branch: "FA1", grade: 8, eventId: "ev-001", session: "Session 3", status: null      },
  { id: "a009", studentId: "S009", name: "Hazwan Idris",       branch: "FA2", grade: 5, eventId: "ev-001", session: "Session 3", status: null      },
  { id: "a010", studentId: "S010", name: "Siti Nursyafiqah",   branch: "FA3", grade: 6, eventId: "ev-001", session: "Session 4", status: "present" },
  { id: "a011", studentId: "S011", name: "Darren Tan",         branch: "FA4", grade: 4, eventId: "ev-001", session: "Session 4", status: "present" },
  { id: "a012", studentId: "S012", name: "Amirah Zulkifli",    branch: "FA1", grade: 5, eventId: "ev-001", session: "Session 4", status: "absent"  },
  // ev-002 — July Showcase
  { id: "b001", studentId: "S013", name: "Chong Wei Liang",    branch: "FA2", grade: 6, eventId: "ev-002", session: "Session 1", status: null      },
  { id: "b002", studentId: "S014", name: "Nadia Farhan",       branch: "FA3", grade: 5, eventId: "ev-002", session: "Session 1", status: null      },
  { id: "b003", studentId: "S015", name: "Firdaus Azmi",       branch: "FA1", grade: 7, eventId: "ev-002", session: "Session 1", status: null      },
  { id: "b004", studentId: "S016", name: "Thivya Krishnan",    branch: "FA4", grade: 4, eventId: "ev-002", session: "Session 2", status: null      },
  { id: "b005", studentId: "S017", name: "Zulaikha Hamid",     branch: "FA2", grade: 6, eventId: "ev-002", session: "Session 2", status: null      },
  { id: "b006", studentId: "S018", name: "Marcus Ng",          branch: "FA3", grade: 5, eventId: "ev-002", session: "Session 2", status: null      },
  // ev-003 — May Showcase (completed)
  { id: "c001", studentId: "S019", name: "Shirin Balan",       branch: "FA1", grade: 6, eventId: "ev-003", session: "Session 1", status: "present" },
  { id: "c002", studentId: "S020", name: "Kevin Loh",          branch: "FA2", grade: 5, eventId: "ev-003", session: "Session 1", status: "present" },
  { id: "c003", studentId: "S021", name: "Putri Nabila",       branch: "FA3", grade: 4, eventId: "ev-003", session: "Session 1", status: "absent"  },
  { id: "c004", studentId: "S022", name: "Irfan Haikal",       branch: "FA4", grade: 7, eventId: "ev-003", session: "Session 2", status: "late"    },
  { id: "c005", studentId: "S023", name: "Alicia Tan",         branch: "FA1", grade: 6, eventId: "ev-003", session: "Session 2", status: "present" },
  { id: "c006", studentId: "S024", name: "Yazmin Rashid",      branch: "FA2", grade: 5, eventId: "ev-003", session: "Session 2", status: "present" },
];
