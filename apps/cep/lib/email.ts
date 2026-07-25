import nodemailer from 'nodemailer';
import { wrapEmailShell } from './email-shell';

let cachedTransporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (cachedTransporter) return cachedTransporter;
  cachedTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
  return cachedTransporter;
}

export interface EmailPayload {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Optional CTA button URL rendered in the HTML template. */
  ctaLink?: string;
  /** Optional CTA button label (defaults to "Open link"). */
  ctaLabel?: string;
  /** SendLog id this email is for — required to embed the open-tracking pixel and click-tracked CTA link. */
  sendLogId?: string;
  /** Append the renewal-nudge block (renewal triggers, or any parent nearing plan expiry). */
  showRenewalNudge?: boolean;
  /** Optional poster/image (Content.imageUrl), rendered above the body text. */
  imageUrl?: string | null;
}

export async function sendEmail(payload: EmailPayload): Promise<{ messageId: string }> {
  const transporter = getTransporter();
  const fromName = process.env.GMAIL_FROM_NAME || 'Ebright Academy';
  const info = await transporter.sendMail({
    from: `"${fromName}" <${process.env.GMAIL_USER}>`,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html:
      payload.html ||
      (payload.sendLogId
        ? wrapEmailShell({
            subject: payload.subject,
            bodyText: payload.text,
            sendLogId: payload.sendLogId,
            ctaLink: payload.ctaLink,
            ctaLabel: payload.ctaLabel,
            showRenewalNudge: payload.showRenewalNudge,
            imageUrl: payload.imageUrl,
          })
        : payload.text),
  });
  return { messageId: info.messageId };
}

/** Lightweight check used by /api/cron/run before attempting real sends. */
export function isEmailConfigured(): boolean {
  const user = process.env.GMAIL_USER || '';
  const pass = process.env.GMAIL_APP_PASSWORD || '';
  if (!user || !pass) return false;
  if (user.includes('your-gmail') || pass.includes('xxxxxxxx')) return false;
  return true;
}