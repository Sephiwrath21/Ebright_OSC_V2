import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PLAN_TYPES } from '@/lib/planTypes';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const planType = body.planType;
  const triggerDay = Number(body.triggerDay);
  const triggerRelativeTo = body.triggerRelativeTo === 'end' ? 'end' : 'start';

  if (!PLAN_TYPES.includes(planType)) {
    return NextResponse.json({ error: `planType must be one of ${PLAN_TYPES.join(', ')}` }, { status: 400 });
  }
  if (!Number.isInteger(triggerDay) || triggerDay < 0) {
    return NextResponse.json({ error: 'triggerDay must be a non-negative integer' }, { status: 400 });
  }

  const trigger = await prisma.automationRuleTrigger.create({
    data: { ruleId: Number(params.id), planType, triggerDay, triggerRelativeTo },
  });
  return NextResponse.json(trigger);
}
