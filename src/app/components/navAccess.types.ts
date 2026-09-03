/**
 * What the sidebar needs to decide which modules to show. Feature-gated nav
 * items are hidden unless their key is in `features`; items marked privileged
 * (Account Management) need `privileged`. This is a UX filter only — every
 * gated page still enforces access server-side on its own.
 */
export interface NavAccess {
  privileged: boolean; // superadmin / ceo — full menu
  features: string[]; // feature keys the user can `view`
}
