/**
 * Shared send helper — used by:
 *   - lib/cron.ts        (day-based automation triggers)
 *   - lib/autoblast.ts   (recurring auto-blast jobs)
 *   - app/api/parents/route.ts (Day-0 intake sends)
 *
 * Handles: template resolution (Content CMS -> static fallback),
 * real email send (Gmail SMTP), SMS/WA simulation log, notification.
 */
import { prisma } from './prisma';
import { sendEmail, isEmailConfigured } from './email';
import type { EngagementStatus } from '@prisma/client';
import { getEmailTemplate, EmailType } from './email-templates';
import { createNotification } from './notifications';
import { getCurrentMonth } from './dates';
import { getPlanDurationMonths } from './plans';
import { addMonths, differenceInDays } from 'date-fns';
import crypto from 'crypto';
import { PLAN_TYPE_LABELS } from './planTypes';
import { contentAppliesToPlan } from './content';

export type TriggerType =
  | 'DAY0_WELCOME'
  | 'DAY0_FOLLOWUP'
  | 'DAY14_REMINDER'
  | 'WEEKLY_VIDEO'
  | 'DAY42_REVIEW'
  | 'DAY56_REFERRAL'
  | 'BIRTHDAY';

/** Legacy `contentType` string used in SendLog + email-templates.ts. */
export type LegacyContentType = EmailType;

/** Map new trigger enum -> legacy contentType (used for SendLog + fallback template lookup). */
export const TRIGGER_TO_LEGACY: Record<TriggerType, LegacyContentType> = {
  DAY0_WELCOME: 'welcome',
  DAY0_FOLLOWUP: 'followus',
  DAY14_REMINDER: 'followus_reminder',
  WEEKLY_VIDEO: 'video',
  DAY42_REVIEW: 'review',
  DAY56_REFERRAL: 'referral',
  BIRTHDAY: 'birthday',
};

export interface ParentLike {
  id: string;
  name: string;
  email: string;
  studentName: string;
  branch: string;
  m1StartDate: Date;
  plan_type?: string | null;
  enrollDate?: Date;
}

/**
 * Parent is now fetched with `branch` as a Branch relation, but ParentLike (and
 * everything downstream — message text, festive/showcase branch matching) still
 * works off a plain branch-name string. Flattens the relation at the query
 * boundary rather than threading `.branch.name` through every call site.
 */
export function withBranchName<T extends { branch: { name: string } }>(
  parent: T,
): Omit<T, 'branch'> & { branch: string } {
  const { branch, ...rest } = parent;
  return { ...rest, branch: branch.name };
}

export interface SendResult {
  emailAttempted: boolean;
  emailSent: boolean;
  emailError: string | null;
  usedContentId: string | null;
  message: string;
  subject: string;
}

/** Enrollment date + plan length -> expiry date, or null if either is missing/unrecognized. */
export function computeExpiryDate(parent: { enrollDate?: Date; plan_type?: string | null }): Date | null {
  if (!parent.enrollDate || !parent.plan_type) return null;
  const months = getPlanDurationMonths(parent.plan_type);
  if (!months) return null;
  return addMonths(parent.enrollDate, months);
}

/** True if the parent's plan expires within `days` (default 30) — drives the email shell's renewal nudge. */
export function isNearExpiry(parent: { enrollDate?: Date; plan_type?: string | null }, days = 30): boolean {
  const expiry = computeExpiryDate(parent);
  if (!expiry) return false;
  const daysLeft = differenceInDays(expiry, new Date());
  return daysLeft >= 0 && daysLeft <= days;
}

function generateSendLogId(): string {
  return crypto.randomBytes(16).toString('hex');
}

/** First word of a parent's name, e.g. "Pn. Siti Aisyah" -> "Siti" (skips honorifics like Pn./En.). */
function getFirstName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter((p) => !/^(pn\.?|en\.?|mr\.?|mrs\.?|ms\.?)$/i.test(p));
  return parts[0] ?? fullName;
}

/**
 * Render merge fields in a body string:
 *   {{parent_name}}, {{student_name}}, {{plan_type}}, {{expiry_date}}
 * Also supports the legacy `{parentName}`/`[parentName]` (and studentName) syntax
 * used by existing seeded Content templates, plus `{parent_first_name}`.
 */
export function renderPlaceholders(
  template: string,
  data: { parentName: string; studentName: string; planType?: string | null; expiryDate?: Date | null },
): string {
  const planTypeLabel = data.planType ? PLAN_TYPE_LABELS[data.planType] ?? data.planType : '';
  const expiryDateLabel = data.expiryDate
    ? data.expiryDate.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';
  return template
    .replace(/\{\{parent_name\}\}/g, data.parentName)
    .replace(/\{\{student_name\}\}/g, data.studentName)
    .replace(/\{\{plan_type\}\}/g, planTypeLabel)
    .replace(/\{\{expiry_date\}\}/g, expiryDateLabel)
    .replace(/\{parentName\}/g, data.parentName)
    .replace(/\[parentName\]/g, data.parentName)
    .replace(/\{studentName\}/g, data.studentName)
    .replace(/\[studentName\]/g, data.studentName)
    .replace(/\{parent_first_name\}/g, getFirstName(data.parentName));
}

/**
 * Look up an active Content record matching (triggerType, channel).
 * `weekNumber`, when given, additionally restricts to the matching per-parent
 * Weekly conveyer-belt week (e.g. the 'video' trigger's imported week-N content) —
 * omit it for triggers that aren't week-scoped.
 * Returns null if none found — caller should fall back to static template.
 */
export async function findContentForTrigger(
  triggerType: TriggerType | string,
  channel: 'EMAIL' | 'SMS' | 'WHATSAPP',
  parentPlanType?: string | null,
  weekNumber?: number | null,
) {
  const candidates = await prisma.content.findMany({
    where: { triggerType, channel, isActive: true, ...(weekNumber != null ? { weekNumber } : {}) },
    orderBy: { updatedAt: 'desc' },
  });
  return candidates.find((c) => contentAppliesToPlan(c.planTypes, parentPlanType)) ?? null;
}

/**
 * Fires a single send for one parent + one rule.
 * - Looks up Content CMS record for the given ruleName.
 * - Falls back to opts.fallback (generic text) if no CMS template matches and a
 *   fallback was supplied — used by lib/cron.ts's Festive block so a missing
 *   template never means a silently-skipped send.
 * - Sends real email (Gmail SMTP) if configured.
 * - Logs to SendLog.
 * - Creates admin bell notification (carries opts.metadata as structured JSON
 *   for the notification detail modal).
 */
export async function fireRuleBasedSend(
  parent: ParentLike,
  ruleName: string, // e.g. 'review', 'renewal_30d_before_expiry'
  opts: {
    triggeredBy?: string;
    fallback?: { title: string; body: string };
    metadata?: Record<string, unknown>;
    weekNumber?: number;
  } = {},
): Promise<SendResult & { usedFallback: boolean }> {
  const triggeredBy = opts.triggeredBy ?? 'cron';

  // 1. Look up CMS override for EMAIL channel
  let cmsEmail = await findContentForTrigger(ruleName, 'EMAIL', parent.plan_type, opts.weekNumber);

  // Fallback for sequenced rules (e.g., 'renewal_30d_before_expiry' -> 'renewal')
  if (!cmsEmail && ruleName.includes('_')) {
    const baseRuleName = ruleName.split('_')[0];
    cmsEmail = await findContentForTrigger(baseRuleName, 'EMAIL', parent.plan_type, opts.weekNumber);
  }

  const usedFallback = !cmsEmail && Boolean(opts.fallback);

  if (!cmsEmail && !opts.fallback) {
    // No content template and no fallback supplied — can't send anything.
    // Log this as a skipped event for visibility.
    await prisma.sendLog.create({
      data: {
        parentId: parent.id,
        contentType: ruleName,
        weekNumber: opts.weekNumber ?? null,
        status: 'SKIPPED',
        message: `No active content template found for trigger: ${ruleName}`,
        triggeredBy,
        reason: 'no_content',
      },
    });
    return { emailAttempted: false, emailSent: false, emailError: 'No content template found', usedContentId: null, message: '', subject: '', usedFallback: false };
  }

  const subject = cmsEmail ? cmsEmail.title : opts.fallback!.title;
  const bodyTemplate = cmsEmail ? cmsEmail.body : opts.fallback!.body;
  const text = renderPlaceholders(bodyTemplate, {
    parentName: parent.name,
    studentName: parent.studentName,
    planType: parent.plan_type,
    expiryDate: computeExpiryDate(parent),
  });
  const link = cmsEmail?.link ?? null;
  const sendLogId = generateSendLogId();

  // 2. Real email send
  let emailAttempted = false;
  let emailSent = false;
  let emailError: string | null = null;

  if (isEmailConfigured()) {
    emailAttempted = true;
    try {
      await sendEmail({
        to: parent.email,
        subject,
        text: link ? `${text}\n\n${link}` : text,
        sendLogId,
        showRenewalNudge: ruleName.startsWith('renewal') || isNearExpiry(parent),
        imageUrl: cmsEmail?.imageUrl,
        ...(link ? { ctaLink: link } : {}),
      });
      emailSent = true;
    } catch (err) {
      emailError = err instanceof Error ? err.message : String(err);
    }
  }

  // 3. Log to SendLog
  await prisma.sendLog.create({
    data: {
      id: sendLogId,
      parentId: parent.id,
      contentType: ruleName,
      weekNumber: opts.weekNumber ?? null,
      status: !emailAttempted ? 'SKIPPED' : emailSent ? 'SENT' : 'FAILED',
      message: text,
      triggeredBy,
      reason: usedFallback ? 'fallback_template' : emailError,
      errorMessage: emailError,
      sentAt: emailSent ? new Date() : undefined,
    },
  });

  // 4. Bell notification
  const metadata = opts.metadata ? { ...opts.metadata, usedFallback, sendLogId } : { usedFallback, sendLogId };
  await createNotification({
    type: emailSent ? 'sms_sent' : 'sms_skipped',
    parentId: parent.id,
    title: `${humanise(ruleName)} ${emailSent ? 'sent' : 'failed'}${usedFallback ? ' (generic fallback)' : ' (CMS)'}`,
    message: `${emailSent ? 'Sent' : 'Failed'} to ${parent.name} — ${parent.studentName} (${parent.branch})`,
    metadata: JSON.stringify(metadata),
  });

  return { emailAttempted, emailSent, emailError, usedContentId: cmsEmail?.id ?? null, message: text, subject, usedFallback };
}

/**
 * Fire a single send for one parent + one trigger.
 * - Looks up Content CMS override for the EMAIL channel; falls back to static template.
 * - Sends real email (Gmail SMTP) if configured.
 * - Logs SMS/WA simulation to SendLog.
 * - Creates admin bell notification.
 *
 * `triggeredBy` distinguishes source (cron / intake / admin / autoblast).
 */
export async function fireTriggeredSend(
  parent: ParentLike,
  trigger: TriggerType,
  opts: { triggeredBy?: string } = {},
): Promise<SendResult> {
  const legacyType = TRIGGER_TO_LEGACY[trigger];
  const triggeredBy = opts.triggeredBy ?? 'cron';
  const monthNumber = getCurrentMonth(new Date(parent.m1StartDate));

  // 1. Look up CMS override for EMAIL channel; fall back to static template
  const cmsEmail = await findContentForTrigger(trigger, 'EMAIL', parent.plan_type);
  const staticTpl = getEmailTemplate(legacyType, {
    parentName: parent.name,
    studentName: parent.studentName,
    branch: parent.branch,
    monthNumber,
    referralCode: 'EB-REF-JUN25',
  });

  let subject: string;
  let text: string;
  let link: string | null = null;
  let usedContentId: string | null = null;

  if (cmsEmail) {
    usedContentId = cmsEmail.id;
    subject = cmsEmail.title;
    text = renderPlaceholders(cmsEmail.body, {
      parentName: parent.name,
      studentName: parent.studentName,
      planType: parent.plan_type,
      expiryDate: computeExpiryDate(parent),
    });
    link = cmsEmail.link ?? null;
  } else {
    subject = staticTpl.subject;
    text = staticTpl.text;
  }

  // 2. Real email send
  let emailAttempted = false;
  let emailSent = false;
  let emailError: string | null = null;
  const sendLogId = generateSendLogId();

  if (isEmailConfigured()) {
    emailAttempted = true;
    try {
      await sendEmail({
        to: parent.email,
        subject,
        text: link ? `${text}\n\n${link}` : text,
        sendLogId,
        showRenewalNudge: trigger === 'BIRTHDAY' ? false : isNearExpiry(parent),
        imageUrl: cmsEmail?.imageUrl,
        // If a Content record supplied a link, pass it through so email.ts can render a CTA button.
        ...(link ? { ctaLink: link } : {}),
      });
      emailSent = true;
    } catch (err) {
      emailError = err instanceof Error ? err.message : String(err);
      console.error(`❌ Email [${trigger}] -> ${parent.email}: ${emailError}`);
    }
  } else {
    emailError = 'Email not configured (GMAIL_USER/GMAIL_APP_PASSWORD missing)';
  }

  // 3. Log SMS/WA simulation
  await prisma.sendLog.create({
    data: {
      id: sendLogId,
      parentId: parent.id,
      contentType: legacyType,
      monthNumber: legacyType === 'video' ? monthNumber : null,
      status: !emailAttempted ? 'SKIPPED' : emailSent ? 'SENT' : 'FAILED',
      message: text,
      smsSent: true,
      waSent: true,
      smsStatus: 'sent',
      waStatus: 'sent',
      triggeredBy,
      reason: emailError ?? `${triggeredBy}: ${trigger}${usedContentId ? ` (CMS)` : ''}`,
      sentAt: emailSent ? new Date() : undefined,
      errorMessage: emailError,
    },
  });

  // 4. Bell notification
  await createNotification({
    type: emailSent || !isEmailConfigured() ? 'sms_sent' : 'sms_skipped',
    parentId: parent.id,
    title: `${humanise(trigger)} ${emailSent ? 'sent' : 'logged'}${usedContentId ? ' (CMS)' : ''}`,
    message: `${emailSent ? 'Sent' : 'Logged'} to ${parent.name} — ${parent.studentName} (${parent.branch})`,
  });

  return { emailAttempted, emailSent, emailError, usedContentId, message: text, subject };
}

/**
 * Blast helper for a resolved Content record (used by manual /blast/send,
 * /promo/send, and lib/autoblast.ts). Sends real email if channel is EMAIL,
 * logs SMS/WA simulation regardless, creates notifications.
 *
 * `opts.contentType` tags the SendLog/notification (defaults to 'blast') — Promo
 * sends pass 'promo' so they're distinguishable from a manual Blast in
 * Queue/Notifications despite using the exact same send mechanism underneath.
 */
export async function fireBlastSend(
  parent: ParentLike,
  content: {
    id: string;
    title: string;
    channel: string;
    body: string;
    link: string | null;
    imageUrl?: string | null;
  },
  opts: { triggeredBy?: string; reason?: string; contentType?: string; label?: string } = {},
): Promise<SendResult> {
  const triggeredBy = opts.triggeredBy ?? 'admin';
  const reason = opts.reason ?? 'Manual blast';
  const contentType = opts.contentType ?? 'blast';
  const label = opts.label ?? 'blast';

  const text = renderPlaceholders(content.body, {
    parentName: parent.name,
    studentName: parent.studentName,
    planType: parent.plan_type,
    expiryDate: computeExpiryDate(parent),
  });
  const subject = content.title;
  const link = content.link;

  let emailAttempted = false;
  let emailSent = false;
  let emailError: string | null = null;
  const sendLogId = generateSendLogId();

  if (content.channel === 'EMAIL' && isEmailConfigured()) {
    emailAttempted = true;
    try {
      await sendEmail({
        to: parent.email,
        subject,
        text: link ? `${text}\n\n${link}` : text,
        sendLogId,
        showRenewalNudge: isNearExpiry(parent),
        imageUrl: content.imageUrl,
        ...(link ? { ctaLink: link } : {}),
      });
      emailSent = true;
    } catch (err) {
      emailError = err instanceof Error ? err.message : String(err);
    }
  } else if (content.channel === 'EMAIL' && !isEmailConfigured()) {
    emailError = 'Email not configured';
  }

  let status: EngagementStatus;
  if (content.channel === 'EMAIL') {
    if (!isEmailConfigured()) {
      status = 'SKIPPED';
    } else {
      status = emailSent ? 'SENT' : 'FAILED';
    }
  } else {
    // For SMS/WA simulations, we just log it as sent.
    status = 'SENT';
  }

  await prisma.sendLog.create({
    data: {
      id: sendLogId,
      parentId: parent.id,
      contentType,
      status,
      message: text,
      smsSent: content.channel === 'SMS' || content.channel === 'WHATSAPP',
      waSent: content.channel === 'WHATSAPP',
      smsStatus: 'sent',
      waStatus: 'sent',
      triggeredBy,
      reason: emailError ?? `${reason} · ${content.channel} · content:${content.id}`,
      sentAt: emailSent ? new Date() : undefined,
      errorMessage: emailError,
    },
  });

  await createNotification({
    type: contentType === 'promo' ? 'promo_sent' : 'blast_sent',
    parentId: parent.id,
    title: `${content.channel} ${label} ${emailSent || content.channel !== 'EMAIL' ? 'sent' : 'logged'}`,
    message: `${parent.name} — ${parent.studentName} · ${content.title}`,
  });

  return { emailAttempted, emailSent, emailError, usedContentId: content.id, message: text, subject };
}

function humanise(trigger: string): string {
  return trigger
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase());
}
