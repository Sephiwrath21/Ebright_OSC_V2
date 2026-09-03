"use server";

import bcrypt from "bcryptjs";
import crypto from "crypto";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createRateLimiter } from "@/lib/rate-limit";
import { validatePasswordPair } from "@/lib/password-policy";
import { sendMail } from "@/lib/mailer";
import { Resend } from "resend";

/**
 * Emailed password-reset flow, ported from the V1 portal
 * (D:\Games\Ebrigth_OSC app/forgot-password/password-reset-actions.ts).
 *
 * Adapted to V2's schema: V1's `user` (id / passwordHash / status "ACTIVE") is
 * V2's `users` (user_id / password / status "active"), and V1's
 * PasswordResetToken keyed by email is V2's password_reset_token keyed by a
 * user_id FK with used_at instead of a `used` boolean.
 *
 * NOT ported: V1's SessionRevocation write after a successful reset. V2 has no
 * such table and no isSessionValid() check in its JWT callbacks, so the row
 * would be written and never read. Existing sessions therefore survive a reset
 * here — see the note in the handover.
 */

export interface RequestResetResult {
  ok: boolean;
  error?: string;
  message?: string;
}

export interface ResetPasswordResult {
  ok: boolean;
  error?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Rate limiters for reset requests
const requestEmailLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 3 }); // max 3 per hour
const requestIpLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 10 }); // max 10 per hour

// How long a reset link stays usable. A reset link is a bearer credential —
// whoever holds it can take over the account — and it travels by email, where
// it can linger in a shared inbox, a forwarded thread, or a mail scanner's
// link prefetch. The window only has to cover switching to the mail app and
// clicking, so keep it short.
//
// The label is derived from the same source as the expiry so the two cannot
// drift: this file states the lifetime to the user twice (plain text and
// HTML), and a link that claims one lifetime and enforces another reads as a
// broken system.
const RESET_TOKEN_TTL_MS = 5 * 60 * 1000;
const RESET_TOKEN_TTL_LABEL = `${RESET_TOKEN_TTL_MS / 60_000} minutes`;

async function clientIp(): Promise<string> {
  try {
    const h = await headers();
    const fwd = h.get("x-forwarded-for");
    if (fwd) return fwd.split(",")[0].trim();
    return h.get("x-real-ip") ?? "unknown";
  } catch {
    return "127.0.0.1";
  }
}

/**
 * Origin to build the emailed reset link against.
 *
 * Configured env vars come FIRST and the request Host header is only a last
 * resort — Host is attacker-controllable, and a poisoned value here would mail
 * the account owner a valid reset token pointing at someone else's domain
 * (classic password-reset poisoning). The header fallback exists so a
 * deployment with no canonical URL configured still produces a working link
 * rather than one to localhost.
 *
 * NEXT_PUBLIC_APP_URL is kept first for parity with V1 but must not be relied
 * on: Next inlines NEXT_PUBLIC_* at BUILD time, so it compiles to `undefined`
 * in any image built without that ARG regardless of the runtime .env.
 */
async function resolveBaseUrl(): Promise<string> {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.BETTER_AUTH_URL ||
    process.env.NEXTAUTH_URL;
  if (configured) return configured.replace(/\/+$/, "");

  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) {
      const proto = h.get("x-forwarded-proto") ?? "https";
      console.warn(
        `[password-reset] No NEXT_PUBLIC_APP_URL / BETTER_AUTH_URL / NEXTAUTH_URL configured — ` +
        `falling back to the request host (${proto}://${host}).`,
      );
      return `${proto}://${host}`;
    }
  } catch {
    // Outside a request scope — fall through to the dev default.
  }

  return "http://localhost:3000";
}

function tooManyAttempts(retryAfterSec: number): RequestResetResult {
  const mins = Math.max(1, Math.ceil(retryAfterSec / 60));
  return {
    ok: false,
    error: `Too many password reset requests. Please try again in about ${mins} minute${mins === 1 ? "" : "s"}.`,
  };
}

/**
 * Server action to initiate password reset by generating a token and sending a reset link.
 */
export async function requestPasswordReset(
  _: RequestResetResult | null,
  formData: FormData,
): Promise<RequestResetResult> {
  const email = formData.get("email")?.toString().trim().toLowerCase();

  if (!email) return { ok: false, error: "Email is required." };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Please enter a valid email address." };

  const ip = await clientIp();
  const emailKey = `pwd-reset-req:email:${email}`;
  const ipKey = `pwd-reset-req:ip:${ip}`;

  // Check rate limits
  const emailGate = requestEmailLimiter.check(emailKey);
  if (emailGate.blocked) return tooManyAttempts(emailGate.retryAfterSec);

  const ipGate = requestIpLimiter.check(ipKey);
  if (ipGate.blocked) return tooManyAttempts(ipGate.retryAfterSec);

  // Record attempts on limiters
  requestEmailLimiter.record(emailKey);
  requestIpLimiter.record(ipKey);

  // Look up user
  const user = await prisma.users.findUnique({
    where: { email },
    select: { user_id: true, status: true, password: true },
  });

  // Safe success response to protect against user enumeration
  const successResponse = {
    ok: true,
    message: "If an active account exists with that email, a password reset link has been sent to it.",
  };

  // If the user doesn't exist, isn't active, or has no password set
  // (SSO/candidate accounts), return success without doing anything.
  if (!user || user.status !== "active" || !user.password) {
    return successResponse;
  }

  // Generate secure reset token
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  // Store in database
  await prisma.password_reset_token.create({
    data: {
      user_id: user.user_id,
      token_hash: tokenHash,
      expires_at: expiresAt,
      requested_ip: ip.slice(0, 64),
    },
  });

  const baseUrl = await resolveBaseUrl();
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;

  // Plain-text alternative. Not optional: a transactional message sent as
  // HTML-only with a single prominent link is a classic spam-filter signature,
  // and Gmail will quietly bin it. Every transport below sends multipart.
  const emailText = [
    "Hi,",
    "",
    "You requested a password reset for your Ebright account.",
    "",
    "Open this link to set a new password:",
    resetUrl,
    "",
    `This link is valid for ${RESET_TOKEN_TTL_LABEL} and can only be used once.`,
    "",
    "If you didn't request a password reset, you can safely ignore this email —",
    "your password stays unchanged.",
    "",
    "Ebright HR Team",
  ].join("\n");

  const emailHtml = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px;color:#111827;">
      <div style="background:#1d4ed8;border-radius:8px;padding:16px 24px;margin-bottom:24px;">
        <h1 style="color:white;margin:0;font-size:20px;">Ebright Password Reset</h1>
      </div>
      <p style="font-size:15px;">Hi,</p>
      <p style="font-size:15px;">
        You requested a password reset for your Ebright account. Please click the button below to set a new password:
      </p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${resetUrl}" style="background:#1d4ed8;color:white;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:bold;display:inline-block;">Reset Password</a>
      </div>
      <p style="font-size:14px;color:#4b5563;">
        Or copy and paste this link into your browser:
      </p>
      <p style="font-size:14px;color:#1d4ed8;word-break:break-all;">
        <a href="${resetUrl}">${resetUrl}</a>
      </p>
      <p style="font-size:13px;color:#6b7280;margin-top:24px;border-top:1px solid #e5e7eb;padding-top:16px;">
        This link is valid for ${RESET_TOKEN_TTL_LABEL}. If you didn't request a password reset, you can safely ignore this email.
      </p>
    </div>
  `;

  // Delivery mechanism
  let sent = false;

  // 1. Try SMTP mailer.
  //
  // SMTP_HOST is part of the gate, not just USER/PASS: without it nodemailer
  // silently targets localhost and the send dies with ECONNREFUSED, which
  // lib/mailer.ts then treats as a connection failure and uses to arm a 10-min
  // app-wide cooldown. Reporting it as missing config instead keeps a
  // half-configured environment from taking all outgoing mail down with it.
  const smtpMissing = [
    !process.env.SMTP_HOST && "SMTP_HOST",
    !process.env.SMTP_USER && "SMTP_USER",
    !(process.env.SMTP_PASS || process.env.SMTP_PASSWORD) && "SMTP_PASS",
  ].filter(Boolean);

  if (smtpMissing.length === 0) {
    try {
      await sendMail({
        from: `"Ebright Security" <${process.env.SMTP_USER}>`,
        to: email,
        subject: "Reset Your Password",
        text: emailText,
        html: emailHtml,
      });
      sent = true;
      console.log(`[password-reset] Reset link sent via SMTP to ${email}`);
    } catch (err) {
      console.error("[password-reset] SMTP send failed:", err);
    }
  } else {
    console.error(`[password-reset] SMTP not attempted — missing ${smtpMissing.join(", ")}`);
  }

  // 2. Try Resend API if SMTP failed or was not configured. V1 reads
  // CRM_RESEND_API_KEY; RESEND_API_KEY is also accepted here because that is
  // the name V2's existing induction mail already uses (src/lib/induction-email.ts).
  const resendKey = process.env.CRM_RESEND_API_KEY || process.env.RESEND_API_KEY;
  if (!sent && resendKey) {
    try {
      const resend = new Resend(resendKey);
      await resend.emails.send({
        from: process.env.CRM_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || "noreply@ebright.my",
        to: email,
        subject: "Reset Your Password",
        text: emailText,
        html: emailHtml,
      });
      sent = true;
      console.log(`[password-reset] Reset link sent via Resend API to ${email}`);
    } catch (err) {
      console.error("[password-reset] Resend API send failed:", err);
    }
  }

  // 3. Fallback to console logging in local development
  if (!sent) {
    if (process.env.NODE_ENV !== "production") {
      console.log("\n=======================================================");
      console.log(`[dev-reset] Reset link for ${email}: ${resetUrl}`);
      console.log("=======================================================\n");
      sent = true;
    } else {
      console.error(
        `[password-reset] Delivery failed for ${email} — SMTP ` +
        (smtpMissing.length ? `not attempted (missing ${smtpMissing.join(", ")})` : "attempted and failed") +
        `, Resend ${resendKey ? "attempted and failed" : "not configured (CRM_RESEND_API_KEY unset)"}.`,
      );
      return { ok: false, error: "Failed to send reset link. Please contact support." };
    }
  }

  return successResponse;
}

/**
 * Validates a reset token and updates the user's password.
 */
export async function resetPasswordWithToken(
  token: string,
  newPassword: string,
  confirmPassword: string,
): Promise<ResetPasswordResult> {
  if (!token) return { ok: false, error: "Invalid or missing token." };
  if (!newPassword || !confirmPassword) return { ok: false, error: "All password fields are required." };

  const policyError = validatePasswordPair(newPassword, confirmPassword);
  if (policyError) return { ok: false, error: policyError };

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  // Query database to find a valid, unused, unexpired token
  const tokenRecord = await prisma.password_reset_token.findUnique({
    where: { token_hash: tokenHash },
    select: {
      token_id: true,
      user_id: true,
      expires_at: true,
      used_at: true,
      users: { select: { user_id: true, status: true } },
    },
  });

  if (!tokenRecord || tokenRecord.used_at || tokenRecord.expires_at < new Date()) {
    return { ok: false, error: "The reset link is invalid or has expired. Please request a new one." };
  }

  if (tokenRecord.users.status !== "active") {
    return { ok: false, error: "The associated account is no longer active." };
  }

  // Hash the new password using bcrypt
  const newHash = await bcrypt.hash(newPassword, 10);

  // Update password and invalidate token. updateMany with a used_at: null guard
  // makes the burn conditional, so two submissions racing the same link cannot
  // both apply — the loser updates 0 rows and is rejected below.
  const burned = await prisma.password_reset_token.updateMany({
    where: { token_id: tokenRecord.token_id, used_at: null },
    data: { used_at: new Date() },
  });
  if (burned.count === 0) {
    return { ok: false, error: "The reset link is invalid or has expired. Please request a new one." };
  }

  await prisma.users.update({
    where: { user_id: tokenRecord.user_id },
    data: { password: newHash },
  });

  // Any other live link for this account is now stale.
  await prisma.password_reset_token.updateMany({
    where: { user_id: tokenRecord.user_id, used_at: null },
    data: { used_at: new Date() },
  });

  console.log(`[password-reset] Password reset completed successfully for user ${tokenRecord.user_id}`);
  return { ok: true };
}
