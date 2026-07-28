// Shared phone/email formatting + validation for every Phone Number/Contact
// Number/Email field across Personal Info, Guardian Info, Emergency
// Contact, and Reference Check (see ActiveProfilePanels.PhoneField/
// EmailField, the shared components built on top of these). Storage stays a
// single VARCHAR column per field (e.g. user_profile.phone) — the country
// code and local number are combined into one string on save
// ("+60 12-4680 797"), matching the format already present in real existing
// data (confirmed via direct DB query — no migration needed for already-
// saved numbers, they already match this exact style).

export interface CountryCode {
  code: string;
  /** Full name, kept for accessibility (aria-label etc.) even though the
   *  visible dropdown option only shows `abbr`. */
  name: string;
  /** Short abbreviation shown in the dropdown (e.g. "MY") — the picker
   *  needs to stay compact since the code is only ~1 part of a 1:3 width
   *  split with the number input. */
  abbr: string;
}

// A representative set covering this company's own branches (Malaysia) plus
// common neighboring/major countries — not exhaustive; add more here if a
// country is missing.
export const COUNTRY_CODES: CountryCode[] = [
  { code: "+60", name: "Malaysia", abbr: "MY" },
  { code: "+65", name: "Singapore", abbr: "SG" },
  { code: "+66", name: "Thailand", abbr: "TH" },
  { code: "+62", name: "Indonesia", abbr: "ID" },
  { code: "+63", name: "Philippines", abbr: "PH" },
  { code: "+84", name: "Vietnam", abbr: "VN" },
  { code: "+86", name: "China", abbr: "CN" },
  { code: "+91", name: "India", abbr: "IN" },
  { code: "+44", name: "United Kingdom", abbr: "UK" },
  { code: "+61", name: "Australia", abbr: "AU" },
  { code: "+1", name: "US/Canada", abbr: "US" },
];

export const DEFAULT_COUNTRY_CODE = "+60";

// "+60 12-4680 797" -> { countryCode: "+60", digits: "124680797" }. Tries
// the known list longest-prefix-first (so "+65" isn't misread via a generic
// "+\d" match); falls back to the default code for a bare/unrecognized
// prefix rather than failing outright, since a legacy or hand-typed value
// should still round-trip into the field instead of appearing blank.
export function parsePhoneValue(value: string | null | undefined): { countryCode: string; digits: string } {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return { countryCode: DEFAULT_COUNTRY_CODE, digits: "" };

  const byLength = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);
  for (const { code } of byLength) {
    if (trimmed.startsWith(code)) {
      return { countryCode: code, digits: trimmed.slice(code.length).replace(/\D/g, "") };
    }
  }
  return { countryCode: DEFAULT_COUNTRY_CODE, digits: trimmed.replace(/\D/g, "") };
}

// Groups local digits as "XX-NNNN NNN..." (2-digit prefix, dash, then the
// rest — split into a 4-digit block plus remainder once there are enough
// digits) — matches the format already used in real saved profiles (e.g.
// "12-4680 797").
export function formatLocalDigits(digits: string): string {
  const d = digits.slice(0, 11);
  const len = d.length;
  if (len === 0) return "";
  if (len <= 2) return d;
  if (len <= 6) return `${d.slice(0, 2)}-${d.slice(2)}`;
  return `${d.slice(0, 2)}-${d.slice(2, 6)} ${d.slice(6)}`;
}

export function composePhoneValue(countryCode: string, digits: string): string {
  if (!digits) return "";
  return `${countryCode} ${formatLocalDigits(digits)}`;
}

// 7-11 digits covers the realistic range across the supported countries
// (e.g. Malaysian mobiles are 9-10 digits including the leading 1) without
// hard-coding a single country's exact length.
export function isValidPhoneDigits(digits: string): boolean {
  return /^\d{7,11}$/.test(digits);
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
