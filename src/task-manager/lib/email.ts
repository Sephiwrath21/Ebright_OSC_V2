// Email transport (spec §3): Resend from a dedicated transactional subdomain.
// Dev/undeployed mode (no RESEND_API_KEY): logs the email instead of sending,
// so the engine is fully exercisable before the flow.ebright.my DNS is set up.
// Templates live in server/email; this file is transport only.

import { Resend } from "resend";

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
}

const FROM = () => process.env.EMAIL_FROM ?? "Ebright Flow <notify@flow.ebright.my>";

const globalForResend = globalThis as unknown as { resend?: Resend };

export async function sendEmail(email: OutgoingEmail): Promise<{ id: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.info(
      `[email:dev] to=${email.to} subject="${email.subject}" (RESEND_API_KEY unset — not sent)`,
    );
    return { id: `dev-${Buffer.from(email.to + email.subject).toString("hex").slice(0, 12)}` };
  }
  if (!globalForResend.resend) globalForResend.resend = new Resend(key);
  const result = await globalForResend.resend.emails.send({
    from: FROM(),
    to: email.to,
    subject: email.subject,
    html: email.html,
  });
  if (result.error) throw new Error(`Resend: ${result.error.message}`);
  return { id: result.data?.id ?? "unknown" };
}
