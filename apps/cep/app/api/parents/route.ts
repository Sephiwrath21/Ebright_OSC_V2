import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isEmailConfigured } from '@/lib/email';
import { fireTriggeredSend } from '@/lib/send';
import { nextMonday } from 'date-fns';
import { planTypeFromDuration } from '@/lib/planTypes';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const branch = url.searchParams.get('branch');
  const planType = url.searchParams.get('plan_type');
  const search = url.searchParams.get('search');

  const parents = await prisma.parent.findMany({
    where: {
      ...(status && status !== 'all' ? { status } : {}),
      ...(branch && branch !== 'all' ? { branch: { name: branch } } : {}),
      ...(planType && planType !== 'all' ? { plan_type: planType } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { studentName: { contains: search } },
              { phone: { contains: search } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(parents);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const enrollDate = new Date(body.enrollDate);
  enrollDate.setHours(0, 0, 0, 0);

  const m1StartDate = nextMonday(enrollDate);
  const programDur = body.programDur ?? 6;

  const branchRow = await prisma.ebrightCepBranch.findUnique({ where: { name: body.branch } });
  if (!branchRow) {
    return NextResponse.json({ error: `Unknown branch "${body.branch}"` }, { status: 400 });
  }

  const parent = await prisma.parent.create({
    data: {
      name: body.name,
      email: body.email,
      phone: body.phone,
      branchId: branchRow.id,
      studentName: body.studentName,
      program: body.program,
      programDur,
      plan_type: body.plan_type ?? planTypeFromDuration(programDur),
      enrollDate,
      birthday: body.birthday ? new Date(body.birthday) : null,
      status: body.status ?? 'active',
      m1StartDate,
    },
  });

  // Fire welcome + follow-us immediately via the shared helper.
  // Shared helper handles: CMS lookup -> static fallback, Gmail send,
  // SendLog, notifications. Same code path as cron.
  const parentLike = { ...parent, branch: branchRow.name };
  const welcomeResult = await fireTriggeredSend(parentLike, 'DAY0_WELCOME', {
    triggeredBy: 'intake',
  });
  const followusResult = await fireTriggeredSend(parentLike, 'DAY0_FOLLOWUP', {
    triggeredBy: 'intake',
  });

  return NextResponse.json({
    parent,
    emailSent: {
      welcome: welcomeResult.emailSent,
      followus: followusResult.emailSent,
    },
    emailConfigured: isEmailConfigured(),
  });
}
