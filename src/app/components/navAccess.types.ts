/**
 * What the sidebar needs to decide which modules to show. Feature-gated nav
 * items are hidden unless their key is in `features`; items marked privileged
 * (Account Management) need `privileged`. This is a UX filter only — every
 * gated page still enforces access server-side on its own.
 */
export interface NavAccess {
  privileged: boolean; // superadmin / ceo — full menu
  features: string[]; // feature keys the user can `view`
  /** CEO/Finance/HR/Superadmin (full), HOD (own department), or a real BM
   *  employee/generic branch login (own branch) — see
   *  pendingOverdueTasksAccess.ts's own resolveTaskOverviewAccess(), the
   *  SAME check the "Pending & Overdue Tasks Overview" route itself
   *  enforces server-side; this only controls the sidebar link's
   *  visibility (2026-08-27, see conversation). false for a denied result,
   *  including plain "staff". */
  pendingOverdueTasksAccess: boolean;
}
