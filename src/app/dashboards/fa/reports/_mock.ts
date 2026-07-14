export type BranchCode = "FA1" | "FA2" | "FA3" | "FA4";

export const BRANCHES: { code: BranchCode; name: string }[] = [
  { code: "FA1", name: "Petaling Jaya" },
  { code: "FA2", name: "Cyberjaya" },
  { code: "FA3", name: "Shah Alam" },
  { code: "FA4", name: "Subang Jaya" },
];

export const FA_REPORT_MAX_PER_CRITERION = 25;

export interface FAEvent {
  id: string;
  name: string;
  startDate: string;
}

export interface FAInvitation {
  id: string;
  studentId: string;
  studentName: string;
  branch: BranchCode;
  grade: number;
  eventId: string;
  attendedAt: string;
}

export interface FAReport {
  id: string;
  invitationId: string;
  studentId: string;
  studentName: string;
  branch: BranchCode;
  grade: number;
  assessmentDate: string;
  communicationScore: number;
  analysisScore: number;
  interactionScore: number;
  performanceScore: number;
  remarks: string;
  preparedBy: string;
  videoLink?: string;
  evidencePhotoLink?: string;
  updatedAt: string;
}

export function faReportTotal(r: FAReport): number {
  return r.communicationScore + r.analysisScore + r.interactionScore + r.performanceScore;
}

export const MOCK_EVENTS: FAEvent[] = [
  { id: "ev-001", name: "Showcase June 2025",     startDate: "2025-06-10" },
  { id: "ev-002", name: "Showcase April 2025",    startDate: "2025-04-12" },
  { id: "ev-003", name: "Showcase February 2025", startDate: "2025-02-08" },
];

export const MOCK_INVITATIONS: FAInvitation[] = [
  { id: "inv-001", studentId: "S001", studentName: "Aryan Mehta",       branch: "FA1", grade: 5, eventId: "ev-001", attendedAt: "2025-06-10T09:00:00Z" },
  { id: "inv-002", studentId: "S002", studentName: "Priya Sharma",      branch: "FA2", grade: 6, eventId: "ev-001", attendedAt: "2025-06-10T09:05:00Z" },
  { id: "inv-003", studentId: "S003", studentName: "Lim Wei Xian",      branch: "FA3", grade: 5, eventId: "ev-001", attendedAt: "2025-06-10T09:10:00Z" },
  { id: "inv-004", studentId: "S004", studentName: "Muhammad Haziq",    branch: "FA1", grade: 4, eventId: "ev-002", attendedAt: "2025-04-12T09:00:00Z" },
  { id: "inv-005", studentId: "S005", studentName: "Nurul Aisyah",      branch: "FA3", grade: 7, eventId: "ev-002", attendedAt: "2025-04-12T09:05:00Z" },
  { id: "inv-006", studentId: "S006", studentName: "Raj Subramaniam",   branch: "FA2", grade: 6, eventId: "ev-002", attendedAt: "2025-04-12T09:10:00Z" },
  { id: "inv-007", studentId: "S007", studentName: "Kavitha Rajan",     branch: "FA4", grade: 3, eventId: "ev-002", attendedAt: "2025-04-12T09:15:00Z" },
  { id: "inv-008", studentId: "S008", studentName: "Ahmad Faris",       branch: "FA1", grade: 8, eventId: "ev-002", attendedAt: "2025-04-12T09:20:00Z" },
  { id: "inv-009", studentId: "S009", studentName: "Hazwan Idris",      branch: "FA2", grade: 5, eventId: "ev-003", attendedAt: "2025-02-08T09:00:00Z" },
  { id: "inv-010", studentId: "S010", studentName: "Siti Nursyafiqah",  branch: "FA3", grade: 6, eventId: "ev-003", attendedAt: "2025-02-08T09:05:00Z" },
  { id: "inv-011", studentId: "S011", studentName: "Darren Tan",        branch: "FA4", grade: 4, eventId: "ev-003", attendedAt: "2025-02-08T09:10:00Z" },
  { id: "inv-012", studentId: "S012", studentName: "Amirah Zulkifli",   branch: "FA1", grade: 5, eventId: "ev-003", attendedAt: "2025-02-08T09:15:00Z" },
];

// 8 filled out of 12 (inv-003, inv-006, inv-008, inv-012 are pending)
export const MOCK_REPORTS: FAReport[] = [
  {
    id: "rpt-001", invitationId: "inv-001",
    studentId: "S001", studentName: "Aryan Mehta", branch: "FA1", grade: 5,
    assessmentDate: "2025-06-10",
    communicationScore: 20, analysisScore: 18, interactionScore: 22, performanceScore: 19,
    remarks: "Aryan demonstrated strong communication throughout the showcase. Needs to develop analytical depth further.",
    preparedBy: "Coach Rajan",
    videoLink: "https://youtu.be/example1",
    updatedAt: "2025-06-10T15:30:00Z",
  },
  {
    id: "rpt-002", invitationId: "inv-002",
    studentId: "S002", studentName: "Priya Sharma", branch: "FA2", grade: 6,
    assessmentDate: "2025-06-10",
    communicationScore: 23, analysisScore: 22, interactionScore: 20, performanceScore: 24,
    remarks: "Exceptional performance. Priya showed great command of the topic and engaged the audience well.",
    preparedBy: "Coach Lin",
    evidencePhotoLink: "https://example.com/evidence/rpt-002.jpg",
    updatedAt: "2025-06-10T16:00:00Z",
  },
  {
    id: "rpt-003", invitationId: "inv-004",
    studentId: "S004", studentName: "Muhammad Haziq", branch: "FA1", grade: 4,
    assessmentDate: "2025-04-12",
    communicationScore: 15, analysisScore: 14, interactionScore: 16, performanceScore: 13,
    remarks: "Shows potential but needs more confidence in delivery.",
    preparedBy: "Coach Rajan",
    updatedAt: "2025-04-12T14:00:00Z",
  },
  {
    id: "rpt-004", invitationId: "inv-005",
    studentId: "S005", studentName: "Nurul Aisyah", branch: "FA3", grade: 7,
    assessmentDate: "2025-04-12",
    communicationScore: 22, analysisScore: 20, interactionScore: 21, performanceScore: 23,
    remarks: "Outstanding. Nurul was one of the strongest performers at the April showcase.",
    preparedBy: "Coach Amir",
    videoLink: "https://drive.google.com/example2",
    evidencePhotoLink: "https://example.com/evidence/rpt-004.jpg",
    updatedAt: "2025-04-13T09:00:00Z",
  },
  {
    id: "rpt-005", invitationId: "inv-007",
    studentId: "S007", studentName: "Kavitha Rajan", branch: "FA4", grade: 3,
    assessmentDate: "2025-04-12",
    communicationScore: 10, analysisScore: 12, interactionScore: 11, performanceScore: 9,
    remarks: "Early stage — reasonable foundation. Work on eye contact and projection.",
    preparedBy: "Coach Mei",
    updatedAt: "2025-04-12T17:30:00Z",
  },
  {
    id: "rpt-006", invitationId: "inv-009",
    studentId: "S009", studentName: "Hazwan Idris", branch: "FA2", grade: 5,
    assessmentDate: "2025-02-08",
    communicationScore: 17, analysisScore: 18, interactionScore: 16, performanceScore: 15,
    remarks: "Good participation. Slightly hesitant but improved through the session.",
    preparedBy: "Coach Lin",
    updatedAt: "2025-02-08T13:00:00Z",
  },
  {
    id: "rpt-007", invitationId: "inv-010",
    studentId: "S010", studentName: "Siti Nursyafiqah", branch: "FA3", grade: 6,
    assessmentDate: "2025-02-08",
    communicationScore: 24, analysisScore: 23, interactionScore: 25, performanceScore: 22,
    remarks: "Near-perfect showing. Exceptional fluency and stage presence.",
    preparedBy: "Coach Amir",
    videoLink: "https://youtu.be/example3",
    evidencePhotoLink: "https://example.com/evidence/rpt-007.jpg",
    updatedAt: "2025-02-09T10:00:00Z",
  },
  {
    id: "rpt-008", invitationId: "inv-011",
    studentId: "S011", studentName: "Darren Tan", branch: "FA4", grade: 4,
    assessmentDate: "2025-02-08",
    communicationScore: 13, analysisScore: 11, interactionScore: 14, performanceScore: 12,
    remarks: "Quiet but focused. Push for more active engagement in group discussions.",
    preparedBy: "Coach Mei",
    updatedAt: "2025-02-08T14:00:00Z",
  },
];
