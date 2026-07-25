import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function DELETE(_req: NextRequest, { params }: { params: { triggerId: string } }) {

  await prisma.automationRuleTrigger.delete({ where: { id: Number(params.triggerId) } });
  return NextResponse.json({ success: true });
}
