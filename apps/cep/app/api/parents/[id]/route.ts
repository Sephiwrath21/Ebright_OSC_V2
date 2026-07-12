import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PLAN_TYPES } from '@/lib/planTypes';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const parent = await prisma.parent.findUnique({
    where: { id: params.id },
    include: {
      sendLogs: { orderBy: { sentAt: 'desc' } },
    },
  });
  if (!parent) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(parent);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();

  if (body.plan_type !== undefined && body.plan_type !== null && !PLAN_TYPES.includes(body.plan_type)) {
    return NextResponse.json({ error: `plan_type must be one of ${PLAN_TYPES.join(', ')}` }, { status: 400 });
  }

  const parent = await prisma.parent.update({
    where: { id: params.id },
    data: {
      ...(body.plan_type !== undefined ? { plan_type: body.plan_type } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
    },
  });

  return NextResponse.json(parent);
}
