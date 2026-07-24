// Email templates for the reminder/escalation engine (spec §3 + §5).
// Pure functions: input -> { subject, html }. Transport lives in src/lib/email
// (sendEmail) and is invoked by server/engine/reminders.ts.
//
// NOTE ON COLORS: these are emails, rendered outside the app, so the design-token
// utility classes don't apply — the accent (#00B5FF) is intentionally inlined here,
// matching the app's `--accent` token.

import { format } from "date-fns";

const ACCENT = "#00B5FF";
const TEXT = "#21232A";
const MUTED = "#6F748C";
const BORDER = "#E4E8F5";
const SURFACE = "#FFFFFF";
const BACKGROUND = "#F8FAFF";

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDue(dueAt: Date | null): string {
  return dueAt ? format(dueAt, "d MMM yyyy, HH:mm") : "no due date";
}

interface LayoutInput {
  heading: string;
  bodyHtml: string;
  ctaLabel: string;
  url: string;
}

/** Shared minimal shell: accent header bar, plain readable body, one CTA button. */
function layout({ heading, bodyHtml, ctaLabel, url }: LayoutInput): string {
  const safeUrl = escapeHtml(url);
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background-color:${BACKGROUND};font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BACKGROUND};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:${SURFACE};border:1px solid ${BORDER};border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background-color:${ACCENT};padding:14px 24px;">
                <span style="color:#ffffff;font-size:15px;font-weight:600;letter-spacing:0.2px;">Ebright Flow</span>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 24px 8px 24px;">
                <h1 style="margin:0 0 12px 0;color:${TEXT};font-size:18px;line-height:26px;font-weight:600;">${heading}</h1>
                <div style="color:${TEXT};font-size:14px;line-height:22px;">${bodyHtml}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 24px 28px 24px;">
                <a href="${safeUrl}" style="display:inline-block;background-color:${ACCENT};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 20px;border-radius:8px;">${escapeHtml(ctaLabel)}</a>
                <p style="margin:16px 0 0 0;color:${MUTED};font-size:12px;line-height:18px;">
                  Or open this link: <a href="${safeUrl}" style="color:${ACCENT};text-decoration:none;">${safeUrl}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="border-top:1px solid ${BORDER};padding:14px 24px;">
                <p style="margin:0;color:${MUTED};font-size:12px;line-height:18px;">
                  You are receiving this because a workflow step involves you. Ebright Flow.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function detailRows(rows: Array<[string, string]>): string {
  const tr = rows
    .map(
      ([k, v]) =>
        `<tr>
          <td style="padding:6px 12px 6px 0;color:${MUTED};font-size:13px;white-space:nowrap;vertical-align:top;">${escapeHtml(k)}</td>
          <td style="padding:6px 0;color:${TEXT};font-size:13px;font-weight:500;">${escapeHtml(v)}</td>
        </tr>`,
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:12px 0;border-top:1px solid ${BORDER};border-bottom:1px solid ${BORDER};width:100%;">${tr}</table>`;
}

// ---------- Reminder ----------

export interface ReminderEmailInput {
  assigneeName: string;
  blockTitle: string;
  runName: string;
  flowName: string;
  dueAt: Date | null;
  strikeCount: number;
  strikeLimit: number;
  url: string;
}

export function reminderEmail(input: ReminderEmailInput): { subject: string; html: string } {
  const { assigneeName, blockTitle, runName, flowName, dueAt, strikeCount, strikeLimit, url } =
    input;
  // Normative strike math (guide §4): with strikeLimit = N, reminders fire at
  // strikes 1..N-1 and the Nth firing escalates — so only N-1 reminders ever
  // exist. The copy must promise exactly that (the strikeLimit = 1 guard covers
  // the degenerate case where no reminder is ever sent).
  const totalReminders = Math.max(1, strikeLimit - 1);
  const subject = `Reminder ${strikeCount}/${totalReminders}: "${blockTitle}" is waiting on you — ${runName}`;
  const bodyHtml = `
    <p style="margin:0 0 8px 0;">Hi ${escapeHtml(assigneeName)},</p>
    <p style="margin:0 0 8px 0;">
      The step <strong>${escapeHtml(blockTitle)}</strong> in
      <strong>${escapeHtml(runName)}</strong> is still open and assigned to you.
    </p>
    ${detailRows([
      ["Workflow", flowName],
      ["Run", runName],
      ["Step", blockTitle],
      ["Due", formatDue(dueAt)],
      ["Reminder", `${strikeCount} of ${totalReminders}`],
    ])}
    <p style="margin:8px 0 0 0;color:${MUTED};">
      After ${totalReminders} reminder${totalReminders === 1 ? "" : "s"} this step is escalated to your supervisor.
    </p>`;
  return {
    subject,
    html: layout({
      heading: "A step is waiting on you",
      bodyHtml,
      ctaLabel: "Open the run",
      url,
    }),
  };
}

// ---------- Escalation ----------

export interface EscalationEmailInput {
  supervisorName: string;
  assigneeName: string;
  blockTitle: string;
  runName: string;
  flowName: string;
  dueAt: Date | null;
  strikeCount: number;
  url: string;
}

export function escalationEmail(input: EscalationEmailInput): { subject: string; html: string } {
  const { supervisorName, assigneeName, blockTitle, runName, flowName, dueAt, strikeCount, url } =
    input;
  const subject = `Escalation: "${blockTitle}" in ${runName} needs your attention`;
  const bodyHtml = `
    <p style="margin:0 0 8px 0;">Hi ${escapeHtml(supervisorName)},</p>
    <p style="margin:0 0 8px 0;">
      The step <strong>${escapeHtml(blockTitle)}</strong> in
      <strong>${escapeHtml(runName)}</strong> has not been completed by
      <strong>${escapeHtml(assigneeName)}</strong> after ${strikeCount} reminder${strikeCount === 1 ? "" : "s"},
      and has been escalated to you.
    </p>
    ${detailRows([
      ["Workflow", flowName],
      ["Run", runName],
      ["Step", blockTitle],
      ["Assignee", assigneeName],
      ["Due", formatDue(dueAt)],
      ["Reminders sent", String(Math.max(0, strikeCount - 1))],
    ])}
    <p style="margin:8px 0 0 0;color:${MUTED};">
      No further reminders will be sent for this step.
    </p>`;
  return {
    subject,
    html: layout({
      heading: "A step has been escalated to you",
      bodyHtml,
      ctaLabel: "Review the run",
      url,
    }),
  };
}
