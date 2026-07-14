import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createNotification } from '@/lib/notifications';
import { getEmailTemplate, EmailType } from '@/lib/email-templates';
import { sendEmail, isEmailConfigured } from '@/lib/email';
import { runCron } from '@/lib/cron';
import { withBranchName } from '@/lib/send';
import { differenceInDays, startOfDay, startOfISOWeek } from 'date-fns';

export const dynamic = 'force-dynamic';

async function fireSim(
  parent: { id: string; name: string; email: string; studentName: string; branch: string; m1StartDate: Date },
  type: EmailType,
  monthNumber = 1,
) {
  const tpl = getEmailTemplate(type, {
    parentName: parent.name,
    studentName: parent.studentName,
    monthNumber,
  });

  let emailOk = false;
  let emailErr: string | null = null;
  if (isEmailConfigured()) {
    try {
      await sendEmail({ to: parent.email, subject: tpl.subject, text: tpl.text });
      emailOk = true;
    } catch (e) {
      emailErr = e instanceof Error ? e.message : String(e);
    }
  }

  await prisma.sendLog.create({
    data: {
      parentId: parent.id,
      contentType: type,
      monthNumber: type === 'video' ? monthNumber : null,
      status: 'SENT',
      message: tpl.text,
      triggeredBy: 'admin',
      reason: emailErr ?? `Manual simulate: ${type}`,
    },
  });
  await createNotification({
    type: 'sms_sent',
    parentId: parent.id,
    title: `${type} sent (simulate)`,
    message: `Sent to ${parent.name} — ${parent.studentName} (${parent.branch})`,
  });
  return { emailOk, emailErr };
}

export async function POST(req: NextRequest, { params }: { params: { action: string } }) {
  const { action } = params;

  switch (action) {
    case 'welcome': {
      // Create a fake parent to simulate a fresh intake — but simpler: pick first roster parent and log again
      const parentRow = await prisma.parent.findFirst({ where: { status: 'active' }, include: { branch: true } });
      if (!parentRow) return NextResponse.json({ error: 'No parents' }, { status: 404 });
      const parent = withBranchName(parentRow);
      await fireSim(parent, 'welcome');
      await fireSim(parent, 'followus');
      return NextResponse.json({ success: true, welcomeAndFollowus: parent.name });
    }

    case 'video': {
      const parents = (
        await prisma.parent.findMany({ where: { status: { in: ['active', 'trial'] } }, include: { branch: true } })
      ).map(withBranchName);
      const now = new Date();
      let count = 0;
      for (const p of parents) {
        const alreadySentThisWeek = await prisma.sendLog.findFirst({
          where: {
            parentId: p.id,
            contentType: 'video',
            sentAt: { gte: startOfISOWeek(now) },
            status: 'SENT',
          },
        });
        if (alreadySentThisWeek) continue;
        await fireSim(p, 'video');
        count++;
      }
      return NextResponse.json({ success: true, videoSent: count });
    }

    case 'review': {
      const parents = (
        await prisma.parent.findMany({ where: { status: { in: ['active', 'trial'] } }, include: { branch: true } })
      ).map(withBranchName);
      const now = startOfDay(new Date());
      let count = 0;
      for (const p of parents) {
        if (differenceInDays(now, startOfDay(p.enrollDate)) < 42) continue;
        const already = await prisma.sendLog.findFirst({
          where: { parentId: p.id, contentType: 'review', status: 'SENT' },
        });
        if (already) continue;
        await fireSim(p, 'review');
        count++;
      }
      return NextResponse.json({ success: true, reviewSent: count });
    }

    case 'referral': {
      const parents = (
        await prisma.parent.findMany({ where: { status: { in: ['active', 'trial'] } }, include: { branch: true } })
      ).map(withBranchName);
      const now = startOfDay(new Date());
      let count = 0;
      for (const p of parents) {
        if (differenceInDays(now, startOfDay(p.enrollDate)) < 56) continue;
        const already = await prisma.sendLog.findFirst({
          where: { parentId: p.id, contentType: 'referral', status: 'SENT' },
        });
        if (already) continue;
        await fireSim(p, 'referral');
        count++;
      }
      return NextResponse.json({ success: true, referralSent: count });
    }

    case 'followus': {
      const parents = (
        await prisma.parent.findMany({ where: { status: { in: ['active', 'trial'] } }, include: { branch: true } })
      ).map(withBranchName);
      const now = startOfDay(new Date());
      let count = 0;
      for (const p of parents) {
        if (differenceInDays(now, startOfDay(p.enrollDate)) < 14) continue;
        const already = await prisma.sendLog.findFirst({
          where: { parentId: p.id, contentType: 'followus_reminder', status: 'SENT' },
        });
        if (already) continue;
        await fireSim(p, 'followus_reminder');
        count++;
      }
      return NextResponse.json({ success: true, followusSent: count });
    }

    case 'birthday-send': {
      // En. Rizal Hamdan (Zayn Aqil) has a birthday
      const parentRow2 = await prisma.parent.findFirst({ where: { studentName: 'Zayn Aqil' }, include: { branch: true } });
      if (!parentRow2) return NextResponse.json({ error: 'not found' }, { status: 404 });
      const parent = withBranchName(parentRow2);
      await fireSim(parent, 'birthday');
      return NextResponse.json({ success: true, sent: parent.name });
    }

    case 'birthday-skip': {
      // Pn. Siti Aisyah (birthday null)
      const parent = await prisma.parent.findFirst({ where: { studentName: 'Amirah Insyirah', birthday: null } });
      if (!parent) return NextResponse.json({ error: 'not found' }, { status: 404 });
      await prisma.sendLog.create({
        data: {
          parentId: parent.id,
          contentType: 'birthday',
          status: 'SKIPPED',
          message: '',
          triggeredBy: 'admin',
          reason: 'Birthday not set — pending',
        },
      });
      await createNotification({
        type: 'sms_skipped',
        parentId: parent.id,
        title: 'Birthday skipped',
        message: `${parent.studentName} — birthday not set`,
      });
      return NextResponse.json({ success: true, skipped: parent.name });
    }

    case 'run-all':
    case 'run': {
      const counts = await runCron({ force: true });
      return NextResponse.json({ success: true, counts });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
