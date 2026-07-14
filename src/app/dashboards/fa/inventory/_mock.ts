export type EventStatus = "completed" | "open" | "ongoing" | "closed" | "draft";

export interface InventoryEvent {
  id: string;
  name: string;
  dateLabel: string;
  venue: string;
  status: EventStatus;
  monthYear: string;
}

export interface GradeRow   { grade: number; count: number }
export interface BranchRow  { code: string; name: string; count: number }
export interface SessionRow { label: string; count: number }

export interface MockInventoryData {
  medalsTotal:       number;
  medalsByGrade:     GradeRow[];
  sashesTotal:       number;
  sashesByBranch:    BranchRow[];
  certificatesTotal: number;
  certsBySession:    SessionRow[];
}

export const MOCK_EVENTS: InventoryEvent[] = [
  { id: "a5", name: "Historical FA (pre-portal records)", dateLabel: "1–1 January 2025",  venue: "—",                        status: "completed", monthYear: "JANUARY 2025" },
  { id: "a4", name: "test",                               dateLabel: "8–9 May 2026",       venue: "test",                     status: "completed", monthYear: "MAY 2026"     },
  { id: "a3", name: "FA MAY",                             dateLabel: "16–17 May 2026",     venue: "ATRIA",                    status: "completed", monthYear: "MAY 2026"     },
  { id: "a6", name: "mastercopy quota",                   dateLabel: "1–2 June 2026",      venue: "Pavilion Damansara Heights",status: "completed", monthYear: "JUNE 2026"   },
  { id: "a2", name: "30-31 May Weekly Showcase",          dateLabel: "4–5 June 2026",      venue: "NU Empire",                status: "completed", monthYear: "JUNE 2026"   },
  { id: "a1", name: "16-17 May Weekly Showcase",          dateLabel: "10–11 June 2026",    venue: "Quayside Mall",            status: "completed", monthYear: "JUNE 2026"   },
  { id: "e1", name: "20-21 June Weekly Showcase",         dateLabel: "20–21 June 2026",    venue: "KL Gateway",               status: "completed", monthYear: "JUNE 2026"   },
  { id: "e2", name: "18-19 July Weekly Showcase",         dateLabel: "18–19 July 2026",    venue: "Pavilion Damansara Heights",status: "open",      monthYear: "JULY 2026"   },
  { id: "e3", name: "25-26 July Weekly Showcase",         dateLabel: "25–26 July 2026",    venue: "NU Empire",                status: "open",      monthYear: "JULY 2026"   },
];

export const MOCK_INVENTORY: Record<string, MockInventoryData> = {
  a5: {
    medalsTotal: 710,
    medalsByGrade: [
      { grade: 1, count: 95 }, { grade: 2, count: 110 }, { grade: 3, count: 130 },
      { grade: 4, count: 105 }, { grade: 5, count: 98 }, { grade: 6, count: 88 },
      { grade: 7, count: 52 }, { grade: 8, count: 32 },
    ],
    sashesTotal: 68,
    sashesByBranch: [
      { code: "KL",  name: "Kuala Lumpur", count: 22 },
      { code: "PJ",  name: "Petaling Jaya", count: 18 },
      { code: "SBH", name: "Subang", count: 15 },
      { code: "KJ",  name: "Kajang", count: 13 },
    ],
    certificatesTotal: 710,
    certsBySession: [
      { label: "D1 · S1 · 9:00–11:00",   count: 180 },
      { label: "D1 · S2 · 11:30–13:30",  count: 175 },
      { label: "D1 · S3 · 14:00–16:00",  count: 165 },
      { label: "D1 · S4 · 16:30–18:30",  count: 190 },
    ],
  },
  a4: {
    medalsTotal: 2,
    medalsByGrade: [{ grade: 3, count: 2 }],
    sashesTotal: 2,
    sashesByBranch: [{ code: "KL", name: "Kuala Lumpur", count: 2 }],
    certificatesTotal: 2,
    certsBySession: [{ label: "D1 · S1 · 9:00–11:00", count: 2 }],
  },
  a3: {
    medalsTotal: 0,
    medalsByGrade: [],
    sashesTotal: 0,
    sashesByBranch: [],
    certificatesTotal: 0,
    certsBySession: [],
  },
  a6: {
    medalsTotal: 45,
    medalsByGrade: [
      { grade: 2, count: 10 }, { grade: 3, count: 15 },
      { grade: 4, count: 12 }, { grade: 5, count: 8 },
    ],
    sashesTotal: 20,
    sashesByBranch: [
      { code: "PJ", name: "Petaling Jaya", count: 12 },
      { code: "KL", name: "Kuala Lumpur",  count: 8  },
    ],
    certificatesTotal: 45,
    certsBySession: [
      { label: "D1 · S1 · 9:00–11:00",  count: 22 },
      { label: "D1 · S2 · 11:30–13:30", count: 23 },
    ],
  },
  a2: {
    medalsTotal: 146,
    medalsByGrade: [
      { grade: 1, count: 18 }, { grade: 2, count: 24 }, { grade: 3, count: 30 },
      { grade: 4, count: 26 }, { grade: 5, count: 22 }, { grade: 6, count: 16 },
      { grade: 7, count: 10 },
    ],
    sashesTotal: 38,
    sashesByBranch: [
      { code: "KL",  name: "Kuala Lumpur", count: 14 },
      { code: "PJ",  name: "Petaling Jaya", count: 12 },
      { code: "SBH", name: "Subang", count: 7 },
      { code: "KJ",  name: "Kajang", count: 5 },
    ],
    certificatesTotal: 146,
    certsBySession: [
      { label: "D1 · S1 · 9:00–11:00",  count: 36 },
      { label: "D1 · S2 · 11:30–13:30", count: 38 },
      { label: "D1 · S3 · 14:00–16:00", count: 34 },
      { label: "D1 · S4 · 16:30–18:30", count: 38 },
    ],
  },
  a1: {
    medalsTotal: 190,
    medalsByGrade: [
      { grade: 1, count: 22 }, { grade: 2, count: 30 }, { grade: 3, count: 38 },
      { grade: 4, count: 32 }, { grade: 5, count: 28 }, { grade: 6, count: 22 },
      { grade: 7, count: 14 }, { grade: 8, count: 4  },
    ],
    sashesTotal: 48,
    sashesByBranch: [
      { code: "KL",  name: "Kuala Lumpur", count: 16 },
      { code: "PJ",  name: "Petaling Jaya", count: 14 },
      { code: "SBH", name: "Subang", count: 10 },
      { code: "KJ",  name: "Kajang", count: 8  },
    ],
    certificatesTotal: 190,
    certsBySession: [
      { label: "D1 · S1 · 9:00–11:00",  count: 48 },
      { label: "D1 · S2 · 11:30–13:30", count: 50 },
      { label: "D1 · S3 · 14:00–16:00", count: 44 },
      { label: "D1 · S4 · 16:30–18:30", count: 48 },
    ],
  },
  e1: {
    medalsTotal: 240,
    medalsByGrade: [
      { grade: 1, count: 28 }, { grade: 2, count: 38 }, { grade: 3, count: 48 },
      { grade: 4, count: 40 }, { grade: 5, count: 34 }, { grade: 6, count: 28 },
      { grade: 7, count: 18 }, { grade: 8, count: 6  },
    ],
    sashesTotal: 58,
    sashesByBranch: [
      { code: "KL",  name: "Kuala Lumpur", count: 20 },
      { code: "PJ",  name: "Petaling Jaya", count: 16 },
      { code: "SBH", name: "Subang", count: 12 },
      { code: "KJ",  name: "Kajang", count: 10 },
    ],
    certificatesTotal: 240,
    certsBySession: [
      { label: "D1 · S1 · 9:00–11:00",  count: 60 },
      { label: "D1 · S2 · 11:30–13:30", count: 62 },
      { label: "D1 · S3 · 14:00–16:00", count: 58 },
      { label: "D1 · S4 · 16:30–18:30", count: 60 },
    ],
  },
  e2: {
    medalsTotal: 180,
    medalsByGrade: [
      { grade: 2, count: 28 }, { grade: 3, count: 38 }, { grade: 4, count: 32 },
      { grade: 5, count: 26 }, { grade: 6, count: 22 }, { grade: 7, count: 18 },
      { grade: 8, count: 16 },
    ],
    sashesTotal: 44,
    sashesByBranch: [
      { code: "KL",  name: "Kuala Lumpur", count: 16 },
      { code: "PJ",  name: "Petaling Jaya", count: 14 },
      { code: "SBH", name: "Subang", count: 8 },
      { code: "KJ",  name: "Kajang", count: 6 },
    ],
    certificatesTotal: 180,
    certsBySession: [
      { label: "D1 · S1 · 9:00–11:00",  count: 44 },
      { label: "D1 · S2 · 11:30–13:30", count: 48 },
      { label: "D1 · S3 · 14:00–16:00", count: 42 },
      { label: "D1 · S4 · 16:30–18:30", count: 46 },
    ],
  },
  e3: {
    medalsTotal: 0,
    medalsByGrade: [],
    sashesTotal: 0,
    sashesByBranch: [],
    certificatesTotal: 0,
    certsBySession: [],
  },
};
