import "server-only";

// Who's currently on the website, tracked entirely IN SERVER MEMORY — no
// database writes (per the "ask supervisor before storing anything" decision).
// A browser pings /api/presence on a heartbeat; we remember email -> lastSeen.
// "Online" = a heartbeat within the last ONLINE_WINDOW_MS. State is per server
// process and resets on restart, which is fine for a live presence indicator.

type PresenceStore = { seen: Map<string, number> };

const g = globalThis as unknown as { __ebright_presence?: PresenceStore };
const store: PresenceStore = g.__ebright_presence ?? { seen: new Map() };
if (!g.__ebright_presence) g.__ebright_presence = store;

const ONLINE_WINDOW_MS = 60_000; // heartbeat cadence is ~30s, so 60s tolerates one miss

/** Record that this user is currently active (called on each heartbeat). */
export function touchPresence(email: string): void {
  if (!email) return;
  store.seen.set(email.toLowerCase(), Date.now());
}

/** True if the email had a heartbeat within the online window. */
export function isOnline(email: string | null | undefined): boolean {
  if (!email) return false;
  const ts = store.seen.get(email.toLowerCase());
  return ts != null && Date.now() - ts < ONLINE_WINDOW_MS;
}
