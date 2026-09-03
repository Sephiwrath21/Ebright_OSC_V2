// Name normalisation shared by every cross-system name match (career
// applications, BranchStaff, ClickUp, the ebrightsms staff sync). Lives in its
// own module — with NO `import "server-only"` — so CLI entry points can reuse
// the exact same rules instead of drifting their own copy.

export function normalizeName(name: string): string {
  return name
    .toUpperCase()
    // Some ebright_hrfs.BranchStaff.name values contain literal embedded
    // \r/\n (e.g. "CHE\r\nKU ELMI SHAZWAL..."). Without this, the
    // [^A-Z0-9 ] strip below deletes them outright instead of treating them
    // as a word boundary, gluing the two halves into "CHEKU ELMI..." and
    // silently breaking the match against a normally-spaced name — found via
    // the 2026-08-22 BranchStaff/employment reconciliation audit (7 of 363
    // BranchStaff rows affected). Must run BEFORE the punctuation strip.
    .replace(/[\r\n\t]+/g, " ")
    // Malaysian/Indian relational honorifics ("daughter of"/"son of") are
    // written inconsistently across systems — e.g. real user "Ramitha
    // Moghan" vs onboarding_candidate's "Ramitha A/P Moghan" for the exact
    // same person (confirmed via matching email), which silently produced
    // TWO separate Pre-list rows for her before this fix. Stripped as whole
    // tokens BEFORE punctuation removal, so they're dropped entirely rather
    // than collapsing into "AP"/"AL" and staying part of the compared name.
    .replace(/\bA\/P\b|\bA\/L\b|\bS\/O\b|\bD\/O\b/g, "")
    .replace(/[^A-Z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
