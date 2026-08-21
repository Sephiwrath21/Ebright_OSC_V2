import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { verifyMailer } from "@/lib/mailer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Debug endpoint — reports why outgoing mail is or isn't working.
 *
 * The deploy hosts are only reachable with an SSH key held in CI, so
 * `docker compose logs`, where [mailer] and [password-reset] write the real
 * reason a send failed, is not readable when mail breaks. Same motivation as
 * /api/debug/dashboard-health: answer the question from the browser.
 *
 * Auth: any signed-in user, matching dashboard-health. No secret value is
 * ever returned — the password is described (length, whether it carries
 * spaces or quotes) but never echoed.
 *
 * Usage:  GET /api/debug/mail-health
 */

/** Describe a secret without disclosing it. */
function describeSecret(v: string | undefined): Record<string, unknown> {
  if (!v) return { set: false };
  return {
    set: true,
    length: v.length,
    // Both of these are real causes of "Invalid login" against Gmail: an app
    // password copied from the Google UI carries spaces, and one copied out
    // of a .env line carries the surrounding quotes.
    hasSpaces: /\s/.test(v),
    hasQuotes: v.includes('"') || v.includes("'"),
    lengthIgnoringSpaces: v.replace(/\s/g, "").length,
  };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }

  const pass = process.env.SMTP_PASS ?? process.env.SMTP_PASSWORD;

  // The same gate password-reset applies before it will attempt SMTP at all.
  const smtpMissing = [
    !process.env.SMTP_HOST && "SMTP_HOST",
    !process.env.SMTP_USER && "SMTP_USER",
    !pass && "SMTP_PASS",
  ].filter(Boolean);

  const env = {
    SMTP_HOST: process.env.SMTP_HOST ?? null,
    SMTP_PORT: process.env.SMTP_PORT ?? null,
    SMTP_SECURE: process.env.SMTP_SECURE ?? null,
    SMTP_USER: process.env.SMTP_USER ?? null,
    SMTP_FROM_NAME: process.env.SMTP_FROM_NAME ?? null,
    SMTP_PASS: describeSecret(pass),
    // Which spelling is in play — mailer.ts accepts either, and a mismatch
    // fails as "Invalid login" rather than as missing config.
    passVariableUsed: process.env.SMTP_PASS
      ? "SMTP_PASS"
      : process.env.SMTP_PASSWORD
        ? "SMTP_PASSWORD"
        : null,
  };

  // Password reset falls back to Resend when SMTP fails, so its absence is
  // part of why the user sees a hard failure rather than a delivered mail.
  const resendConfigured = Boolean(
    process.env.CRM_RESEND_API_KEY || process.env.RESEND_API_KEY,
  );

  // Only probe when the config gate passes — otherwise nodemailer aims at
  // localhost and the ECONNREFUSED buries the actual problem.
  const probe = smtpMissing.length === 0 ? await verifyMailer() : null;

  return NextResponse.json({
    ok: probe?.ok ?? false,
    verdict:
      smtpMissing.length > 0
        ? `SMTP not configured — missing ${smtpMissing.join(", ")}`
        : probe?.ok
          ? "SMTP authenticated — credentials and transport are good"
          : probe?.cooldownActive
            ? `SMTP in cooldown for ${probe.cooldownRemaining} after an earlier auth/rate-limit failure`
            : `SMTP authentication failed — ${probe?.error?.message ?? "unknown error"}`,
    smtpMissing,
    env,
    resendConfigured,
    probe,
  });
}
