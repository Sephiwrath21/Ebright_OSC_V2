/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';
import { subDays, nextMonday } from 'date-fns';

const prisma = new PrismaClient();

function date(s: string): Date {
  return new Date(s + 'T00:00:00.000Z');
}
type SitiLog = {
  contentType: string;
  status: 'SENT' | 'SKIPPED';
  sentAt: Date;
  triggeredBy: string;
  monthNumber?: number;
  weekNumber?: number;
  reason?: string;
};

async function main() {
  console.log('🌱 Seeding Ebright SMS Portal...');

  // Wipe in dependency order
  await prisma.ebrightCepNotification.deleteMany();
  await prisma.autoBlastJob.deleteMany();
  await prisma.sendLog.deleteMany();
  await prisma.sendSchedule.deleteMany();
  await prisma.automationRuleTrigger.deleteMany();
  await prisma.automationRule.deleteMany();
  await prisma.parent.deleteMany();
  await prisma.content.deleteMany();
  await prisma.calendarEvent.deleteMany();
  await prisma.festiveEvent.deleteMany();

  // ── BRANCHES ─────────────────────────────────────────────────────
  // Real 23-branch list (all "Ebright Public Speaking"/"...Academy" locations)
  // plus the 4 short demo names used by the roster/test-parent data below —
  // those don't match any real branch and exist only for readable demo data.
  const REAL_BRANCHES = [
    'Ebright Public Speaking (Online)',
    'Ebright Public Speaking (Subang Taipan)',
    'Ebright Public Speaking (Setia Alam)',
    'Ebright Public Speaking (Sri Petaling)',
    'Ebright Kids Public Speaking (Kota Damansara)',
    'Ebright Public Speaking (Putrajaya)',
    'Ebright Kids Public Speaking (Ampang)',
    'Ebright Public Speaking (Cyberjaya)',
    'Ebright Public Speaking (Klang)',
    'Ebright Kids Public Speaking (Denai Alam)',
    'Ebright Public Speaking (Bandar Baru Bangi)',
    'Ebright Public Speaking (Danau Kota)',
    'Ebright Public Speaking (Shah Alam)',
    'Ebright Public Speaking (Bandar Tun Hussein Onn)',
    'Ebright Public Speaking (Eco Grandeur)',
    'Ebright Public Speaking (Bandar Seri Putra)',
    'Ebright Public Speaking Academy (Bandar Rimbayu)',
    'Ebright Public Speaking Academy (Taman Sri Gombak)',
    'Ebright Public Speaking Academy (Kota Warisan)',
    'Ebright Public Speaking Academy (TTDI Grove)',
    'Ebright Public Speaking Academy (Tropicana Sungai Buloh)',
    'Ebright Public Speaking Academy (Puncak Jalil)',
    'Ebright Public Speaking Academy (Puchong Utama)',
  ];
  const DEMO_BRANCHES = ['Subang Jaya', 'Puchong', 'Shah Alam', 'KL Sentral'];
  for (const name of [...REAL_BRANCHES, ...DEMO_BRANCHES]) {
    await prisma.ebrightCepBranch.upsert({ where: { name }, update: {}, create: { name, isActive: true } });
  }
  const branchRows = await prisma.ebrightCepBranch.findMany();
  const branchIdByName = new Map(branchRows.map((b) => [b.name, b.id]));
  console.log(`✓ Seeded ${branchRows.length} branches (${REAL_BRANCHES.length} real + ${DEMO_BRANCHES.length} demo)`);

  // ── 20-PARENT ROSTER ─────────────────────────────────────────────
  const roster = [
    { name: 'Pn. Siti Aisyah',    phone: '011-2345 6789', branch: 'Subang Jaya', studentName: 'Amirah Insyirah',  program: 'Kelas Perdana', programDur: 6,  enroll: '2025-04-01', birthday: null,         status: 'active'   },
    { name: 'En. Rizal Hamdan',   phone: '012-3456 7890', branch: 'Puchong',     studentName: 'Zayn Aqil',        program: 'Kelas Asas',    programDur: 3,  enroll: '2025-04-15', birthday: '2019-09-12', status: 'active'   },
    { name: 'Pn. Rohani Aziz',    phone: '013-4567 8901', branch: 'Shah Alam',   studentName: 'Dania Sofea',      program: 'Elite',         programDur: 12, enroll: '2025-03-01', birthday: null,         status: 'active'   },
    { name: 'En. Hafiz Noor',     phone: '011-5678 9012', branch: 'Puchong',     studentName: 'Irfan Haziq',      program: 'Kelas Perdana', programDur: 6,  enroll: '2025-02-01', birthday: '2018-07-03', status: 'active'   },
    { name: 'En. Azhar Rahman',   phone: '013-7890 1234', branch: 'Subang Jaya', studentName: 'Zafran Arif',      program: 'Kelas Perdana', programDur: 6,  enroll: '2025-01-01', birthday: null,         status: 'active'   },
    { name: 'Pn. Khadijah Ali',   phone: '011-8901 2345', branch: 'Shah Alam',   studentName: 'Nur Iman',         program: 'Elite',         programDur: 12, enroll: '2025-04-01', birthday: null,         status: 'active'   },
    { name: 'En. Fadzillah',      phone: '012-9012 3456', branch: 'KL Sentral',  studentName: 'Rayyan Hakeem',    program: 'Kelas Asas',    programDur: 3,  enroll: '2025-06-10', birthday: null,         status: 'active'   },
    { name: 'Pn. Suraya Mokhtar', phone: '013-0123 4567', branch: 'Puchong',     studentName: 'Alisha Damia',     program: 'Kelas Perdana', programDur: 6,  enroll: '2025-05-15', birthday: null,         status: 'active'   },
    { name: 'En. Shahril Amin',   phone: '011-1234 5678', branch: 'Subang Jaya', studentName: 'Mikhail Yusuf',    program: 'Elite',         programDur: 12, enroll: '2024-12-01', birthday: null,         status: 'active'   },
    { name: 'Pn. Farah Liyana',   phone: '012-6789 0123', branch: 'KL Sentral',  studentName: 'Aisyah Batrisya',  program: 'Kelas Asas',    programDur: 3,  enroll: '2025-06-03', birthday: null,         status: 'active'   },
    { name: 'Pn. Noraini Jusoh',  phone: '012-2345 6789', branch: 'Shah Alam',   studentName: 'Humaira Balqis',   program: 'Kelas Asas',    programDur: 3,  enroll: '2025-06-01', birthday: null,         status: 'active'   },
    { name: 'En. Zulkifli Nasir', phone: '013-3456 7890', branch: 'KL Sentral',  studentName: 'Harith Danial',    program: 'Kelas Perdana', programDur: 6,  enroll: '2025-03-15', birthday: null,         status: 'inactive' },
    { name: 'Pn. Aishah Mazlan',  phone: '011-9876 5432', branch: 'Subang Jaya', studentName: 'Sofia Damia',      program: 'Elite',         programDur: 12, enroll: '2025-02-01', birthday: '2017-06-22', status: 'active'   },
    { name: 'Pn. Wardah Hussin',  phone: '012-8765 4321', branch: 'Puchong',     studentName: 'Adam Izzat',       program: 'Kelas Perdana', programDur: 6,  enroll: '2025-01-15', birthday: null,         status: 'active'   },
    { name: 'En. Kamarul Hisham', phone: '013-7654 3210', branch: 'Shah Alam',   studentName: 'Firas Hakimi',     program: 'Kelas Asas',    programDur: 3,  enroll: '2025-05-01', birthday: null,         status: 'active'   },
    { name: 'Pn. Nabilah Yusof',  phone: '011-6543 2109', branch: 'KL Sentral',  studentName: 'Qistina Zahra',    program: 'Kelas Perdana', programDur: 6,  enroll: '2025-03-03', birthday: null,         status: 'active'   },
    { name: 'En. Badrul Hisham',  phone: '012-5432 1098', branch: 'Subang Jaya', studentName: 'Harith Aiman',     program: 'Elite',         programDur: 12, enroll: '2025-02-15', birthday: null,         status: 'active'   },
    { name: 'Pn. Maziah Omar',    phone: '013-4321 0987', branch: 'Puchong',     studentName: 'Delisha Aqilah',   program: 'Kelas Asas',    programDur: 3,  enroll: '2025-06-01', birthday: null,         status: 'trial'    },
    { name: 'Pn. Rahimah Said',   phone: '011-3210 9876', branch: 'Shah Alam',   studentName: 'Nur Aisyah',       program: 'Kelas Perdana', programDur: 6,  enroll: '2025-04-01', birthday: null,         status: 'active'   },
    { name: 'En. Saiful Bahri',   phone: '012-2109 8765', branch: 'KL Sentral',  studentName: 'Arif Danial',      program: 'Elite',         programDur: 12, enroll: '2025-01-15', birthday: null,         status: 'active'   },
  ];

  const planTypeMap: Record<number, string> = {
    3: '3mo',
    6: '6mo',
    12: '12mo',
  };

  const rosterParents: { id: string; name: string }[] = [];
  for (let i = 0; i < roster.length; i++) {
    const p = roster[i];
    const enrollDate = date(p.enroll);
    const created = await prisma.parent.create({
      data: {
        name: p.name,
        email: `parent${i + 1}@example.com`,
        phone: p.phone,
        branchId: branchIdByName.get(p.branch)!,
        studentName: p.studentName,
        program: p.program,
        programDur: p.programDur,
        plan_type: planTypeMap[p.programDur] ?? null,
        enrollDate,
        birthday: p.birthday ? date(p.birthday) : null,
        status: p.status,
        m1StartDate: nextMonday(enrollDate),
      },
    });
    rosterParents.push({ id: created.id, name: created.name });
  }
  console.log(`✓ Created ${rosterParents.length} roster parents`);

  // ── 3 LIVE TEST PARENTS (real email demo) ────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const testEmail = process.env.TEST_EMAIL || 'sofiadlinaalie@gmail.com';

  const testParents = [
    {
      studentName: 'Amirah Insyirah',
      branch: 'Subang Jaya',
      program: 'Kelas Perdana',
      plan_type: '12mo',
      programDur: 12,
      enrollDate: subDays(today, 56), // Day 56 → REFERRAL
    },
    {
      studentName: 'Zayn Aqil',
      branch: 'Puchong',
      program: 'Kelas Asas',
      plan_type: '12mo',
      programDur: 12,
      enrollDate: subDays(today, 42), // Day 42 → REVIEW
    },
    {
      studentName: 'Rayyan Hakeem',
      branch: 'Shah Alam',
      program: 'Kelas Asas',
      plan_type: '12mo',
      programDur: 12,
      enrollDate: subDays(today, 14), // Day 14 → FOLLOW US
    },
  ];

  for (const tp of testParents) {
    await prisma.parent.create({
      data: {
        name: 'Pn. Sofia Alina',
        email: testEmail,
        phone: '011-2345 6789',
        branchId: branchIdByName.get(tp.branch)!,
        studentName: tp.studentName,
        program: tp.program,
        programDur: tp.programDur,
        plan_type: tp.plan_type,
        enrollDate: tp.enrollDate,
        birthday: null,
        status: 'active',
        m1StartDate: nextMonday(tp.enrollDate),
      },
    });
  }
  console.log(`✓ Created 3 live test parents (email: ${testEmail})`);

  // ── CONTENT TEMPLATES (CMS) ────────────────────────────────────────
  const contentTemplates = [
    {
      triggerType: 'welcome',
      channel: 'EMAIL',
      title: 'Welcome',
      body: "Welcome to Ebright Academy, {parentName}! 🎉 We can't wait to meet {studentName} soon! Classes start shortly. See you there! — Team Ebright",
    },
    {
      triggerType: 'followus', // This is for Day 0 intake, not the same as the rule.
      channel: 'EMAIL',
      title: 'Follow us (intake)',
      body: "In the meantime, don't forget to follow us on Instagram & TikTok @ebrightacademy 📱 Daily tips to help build confident public speaking await you! ✨ — Team Ebright",
      link: 'https://www.instagram.com/ebrightacademy/',
    },
    {
      triggerType: 'followus_reminder',
      channel: 'EMAIL',
      title: 'Follow us reminder (Day 14)',
      body: 'Hi {parentName}! 👋 Have you followed @ebrightacademy yet? Don\'t miss out on helpful tips to help {studentName} build confidence in public speaking! Find us on Instagram & TikTok 📱✨',
    },
    {
      triggerType: 'review',
      channel: 'EMAIL',
      title: 'Parent review (Day 42)',
      body: "⭐ 'My child became confident speaking in front of class within a month!' — Mrs. Rohani, Shah Alam. {parentName}, many great kids started just like {studentName}. Thank you for your trust! 🙏 — Ebright Academy",
    },
    {
      triggerType: 'referral',
      channel: 'EMAIL',
      title: 'Referral (Day 56)',
      body: "It's been 3 months with Ebright! 🎉 {parentName}, {studentName} has grown so much! Invite a friend or neighbour to try our program — use code EB-REF-JUN25 for a FREE CLASS 🎁 Info: wa.me/60112345678",
      link: 'wa.me/60112345678',
    },
    {
      triggerType: 'birthday',
      channel: 'EMAIL',
      title: 'Birthday',
      body: 'Happy birthday, {studentName}! 🎂🎉 May you stay confident and keep shining! We love you, {studentName} ❤️ — Team Ebright Academy 🌟',
    },
    // Generic video template for the cron job
    {
      triggerType: 'video',
      channel: 'EMAIL',
      title: "This week's tip for {studentName}!",
      body: "🎥 This week's tip: How to Speak Confidently in Public! Watch now 👉 youtu.be/ebright-m1 — Team Ebright",
      link: 'youtu.be/ebright-m1',
    },
    // Renewal sequence templates
    {
      triggerType: 'renewal_30d_before_expiry',
      channel: 'EMAIL',
      title: 'Your Ebright plan is expiring in 30 days!',
      body: 'Hi {parentName}, your plan is expiring in 30 days. Renew now to continue {studentName}\'s amazing progress! — Team Ebright',
    },
    {
      triggerType: 'renewal_14d_before_expiry',
      channel: 'EMAIL',
      title: 'Reminder: Your Ebright plan expires in 2 weeks',
      body: 'Hi {parentName}, just a friendly reminder that your plan for {studentName} is expiring in 14 days. Don\'t miss out on our renewal offers! — Team Ebright',
    },
    {
      triggerType: 'renewal_3d_before_expiry',
      channel: 'EMAIL',
      title: 'Last chance to renew! Your plan expires in 3 days',
      body: 'Hi {parentName}, this is the final reminder! Your plan for {studentName} expires in just 3 days. Renew now to ensure uninterrupted classes. — Team Ebright',
    },
    // Festive templates — generic fallback used by any festival without its own override
    {
      triggerType: 'festive',
      channel: 'EMAIL',
      title: 'Season\'s greetings from Ebright Academy!',
      body: 'Dear {parent_first_name}, wishing you and {studentName} a joyful celebration! — Team Ebright Academy',
    },
    {
      triggerType: 'festive_hari_raya_aidilfitri',
      channel: 'EMAIL',
      title: 'Selamat Hari Raya Aidilfitri!',
      body: 'Selamat Hari Raya Aidilfitri, {parent_first_name}! 🌙✨ Wishing you, {studentName}, and your family a joyous celebration filled with love and togetherness. Maaf zahir dan batin. — Team Ebright Academy',
    },
    {
      triggerType: 'festive_hari_raya_aidilfitri_pre',
      channel: 'EMAIL',
      title: 'Hari Raya Aidilfitri is coming up!',
      body: 'Hi {parent_first_name}, Hari Raya Aidilfitri is just around the corner! We wish you and {studentName} a wonderful celebration ahead. — Team Ebright Academy',
    },
    {
      triggerType: 'festive_hari_raya_aidiladha',
      channel: 'EMAIL',
      title: 'Selamat Hari Raya Aidiladha!',
      body: 'Selamat Hari Raya Aidiladha, {parent_first_name}! 🐑 Wishing you, {studentName}, and your family a blessed celebration. — Team Ebright Academy',
    },
    {
      triggerType: 'festive_chinese_new_year',
      channel: 'EMAIL',
      title: 'Gong Xi Fa Cai!',
      body: 'Gong Xi Fa Cai, {parent_first_name}! 🧧🎉 Wishing you, {studentName}, and your family a prosperous and joyful Chinese New Year. — Team Ebright Academy',
    },
    {
      triggerType: 'festive_deepavali',
      channel: 'EMAIL',
      title: 'Happy Deepavali!',
      body: 'Happy Deepavali, {parent_first_name}! 🪔 Wishing you, {studentName}, and your family a festival full of light and joy. — Team Ebright Academy',
    },
    {
      triggerType: 'festive_christmas',
      channel: 'EMAIL',
      title: 'Merry Christmas!',
      body: 'Merry Christmas, {parent_first_name}! 🎄 Wishing you, {studentName}, and your family a wonderful holiday season. — Team Ebright Academy',
    },
  ];

  for (const tpl of contentTemplates) {
    await prisma.content.create({ data: tpl });
  }
  console.log(`✓ Created ${contentTemplates.length} content templates`);

  // ── PAST SEND LOGS for Pn. Siti Aisyah ───────────────────────────
  const siti = rosterParents[0];

  // Explicit type ensures all optional fields are recognised without `as any`
  const sitiLogs: SitiLog[] = [
    { contentType: 'welcome',           status: 'SENT',    sentAt: date('2025-04-01'), reason: 'New enrollment', triggeredBy: 'intake' },
    { contentType: 'followus',          status: 'SENT',    sentAt: date('2025-04-01'), reason: 'New enrollment', triggeredBy: 'intake' },
    { contentType: 'video',             status: 'SENT',    sentAt: date('2025-04-07'), monthNumber: 1, weekNumber: 1, triggeredBy: 'cron' },
    { contentType: 'video',             status: 'SENT',    sentAt: date('2025-04-14'), monthNumber: 1, weekNumber: 2, triggeredBy: 'cron' },
    { contentType: 'followus_reminder', status: 'SENT',    sentAt: date('2025-04-15'), reason: 'Day 14',         triggeredBy: 'cron' },
    { contentType: 'video',             status: 'SENT',    sentAt: date('2025-04-21'), monthNumber: 1, weekNumber: 3, triggeredBy: 'cron' },
    { contentType: 'video',             status: 'SENT',    sentAt: date('2025-04-28'), monthNumber: 1, weekNumber: 4, triggeredBy: 'cron' },
    { contentType: 'video',             status: 'SENT',    sentAt: date('2025-05-05'), monthNumber: 2, weekNumber: 1, triggeredBy: 'cron' },
    { contentType: 'video',             status: 'SENT',    sentAt: date('2025-05-12'), monthNumber: 2, weekNumber: 2, triggeredBy: 'cron' },
    { contentType: 'review',            status: 'SENT',    sentAt: date('2025-05-13'), reason: 'Day 42',         triggeredBy: 'cron' },
    { contentType: 'video',             status: 'SENT',    sentAt: date('2025-05-19'), monthNumber: 2, weekNumber: 3, triggeredBy: 'cron' },
    { contentType: 'video',             status: 'SENT',    sentAt: date('2025-05-26'), monthNumber: 2, weekNumber: 4, triggeredBy: 'cron' },
    { contentType: 'referral',          status: 'SENT',    sentAt: date('2025-05-27'), reason: 'Day 56',         triggeredBy: 'cron' },
    { contentType: 'video',             status: 'SENT',    sentAt: date('2025-06-02'), monthNumber: 3, weekNumber: 1, triggeredBy: 'cron' },
    { contentType: 'video',             status: 'SENT',    sentAt: date('2025-06-09'), monthNumber: 3, weekNumber: 2, triggeredBy: 'cron' },
    { contentType: 'birthday',          status: 'SKIPPED', sentAt: new Date(),         reason: 'Birthday not set — pending', triggeredBy: 'cron' },
  ];

  for (const log of sitiLogs) {
    await prisma.sendLog.create({
      data: {
        parentId: siti.id,
        contentType: log.contentType,
        monthNumber: log.monthNumber ?? null,
        weekNumber: log.weekNumber ?? null,
        status: log.status,
        message: `[seeded] ${log.contentType} for ${siti.name}`,
        sentAt: log.sentAt,
        triggeredBy: log.triggeredBy,
        reason: log.reason ?? null,
      },
    });
  }
  console.log(`✓ Created ${sitiLogs.length} past SendLogs for Pn. Siti Aisyah`);

  // ── AUTOMATION RULES ─────────────────────────────────────────────
  const rules = [
    { name: 'welcome', description: 'Welcome message on Day 0' },
    { name: 'followus_reminder', description: 'Follow-us reminder' },
    { name: 'review', description: 'Request for parent review' },
    { name: 'referral', description: 'Referral program promotion' },
    { name: 'renewal', description: 'Plan renewal/expiry reminder' },
    { name: 'video', description: 'Weekly video tip' },
    { name: 'birthday', description: 'Student birthday' },
  ];
  for (const rule of rules) {
    await prisma.automationRule.create({ data: rule });
  }
  console.log(`✓ Created ${rules.length} automation rules`);

  const triggers = [
    // 3-month plan
    { ruleName: 'welcome', planType: '3mo', triggerDay: 0, relativeTo: 'start' },
    { ruleName: 'followus_reminder', planType: '3mo', triggerDay: 7, relativeTo: 'start' },
    { ruleName: 'review', planType: '3mo', triggerDay: 20, relativeTo: 'start' },
    { ruleName: 'renewal', planType: '3mo', triggerDay: 15, relativeTo: 'end' },

    // 12-month plan
    { ruleName: 'welcome', planType: '12mo', triggerDay: 0, relativeTo: 'start' },
    { ruleName: 'followus_reminder', planType: '12mo', triggerDay: 14, relativeTo: 'start' },
    { ruleName: 'review', planType: '12mo', triggerDay: 42, relativeTo: 'start' },
    { ruleName: 'referral', planType: '12mo', triggerDay: 56, relativeTo: 'start' },
    { ruleName: 'renewal', planType: '12mo', triggerDay: 30, relativeTo: 'end' },
    { ruleName: 'renewal', planType: '12mo', triggerDay: 14, relativeTo: 'end' },
    { ruleName: 'renewal', planType: '12mo', triggerDay: 3, relativeTo: 'end' },
  ];
  for (const t of triggers) {
    const rule = await prisma.automationRule.findUnique({ where: { name: t.ruleName } });
    if (rule) {
      await prisma.automationRuleTrigger.create({
        data: { ruleId: rule.id, planType: t.planType, triggerDay: t.triggerDay, triggerRelativeTo: t.relativeTo },
      });
    }
  }
  console.log(`✓ Created ${triggers.length} automation triggers`);

  // ── CALENDAR EVENTS ──────────────────────────────────────────────
  const events = [
    { type: 'celebration', title: 'Mid-Year Celebration Dinner',     date: date('2025-06-21'), branch: null,                description: 'All-branch celebration evening.' },
    { type: 'showcase',    title: 'Mid-Year Showcase 2025',           date: date('2025-06-21'), branch: 'Dewan Sri Petaling', description: 'Main showcase venue.' },
    { type: 'showcase',    title: 'Puchong Branch Showcase',          date: date('2025-07-19'), branch: 'Puchong',           description: 'Branch-only showcase.' },
    { type: 'showcase',    title: 'Year-End Grand Showcase',          date: date('2025-12-06'), branch: 'TBA',               description: 'Year-end grand showcase.' },
    { type: 'adhoc',       title: 'Hari Raya Aidiladha — no class',   date: date('2025-06-26'), branch: null,                description: 'Public holiday.' },
    { type: 'adhoc',       title: 'New Kelas Perdana launch',         date: date('2025-07-01'), branch: null,                description: 'New cohort opens.' },
    { type: 'adhoc',       title: 'School holiday — class reschedule',date: date('2025-08-22'), branch: null,                description: 'Refer to branch admin.' },
    { type: 'celebration', title: "Amirah Insyirah's 5th birthday",   date: date('2025-06-15'), branch: 'Subang Jaya',       description: 'Student birthday.' },
    { type: 'celebration', title: "Zayn Aqil's 7th birthday",         date: date('2025-09-12'), branch: 'Puchong',           description: 'Student birthday.' },
    { type: 'adhoc',       title: 'New branch — Petaling Jaya',       date: date('2025-08-01'), branch: 'Petaling Jaya',     description: 'Grand opening.' },
  ];

  for (const e of events) {
    await prisma.calendarEvent.create({ data: e });
  }
  console.log(`✓ Created ${events.length} calendar events`);

  // ── FESTIVE EVENTS ───────────────────────────────────────────────
  // Dates below are best-effort estimates for 2026 (Hijri/lunar dates are only
  // confirmed close to the date by Malaysia's official gazette/moon-sighting
  // announcement) — an admin MUST verify and correct these via the Rules page
  // before relying on them. Christmas is the only fixed date.
  const festiveEvents = [
    { name: 'Hari Raya Aidilfitri', date: date('2026-03-20'), endDate: null,               sendOnDay: true, sendPreDays: 3, branch: null },
    { name: 'Hari Raya Aidiladha',  date: date('2026-05-27'), endDate: null,               sendOnDay: true, sendPreDays: null, branch: null },
    { name: 'Chinese New Year',     date: date('2026-02-17'), endDate: date('2026-02-18'), sendOnDay: true, sendPreDays: null, branch: null },
    { name: 'Deepavali',            date: date('2026-11-08'), endDate: null,               sendOnDay: true, sendPreDays: null, branch: null },
    { name: 'Christmas',            date: date('2026-12-25'), endDate: null,               sendOnDay: true, sendPreDays: null, branch: null },
  ];
  for (const evt of festiveEvents) {
    await prisma.festiveEvent.create({
      data: {
        name: evt.name,
        slug: evt.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''),
        date: evt.date,
        endDate: evt.endDate,
        sendOnDay: evt.sendOnDay,
        sendPreDays: evt.sendPreDays,
        branch: evt.branch,
      },
    });
  }
  console.log(`✓ Created ${festiveEvents.length} festive events (verify 2026 Hijri/lunar dates before go-live!)`);

  // ── SEED NOTIFICATIONS (a few unread to show in the bell on first load) ──
  const recentLogs = await prisma.sendLog.findMany({
    where: { parentId: siti.id, status: 'SENT' },
    orderBy: { sentAt: 'desc' },
    take: 3,
  });
  for (const log of recentLogs) {
    await prisma.ebrightCepNotification.create({
      data: {
        type: 'sms_sent',
        title: `${log.contentType} sent`,
        message: `Sent to ${siti.name}`,
        parentId: siti.id,
        createdAt: log.sentAt ?? undefined,
        read: false,
      },
    });
  }

  console.log('\n✅ Seed complete!');
  console.log(`   • ${rosterParents.length + 3} parents (20 roster + 3 live test)`);
  console.log(`   • ${contentTemplates.length} content templates`);
  console.log(`   • ${events.length} calendar events`);
  console.log(`   • ${sitiLogs.length} past send logs`);
  console.log('\n   Click "Run cron now" in /automation to fire 3 real emails to:');
  console.log(`   📧 ${testEmail}`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });