import nodemailer, { type SendMailOptions, type SentMessageInfo } from "nodemailer";

/**
 * SMTP transport, ported from the V1 portal (D:\Games\Ebrigth_OSC lib/mailer.ts)
 * so both apps send through the same authenticated, pooled, cooldown-protected
 * path. V1's app-specific senders (clock-in/out, missing-reminder, FA alerts)
 * are deliberately not carried over — V2 has no callers for them.
 */

// SMTP_PASS is the canonical name; SMTP_PASSWORD is accepted because some
// environments were configured with that spelling and the mismatch fails
// silently (undefined pass → "Invalid login", which looks like a bad
// credential rather than a missing variable).
const SMTP_PASSWORD = process.env.SMTP_PASS ?? process.env.SMTP_PASSWORD;

const SMTP_PORT = Number(process.env.SMTP_PORT) || 465;

// Implicit TLS vs STARTTLS is decided by the port, and getting it wrong hangs
// the connection until the timeout below rather than reporting anything
// useful: 465 speaks TLS from the first byte, 587 upgrades via STARTTLS.
// SMTP_SECURE overrides for a non-standard port.
const SMTP_SECURE = process.env.SMTP_SECURE
  ? /^(true|1|yes)$/i.test(process.env.SMTP_SECURE)
  : SMTP_PORT === 465;

// Gmail throttles when the same account performs many fresh logins in a short
// window ("454-4.7.0 Too many login attempts"). Pooling reuses a single
// authenticated connection across all sends.
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,     // true for port 465, false for 587 (STARTTLS)
  pool: true,              // keep the SMTP connection open
  maxConnections: 1,       // Gmail prefers a single connection per account
  maxMessages: 100,        // re-auth after 100 messages (well under Gmail's daily cap)
  rateDelta: 1000,         // window for rateLimit, in ms
  rateLimit: 3,            // max 3 messages per second — safe for Gmail
  // Fast timeouts: a single bad email must not block a request for 30+ seconds.
  // With these, a connection failure surfaces in <=5s and immediately trips the
  // cooldown (see safeSend below) so subsequent retries bail instantly instead
  // of each waiting for their own timeout.
  connectionTimeout: 5_000,  // TCP connect must complete within 5s
  greetingTimeout:   5_000,  // SMTP greeting must arrive within 5s
  socketTimeout:    10_000,  // overall send must complete within 10s
  auth: {
    user: process.env.SMTP_USER,
    // Gmail App Passwords are displayed in 4 groups of 4; the spaces are
    // cosmetic and must be stripped or the AUTH string is wrong.
    pass: SMTP_PASSWORD?.replaceAll(" ", ""),
  },
});

// ─── Cooldown circuit breaker ────────────────────────────────────────────────
// Once any send returns a Gmail rate-limit / auth failure, ALL further sends
// bail instantly for COOLDOWN_MS without touching Gmail. This stops a retry
// loop from re-hammering the account, which is what keeps a lockout going.
const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes
let cooldownUntil = 0;
let cooldownLogged = false;

function isRateLimitOrAuthError(err: unknown): boolean {
  const e = err as { code?: string; responseCode?: number; message?: string };
  // Auth / rate-limit errors from Gmail
  if (e?.code === "EAUTH") return true;
  if (e?.responseCode === 454 || e?.responseCode === 535) return true;
  // Network errors — also trip cooldown so we don't burn 30s per retry
  // when the SMTP host is unreachable / slow / refusing connections.
  if (
    e?.code === "ETIMEDOUT" ||
    e?.code === "ECONNECTION" ||
    e?.code === "ECONNREFUSED" ||
    e?.code === "ECONNRESET" ||
    e?.code === "ESOCKET"
  ) return true;
  const msg = (e?.message ?? "").toLowerCase();
  return msg.includes("too many login")
      || msg.includes("invalid login")
      || msg.includes("454")
      || msg.includes("etimedout")
      || msg.includes("econnrefused");
}

function fmtRemaining(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

async function safeSend(msg: SendMailOptions): Promise<SentMessageInfo> {
  const now = Date.now();
  if (now < cooldownUntil) {
    const remaining = cooldownUntil - now;
    if (!cooldownLogged) {
      console.warn(`[mailer] In cooldown for ${fmtRemaining(remaining)} — skipping sends until Gmail unlocks`);
      cooldownLogged = true;
    }
    throw new Error(`mailer in cooldown for ${fmtRemaining(remaining)}`);
  }

  try {
    const info = await transporter.sendMail(msg);
    cooldownLogged = false; // success — reset for next cooldown event
    return info;
  } catch (err) {
    if (isRateLimitOrAuthError(err)) {
      cooldownUntil = Date.now() + COOLDOWN_MS;
      cooldownLogged = false;
      console.error(`[mailer] Gmail rejected send — entering ${COOLDOWN_MS / 60000}min cooldown`);
    }
    throw err;
  }
}

// One-time SMTP auth check in production so the cause of any failure is obvious.
if (process.env.NODE_ENV === "production" && process.env.SMTP_HOST) {
  transporter.verify().then(
    () => console.log(`[mailer] SMTP authenticated as ${process.env.SMTP_USER}`),
    (err: Error) => {
      console.error(`[mailer] SMTP auth failed: ${err.message}`);
      if (isRateLimitOrAuthError(err)) {
        cooldownUntil = Date.now() + COOLDOWN_MS;
        console.error(`[mailer] Entering ${COOLDOWN_MS / 60000}min cooldown — no sends will be attempted`);
      }
    },
  );
}

/**
 * Generic SMTP send. Throws on failure (and trips the shared cooldown on
 * auth/rate-limit errors) so the caller can fall back to another transport.
 */
export async function sendMail(msg: SendMailOptions): Promise<SentMessageInfo> {
  return safeSend(msg);
}
