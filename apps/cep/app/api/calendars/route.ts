import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const type = url.searchParams.get('type');
  const events = await prisma.calendarEvent.findMany({
    where: type && type !== 'all' ? { type } : undefined,
    orderBy: { date: 'asc' },
  });
  return NextResponse.json(events);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const event = await prisma.calendarEvent.create({
    data: {
      type: body.type,
      title: body.title,
      date: new Date(body.date),
      branch: body.branch === 'all' || !body.branch ? null : body.branch,
      description: body.description ?? null,
    },
  });
  return NextResponse.json(event);
}
