/** Name of the cookie holding the user's theme preference. */
export const THEME_COOKIE = "theme";

/** One year in seconds — the preference should outlive any single session. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type Theme = "light" | "dark";

/**
 * Resolve a raw cookie value to a theme.
 *
 * Anything that is not exactly "dark" — a missing cookie, an empty string, a
 * stale or tampered value — falls back to light. Light is the product default
 * while dark-mode coverage is still partial, so users only ever land in dark
 * by explicitly opting in.
 *
 * This is the single place that decision is made, so the server-rendered class
 * and the client's view of the preference cannot drift apart.
 */
export function parseTheme(value: string | undefined | null): Theme {
  return value === "dark" ? "dark" : "light";
}
