export type BranchCode = "FA1" | "FA2" | "FA3" | "FA4";
export type EventStatus = "draft" | "open" | "closed" | "ongoing" | "completed";
export type InvStatus = "invited" | "confirmed" | "attended" | "no_show" | "declined";

export const BRANCHES: { code: BranchCode; name: string }[] = [
  { code: "FA1", name: "Petaling Jaya" },
  { code: "FA2", name: "Cyberjaya" },
  { code: "FA3", name: "Shah Alam" },
  { code: "FA4", name: "Subang Jaya" },
];

export function countsAsConfirmed(s: InvStatus): boolean {
  return s === "confirmed" || s === "attended" || s === "no_show";
}

export interface DashEvent {
  id: string;
  name: string;
  venue: string;
  startDate: string;
  status: EventStatus;
  year: number;
}

export interface DashSession {
  id: string;
  eventId: string;
}

export interface DashQuota {
  sessionId: string;
  branch: BranchCode;
  quota: number;
}

export interface DashInv {
  id: string;
  eventId: string;
  branch: BranchCode;
  status: InvStatus;
}

export const MOCK_DASH_EVENTS: DashEvent[] = [
  { id: "ev-001", name: "May 2025 Weekly Showcase",   venue: "KL Gateway",                startDate: "2025-05-10", status: "completed", year: 2025 },
  { id: "ev-002", name: "March 2026 Weekly Showcase", venue: "Pavilion Damansara Heights", startDate: "2026-03-15", status: "completed", year: 2026 },
  { id: "ev-003", name: "June 2026 Weekly Showcase",  venue: "Mid Valley",                startDate: "2026-06-21", status: "ongoing",   year: 2026 },
];

export const MOCK_DASH_SESSIONS: DashSession[] = [
  { id: "s01a", eventId: "ev-001" }, { id: "s01b", eventId: "ev-001" },
  { id: "s02a", eventId: "ev-002" }, { id: "s02b", eventId: "ev-002" },
  { id: "s03a", eventId: "ev-003" }, { id: "s03b", eventId: "ev-003" },
];

const SESSION_IDS = ["s01a", "s01b", "s02a", "s02b", "s03a", "s03b"];
const BRANCH_CODES: BranchCode[] = ["FA1", "FA2", "FA3", "FA4"];

export const MOCK_DASH_QUOTAS: DashQuota[] = SESSION_IDS.flatMap(sessionId =>
  BRANCH_CODES.map(branch => ({ sessionId, branch, quota: 10 }))
);

function i(id: string, eventId: string, branch: BranchCode, status: InvStatus): DashInv {
  return { id, eventId, branch, status };
}

export const MOCK_DASH_INVS: DashInv[] = [
  // ── ev-001  May 2025  (completed) ────────────────────────────────────────────
  // FA1 — 8 invited: 5 attended, 2 no_show, 1 declined
  i("i1-01","ev-001","FA1","attended"), i("i1-02","ev-001","FA1","attended"),
  i("i1-03","ev-001","FA1","attended"), i("i1-04","ev-001","FA1","attended"),
  i("i1-05","ev-001","FA1","attended"), i("i1-06","ev-001","FA1","no_show"),
  i("i1-07","ev-001","FA1","no_show"),  i("i1-08","ev-001","FA1","declined"),
  // FA2 — 9 invited: 7 attended, 2 no_show
  i("i1-09","ev-001","FA2","attended"), i("i1-10","ev-001","FA2","attended"),
  i("i1-11","ev-001","FA2","attended"), i("i1-12","ev-001","FA2","attended"),
  i("i1-13","ev-001","FA2","attended"), i("i1-14","ev-001","FA2","attended"),
  i("i1-15","ev-001","FA2","attended"), i("i1-16","ev-001","FA2","no_show"),
  i("i1-17","ev-001","FA2","no_show"),
  // FA3 — 7 invited: 4 attended, 3 no_show
  i("i1-18","ev-001","FA3","attended"), i("i1-19","ev-001","FA3","attended"),
  i("i1-20","ev-001","FA3","attended"), i("i1-21","ev-001","FA3","attended"),
  i("i1-22","ev-001","FA3","no_show"),  i("i1-23","ev-001","FA3","no_show"),
  i("i1-24","ev-001","FA3","no_show"),
  // FA4 — 8 invited: 6 attended, 2 no_show
  i("i1-25","ev-001","FA4","attended"), i("i1-26","ev-001","FA4","attended"),
  i("i1-27","ev-001","FA4","attended"), i("i1-28","ev-001","FA4","attended"),
  i("i1-29","ev-001","FA4","attended"), i("i1-30","ev-001","FA4","attended"),
  i("i1-31","ev-001","FA4","no_show"),  i("i1-32","ev-001","FA4","no_show"),

  // ── ev-002  March 2026  (completed) ──────────────────────────────────────────
  // FA1 — 9: 8 attended, 1 no_show
  i("i2-01","ev-002","FA1","attended"), i("i2-02","ev-002","FA1","attended"),
  i("i2-03","ev-002","FA1","attended"), i("i2-04","ev-002","FA1","attended"),
  i("i2-05","ev-002","FA1","attended"), i("i2-06","ev-002","FA1","attended"),
  i("i2-07","ev-002","FA1","attended"), i("i2-08","ev-002","FA1","attended"),
  i("i2-09","ev-002","FA1","no_show"),
  // FA2 — 8: 7 attended, 1 no_show
  i("i2-10","ev-002","FA2","attended"), i("i2-11","ev-002","FA2","attended"),
  i("i2-12","ev-002","FA2","attended"), i("i2-13","ev-002","FA2","attended"),
  i("i2-14","ev-002","FA2","attended"), i("i2-15","ev-002","FA2","attended"),
  i("i2-16","ev-002","FA2","attended"), i("i2-17","ev-002","FA2","no_show"),
  // FA3 — 9: 6 attended, 3 no_show
  i("i2-18","ev-002","FA3","attended"), i("i2-19","ev-002","FA3","attended"),
  i("i2-20","ev-002","FA3","attended"), i("i2-21","ev-002","FA3","attended"),
  i("i2-22","ev-002","FA3","attended"), i("i2-23","ev-002","FA3","attended"),
  i("i2-24","ev-002","FA3","no_show"),  i("i2-25","ev-002","FA3","no_show"),
  i("i2-26","ev-002","FA3","no_show"),
  // FA4 — 10: 9 attended, 1 no_show
  i("i2-27","ev-002","FA4","attended"), i("i2-28","ev-002","FA4","attended"),
  i("i2-29","ev-002","FA4","attended"), i("i2-30","ev-002","FA4","attended"),
  i("i2-31","ev-002","FA4","attended"), i("i2-32","ev-002","FA4","attended"),
  i("i2-33","ev-002","FA4","attended"), i("i2-34","ev-002","FA4","attended"),
  i("i2-35","ev-002","FA4","attended"), i("i2-36","ev-002","FA4","no_show"),

  // ── ev-003  June 2026  (ongoing) ─────────────────────────────────────────────
  // FA1 — 7: 3 attended, 2 confirmed, 2 invited
  i("i3-01","ev-003","FA1","attended"), i("i3-02","ev-003","FA1","attended"),
  i("i3-03","ev-003","FA1","attended"), i("i3-04","ev-003","FA1","confirmed"),
  i("i3-05","ev-003","FA1","confirmed"),i("i3-06","ev-003","FA1","invited"),
  i("i3-07","ev-003","FA1","invited"),
  // FA2 — 8: 4 attended, 2 confirmed, 2 invited
  i("i3-08","ev-003","FA2","attended"), i("i3-09","ev-003","FA2","attended"),
  i("i3-10","ev-003","FA2","attended"), i("i3-11","ev-003","FA2","attended"),
  i("i3-12","ev-003","FA2","confirmed"),i("i3-13","ev-003","FA2","confirmed"),
  i("i3-14","ev-003","FA2","invited"),  i("i3-15","ev-003","FA2","invited"),
  // FA3 — 6: 2 attended, 2 confirmed, 2 invited
  i("i3-16","ev-003","FA3","attended"), i("i3-17","ev-003","FA3","attended"),
  i("i3-18","ev-003","FA3","confirmed"),i("i3-19","ev-003","FA3","confirmed"),
  i("i3-20","ev-003","FA3","invited"),  i("i3-21","ev-003","FA3","invited"),
  // FA4 — 7: 3 attended, 2 confirmed, 2 invited
  i("i3-22","ev-003","FA4","attended"), i("i3-23","ev-003","FA4","attended"),
  i("i3-24","ev-003","FA4","attended"), i("i3-25","ev-003","FA4","confirmed"),
  i("i3-26","ev-003","FA4","confirmed"),i("i3-27","ev-003","FA4","invited"),
  i("i3-28","ev-003","FA4","invited"),
];
