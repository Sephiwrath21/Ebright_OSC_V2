import { prisma } from '@/lib/prisma';
import { CalendarGrid, type CalendarEventItem } from './CalendarGrid';

export const dynamic = 'force-dynamic';

export default async function CalendarsPage() {
  const events = await prisma.calendarEvent.findMany({ orderBy: { date: 'asc' } });

  const items: CalendarEventItem[] = events.map((e) => ({
    id: e.id,
    type: e.type,
    title: e.title,
    date: e.date.toISOString(),
    branch: e.branch,
    description: e.description,
  }));

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '22px', fontWeight: 600, margin: 0 }}>Calendars</h1>
      <p style={{ color: '#6b7280', fontSize: '13px', margin: '6px 0 24px' }}>
        Celebrations · Showcases · Ad-hoc events across all branches
      </p>

      <CalendarGrid events={items} />
    </div>
  );
}
