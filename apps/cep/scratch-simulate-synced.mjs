import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const evt = await prisma.festiveEvent.create({
  data: {
    name: 'QA Simulated Synced Festival',
    slug: 'qa_simulated_synced_festival',
    date: new Date(),
    externalId: 'qa-fake-google-event-id-1',
    source: 'google_calendar',
    syncedAt: new Date(),
  },
});
console.log(evt.id);
await prisma.$disconnect();
