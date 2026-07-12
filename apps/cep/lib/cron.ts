import { prisma } from '@/lib/prisma';
import { addDays, addMonths, differenceInDays, startOfDay, startOfISOWeek } from 'date-fns';
import { fireRuleBasedSend, findContentForTrigger, withBranchName } from '@/lib/send';
import { getPlanDurationMonths } from '@/lib/plans';
import { getFestiveFallbackContent } from '@/lib/festive';
import { createNotification } from '@/lib/notifications';

interface ParentDetail {
  id: string;
  name: string;
  studentName: string;
}

/**
 * The main day-based automation engine.
 * Iterates through all active parents and all active automation rules,
 * determines which messages are due, and sends them.
 */
export async function runCron({ force = false }: { force?: boolean } = {}) {
  const today = startOfDay(new Date());
  const isMonday = today.getDay() === 1;
  const weekStart = startOfISOWeek(today);
  const counts: Record<string, number> = {};
  const details: Record<string, ParentDetail[]> = {};

  const recordSent = (key: string, parent: { id: string; name: string; studentName: string }) => {
    counts[key] = (counts[key] || 0) + 1;
    (details[key] ??= []).push({ id: parent.id, name: parent.name, studentName: parent.studentName });
  };

  // 1. Fetch all active automation rules with their triggers
  const rules = await prisma.automationRule.findMany({
    // where: { isActive: true }, // Recommended: add an isActive flag to rules
    include: { triggers: true },
  });

  // 2. Fetch all active parents
  const parents = (
    await prisma.parent.findMany({
      where: { status: { in: ['active', 'trial'] } },
      include: { branch: true },
    })
  ).map(withBranchName);

  // 1b. Fetch active festive events — calendar-date sends shared by all parents
  // (same shape as Birthday below, but the date comes from an admin-editable or
  // Cal.com-synced row instead of the parent record, since festival dates shift
  // every year — see lib/festiveSync.ts).
  const festiveEvents = await prisma.festiveEvent.findMany({ where: { isActive: true } });

  // 1c. Fetch active showcase events — one-off dates, also Cal.com-sourced
  // (see lib/showcaseSync.ts). Unlike festivals these never get a generic
  // fallback send (see the block below), so they're checked separately.
  const showcaseEvents = await prisma.showcaseEvent.findMany({ where: { isActive: true } });

  // 3. Process each parent against each rule
  for (const parent of parents) {
    if (!parent.plan_type) continue;

    const daysSinceEnroll = differenceInDays(today, startOfDay(parent.enrollDate));
    const planMonths = getPlanDurationMonths(parent.plan_type);

    for (const rule of rules) {
      const applicableTriggers = rule.triggers.filter((t) => t.planType === parent.plan_type);

      for (const trigger of applicableTriggers) {
        let isDue = false;
        let contentType = rule.name; // Default contentType is the rule name

        if (trigger.triggerRelativeTo === 'start') {
          // --- Start-relative triggers (e.g., Welcome, Follow-up) ---
          if (daysSinceEnroll === trigger.triggerDay) {
            isDue = true;
          }
        } else {
          // --- End-relative triggers (e.g., Renewal) ---
          if (planMonths > 0) {
            const expiryDate = addMonths(startOfDay(parent.enrollDate), planMonths);
            const daysUntilExpiry = differenceInDays(expiryDate, today);

            // For end-relative triggers, the day is a positive integer (e.g., 30, 14, 3)
            if (daysUntilExpiry === trigger.triggerDay) {
              isDue = true;
              // For sequences, create a unique contentType for each trigger
              contentType = `${rule.name}_${trigger.triggerDay}d_before_expiry`;
            }
          }
        }

        if (isDue) {
          // Check if this specific trigger has been sent before using its unique contentType
          const alreadySent = await prisma.sendLog.findFirst({
            where: {
              parentId: parent.id,
              contentType: contentType,
              status: { in: ['SENT', 'DELIVERED', 'OPENED', 'CLICKED'] },
            },
          });

          if (force || !alreadySent) {
            try {
              const result = await fireRuleBasedSend(parent, contentType, { triggeredBy: 'cron' });
              if (result.emailSent) {
                // Use the base rule name for counting
                recordSent(rule.name, parent);
              }
            } catch (e) {
              console.error(`Failed to send ${contentType} to parent ${parent.id}`, e);
            }
          }
        }
      }
    }

    // --- Non-plan-based sends ---

    // BIRTHDAY — once per year
    if (parent.birthday) {
      const birthdayThisYear = new Date(parent.birthday);
      birthdayThisYear.setFullYear(today.getFullYear());
      if (differenceInDays(startOfDay(birthdayThisYear), today) === 0) {
        const alreadySent = await prisma.sendLog.findFirst({
          where: { parentId: parent.id, contentType: 'birthday', sentAt: { gte: today } },
        });
        if (force || !alreadySent) {
          const result = await fireRuleBasedSend(parent, 'birthday', { triggeredBy: 'cron' });
          if (result.emailSent) recordSent('birthday', parent);
        }
      }
    }

    // VIDEO — every Monday, once per week
    if (isMonday) {
      const alreadySent = await prisma.sendLog.findFirst({
        where: { parentId: parent.id, contentType: { startsWith: 'video' }, sentAt: { gte: weekStart } },
      });
      if (force || !alreadySent) {
        // This logic can be customized. For now, we'll just use a generic 'video' trigger.
        // To support monthly videos, you could calculate month number and use `video_m1`, `video_m2`, etc.
        const result = await fireRuleBasedSend(parent, 'video', { triggeredBy: 'cron' });
        if (result.emailSent) recordSent('video', parent);
      }
    }
  }

  // FESTIVE — calendar-date, same for all parents (or one branch), not enrollment-relative.
  // Sends to all active parents regardless of festival (no religion/ethnicity segmentation).
  // Run as its own pass (not nested in the per-parent loop above) so the template lookup
  // below happens once per event/day, not once per parent — that's what keeps the
  // "no template found" admin reminder to a single notification instead of one per parent.
  for (const evt of festiveEvents) {
    const onDayDates = [evt.date, evt.endDate].filter((d): d is Date => d != null);
    const isOnDayToday = onDayDates.some((d) => differenceInDays(startOfDay(d), today) === 0);
    const isPreDayToday =
      evt.sendPreDays != null && differenceInDays(startOfDay(addDays(evt.date, -evt.sendPreDays)), today) === 0;

    const dueVariants: Array<{ contentType: string; label: string }> = [];
    if (evt.sendOnDay && isOnDayToday) dueVariants.push({ contentType: `festive_${evt.slug}`, label: evt.name });
    if (isPreDayToday) dueVariants.push({ contentType: `festive_${evt.slug}_pre`, label: `${evt.name} (pre-festival)` });
    if (dueVariants.length === 0) continue;

    for (const variant of dueVariants) {
      // Check once per event/variant/day whether a specific or generic festive
      // template exists — this decides both whether to log ONE admin reminder
      // (not one per parent) and what fallback to hand fireRuleBasedSend below.
      const matched =
        (await findContentForTrigger(variant.contentType, 'EMAIL', null)) ??
        (await findContentForTrigger('festive', 'EMAIL', null));
      const willUseFallback = !matched;

      if (willUseFallback) {
        const alreadyReminded = await prisma.ebrightCepNotification.findFirst({
          where: { type: 'festive_fallback', createdAt: { gte: today }, title: { contains: variant.label } },
        });
        if (!alreadyReminded) {
          await createNotification({
            type: 'festive_fallback',
            title: `⚠️ ${variant.label} sent using generic fallback`,
            message: `No custom template found for "${variant.label}" — add one in Content library.`,
            metadata: JSON.stringify({
              festivalName: evt.name,
              festivalSlug: evt.slug,
              calendarEventId: evt.externalId,
              calendarEventDate: evt.date.toISOString(),
              contentType: variant.contentType,
            }),
          });
        }
      }

      const fallback = willUseFallback ? getFestiveFallbackContent(evt.name) : undefined;

      for (const parent of parents) {
        if (evt.branch && evt.branch !== parent.branch) continue;

        const alreadySent = await prisma.sendLog.findFirst({
          where: { parentId: parent.id, contentType: variant.contentType, sentAt: { gte: today } },
        });
        if (force || !alreadySent) {
          const result = await fireRuleBasedSend(parent, variant.contentType, {
            triggeredBy: 'cron',
            fallback,
            metadata: {
              festivalName: evt.name,
              festivalSlug: evt.slug,
              calendarEventId: evt.externalId,
              calendarEventDate: evt.date.toISOString(),
            },
          });
          if (result.emailSent) recordSent(variant.contentType, parent);
        }
      }
    }
  }

  // SHOWCASE — one-off events, date-sourced from Cal.com (or manual entry). Unlike
  // festivals, a showcase with NO matching Content template does NOT get a generic
  // fallback send — a showcase needs real logistics (venue/time/what-to-bring), so a
  // placeholder greeting would be actively unhelpful. Instead we skip the send outright
  // and log an admin reminder that escalates in urgency once the date is within 7 days.
  for (const evt of showcaseEvents) {
    if (evt.date < today) continue; // already passed, nothing left to do

    const daysUntil = differenceInDays(startOfDay(evt.date), today);
    const contentType = `showcase_${evt.slug}`;
    const matched = await findContentForTrigger(contentType, 'EMAIL', null);

    if (!matched) {
      // Reminder — at most once per day per showcase, and escalates (distinct
      // notification type/urgency) once the date is 7 days out or closer.
      const urgent = daysUntil <= 7;
      const reminderType = urgent ? 'showcase_missing_template_urgent' : 'showcase_missing_template';
      const alreadyReminded = await prisma.ebrightCepNotification.findFirst({
        where: { type: reminderType, createdAt: { gte: today }, title: { contains: evt.name } },
      });
      if (!alreadyReminded) {
        await createNotification({
          type: reminderType,
          title: urgent
            ? `🚨 Showcase "${evt.name}" in ${daysUntil}d has no template yet!`
            : `⚠️ Showcase "${evt.name}" on ${evt.date.toDateString()} has no template yet`,
          message: `Showcase "${evt.name}" is on ${evt.date.toDateString()}${
            urgent ? ` — only ${daysUntil} day${daysUntil === 1 ? '' : 's'} away` : ''
          } and still has no Content library template. Create one before it can send.`,
          metadata: JSON.stringify({ showcaseName: evt.name, showcaseSlug: evt.slug, date: evt.date.toISOString(), daysUntil, contentType }),
        });
      }
    }

    // The actual send only fires on the showcase's real date, and only if a template
    // was found — no fallback path here, per the Don't-fallback rule for showcases.
    if (daysUntil !== 0 || !matched) continue;

    for (const parent of parents) {
      if (evt.branch && evt.branch !== parent.branch) continue;

      const alreadySent = await prisma.sendLog.findFirst({
        where: { parentId: parent.id, contentType, sentAt: { gte: today } },
      });
      if (force || !alreadySent) {
        const result = await fireRuleBasedSend(parent, contentType, {
          triggeredBy: 'cron',
          metadata: { showcaseName: evt.name, showcaseSlug: evt.slug, date: evt.date.toISOString() },
        });
        if (result.emailSent) recordSent(contentType, parent);
      }
    }
  }

  // 4. Construct a summary for the UI
  const summaryParts: string[] = [];
  for (const [key, value] of Object.entries(counts)) {
    if (value > 0) {
      // Capitalize and remove underscores for display
      const label = key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
      summaryParts.push(`${label} ${value}`);
    }
  }
  const summary = summaryParts.join(' · ') || 'Ran — no emails due';

  // One audit notification per run, only when something actually fired — avoids
  // spamming the bell every idle minute. Carries the full per-category parent
  // list so the notification detail modal can render an expandable breakdown.
  if (summaryParts.length > 0) {
    await createNotification({
      type: 'cron_completed',
      title: `Cron completed — ${summary}`,
      message: summary,
      metadata: JSON.stringify({ counts, details }),
    });
  }

  return { ok: true, summary, counts, details };
}
