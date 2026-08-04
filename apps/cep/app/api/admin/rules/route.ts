import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const rules = await prisma.automationRule.findMany({
    include: { triggers: { orderBy: [{ planType: 'asc' }, { triggerRelativeTo: 'asc' }, { triggerDay: 'asc' }] } },
    orderBy: { name: 'asc' },
  });
  return NextResponse.json(rules);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const rule = await prisma.automationRule.create({
    data: { name, description: body.description || null, isActive: body.isActive ?? true },
  });
  return NextResponse.json(rule);
}
