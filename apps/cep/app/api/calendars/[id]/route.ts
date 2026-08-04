import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await prisma.calendarEvent.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
