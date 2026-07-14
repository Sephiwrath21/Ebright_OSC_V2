/**
 * One-time (re-runnable) import of the 48-week department content calendar from
 * prisma/data/weekly-content.csv ("Ebright Email Marketing Templates" export) into
 * the Content library.
 *
 * IMPORTANT: the spreadsheet is content DIRECTION, not final copy. Each cell's raw
 * text is a rough idea/note (often just a fragment or internal instruction) — see
 * REWRITE_MAP below, which holds the actual rewritten subject + email body for each
 * (week, department) cell, polished into real copy matching the tone of the existing
 * templates in prisma/seed.ts / lib/email-templates.ts. A handful of cells were pure
 * internal production notes with no concrete message to rewrite (e.g. "need to
 * create [video]") — those are marked NEEDS_HUMAN_INPUT and imported with a visible
 * placeholder body rather than invented copy; see the console report for the full list.
 *
 * - One Content row per non-empty (week, department) cell.
 * - Bracket placeholders ([video], [Facebook link], etc) are carried through the
 *   rewrite as real {tokens} — see BRACKET_TOKEN_MAP for the canonical list. A few
 *   additional tokens ({aoneLink}, {websiteLink}, {whatsappChannelLink}) were
 *   introduced during the rewrite for recurring OPS/MKT link mentions that weren't
 *   bracketed in the source but clearly refer to a real, reusable link — flagged in
 *   the console report as new tokens, same "not auto-filled at send time" caveat as
 *   the originally-documented ones.
 * - When multiple departments have content for the same week, only the
 *   highest-priority one (lib/departments.ts DEPARTMENTS order) is isActive; the
 *   rest are imported inactive/reference-only.
 * - The "Pre-class" row is imported under triggerType 'welcome' instead of a week
 *   number — it's a one-time pre-enrollment message, not part of the 1-48 cadence.
 * - Every row renders through the ONE shared wrapEmailShell design (lib/email-shell.ts)
 *   — there is no per-department visual styling. `department` is purely an internal
 *   Content-library tag (shown only in the admin UI badge); it is never passed into
 *   the email shell/subject/body, so it stays fully invisible to the parent. This is
 *   a deliberate testing-phase decision — per-department visual design is a planned
 *   future phase, not built here.
 *
 * Idempotent: re-running clears out any previously-imported rows (weekNumber not
 * null, or triggerType 'welcome' with a department set) and re-creates them, so
 * editing REWRITE_MAP/the CSV and re-running never duplicates.
 *
 * Run with: npx tsx prisma/importWeeklyContent.ts
 */
import { readFileSync } from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { departmentPriority, type Department } from '../lib/departments';

const prisma = new PrismaClient();

const CSV_PATH = path.join(__dirname, 'data', 'weekly-content.csv');

// CSV header order (column index -> Department | null for the week-number column).
const COLUMN_DEPARTMENTS: Array<Department | null> = [
  null, // Credit / Week
  'CEO',
  'ACD',
  'MKT',
  'MKT_REFERRAL',
  'HR',
  'FNC',
  'OD',
  'OPS',
  'AD_HOC',
];

// Documented from the original mechanical import (kept here only as a reference of
// which brackets appear in the raw source — REWRITE_MAP below is what actually
// determines the shipped copy now).
const BRACKET_TOKEN_MAP: Record<string, string> = {
  '[video]': '{videoLink}',
  '[facebook link]': '{facebookLink}',
  '[instagram link]': '{instagramLink}',
  '[tiktok link]': '{tiktokLink}',
  '[threads link]': '{threadsLink}',
};
void BRACKET_TOKEN_MAP;

const SIGNOFF = '— Team Ebright Academy';

interface Rewrite {
  subject: string;
  body: string;
  /** Set only for cells that were internal production notes, not a real parent-facing
   * message — the body is a visible placeholder, not invented copy. */
  needsHumanInput?: true;
}

/** Key: `${weekNumber ?? 'pre'}/${department}`. One entry per (week, department) cell
 * in the source spreadsheet — see the report this script prints for a week-by-week
 * cross-reference back to the original raw text. */
const REWRITE_MAP: Record<string, Rewrite> = {
  // ---------------------------------------------------------------------- Pre-class
  'pre/CEO': {
    subject: 'Welcome to Ebright Academy, {studentName}! 🎉',
    body: `Hi {parent_first_name}! 👋

Thank you for choosing Ebright for {studentName}'s growth and learning journey — we're truly honoured by your trust and support.

Our team is dedicated to bringing out the best in every child, and we can't wait to see {studentName} thrive in our classes. I've prepared a short welcome video just for you — take a moment to watch it here: {videoLink}

Welcome to Ebright!

${SIGNOFF}`,
  },
  'pre/MKT': {
    subject: '[NEEDS COPY] Pre-class — CEO welcome video (MKT production note)',
    needsHumanInput: true,
    body: `⚠️ NEEDS HUMAN INPUT — this spreadsheet cell was a production task note for MKT ("welcome video by CEO — need to create"), not send-ready parent copy. No rewrite was invented. Original note preserved below:

Welcome video by CEO
(Need to create)`,
  },
  'pre/OD': {
    subject: 'Explore Ebright Academy online 🌐',
    body: `Hi {parent_first_name}! 👋

While you're getting ready for {studentName}'s first class, here's our website for a full overview of our programmes, branches, and what to expect: {websiteLink}

We're excited to have {studentName} with us!

${SIGNOFF}`,
  },
  'pre/OPS': {
    subject: "Your trial with Ebright is confirmed ✅",
    body: `Hi {parent_first_name}! 👋

Just a quick note to confirm {studentName}'s trial class and trial payment have both gone through smoothly.

We'd love to hear how the trial went — feel free to share any feedback about {studentName}'s experience so far!

${SIGNOFF}`,
  },

  // --------------------------------------------------------------------------- W1
  '1/ACD': {
    subject: "Welcome to Ebright, {studentName}! Here's what's next 📚",
    body: `Hi {parent_first_name}! 👋

Welcome to Ebright! {studentName} has now received their workbook for the term.

Quick check-in: has {studentName} received today's class video yet? Let us know if not!

${SIGNOFF}`,
  },
  '1/MKT': {
    subject: 'Stay connected with Ebright Academy 📱',
    body: `Hi {parent_first_name}! 👋

Welcome to the Ebright family! Follow us across our social channels for daily tips and updates:

{facebookLink} {instagramLink} {tiktokLink} {threadsLink}

For quick updates, join our WhatsApp Channel too: {whatsappChannelLink}

${SIGNOFF}`,
  },
  '1/FNC': {
    subject: "Payment received — you're all set! ✅",
    body: `Hi {parent_first_name}! 👋

Thank you for your enrollment! This confirms your payment for {studentName} has been received successfully.

${SIGNOFF}`,
  },
  '1/OPS': {
    subject: 'Welcome aboard, {studentName}! 🎉',
    body: `Hi {parent_first_name}! 👋

Welcome to Ebright! Here's your Aone parent portal link: {aoneLink}

{studentName}'s attendance for today's class has been marked.

${SIGNOFF}`,
  },
  '1/AD_HOC': {
    subject: 'Career opportunities at Ebright — for university parents 🎓',
    body: `Hi {parent_first_name}! 👋

If you have a university-aged child, we wanted to let you know Ebright will be hosting an upcoming career fair — a great opportunity to explore opportunities with our team.

Reach out to your branch if you'd like more details!

${SIGNOFF}`,
  },

  // --------------------------------------------------------------------------- W2
  '2/ACD': { subject: "Quick check-in on today's class video 🎥", body: videoCheckIn() },
  '2/FNC': {
    subject: 'Managing your Ebright payments made easy 💳',
    body: `Hi {parent_first_name}! 👋

Here's a quick guide to your parent portal — you can view invoices and make payments anytime, right from your account.

${SIGNOFF}`,
  },
  '2/OPS': { subject: "{studentName}'s attendance update ✅", body: aoneAttendance() },
  '2/AD_HOC': {
    subject: '[NEEDS COPY] Week 2 — AD HOC birthday/voucher idea',
    needsHumanInput: true,
    body: `⚠️ NEEDS HUMAN INPUT — this was a feature suggestion ("send a birthday message to parents, optionally with a birthday voucher promo"), not a specific message tied to a real parent/date. A generic student BIRTHDAY trigger already exists in Content; if a separate PARENT-birthday touchpoint with a voucher is wanted, it needs concrete voucher terms before it can be written. Original note preserved below:

1) birthday message to parents.
2) can give voucer as bday promo.`,
  },

  // --------------------------------------------------------------------------- W3
  '3/CEO': {
    subject: 'Happy Week 3, {studentName}! Let\'s stay connected 🎉',
    body: `Hi {parent_first_name}! 👋

Happy Week 3! I hope {studentName} is enjoying our classes and making wonderful progress.

To keep you updated with our latest learning tips, exciting student updates, and important announcements, I'd love to invite you to follow our official social media channels:

{facebookLink} {instagramLink} {tiktokLink} {threadsLink}

${SIGNOFF}`,
  },
  '3/ACD': { subject: "Quick check-in on today's class video 🎥", body: videoCheckIn() },
  '3/MKT': {
    subject: "We'd love your feedback — and a small thank-you 🎁",
    body: `Hi {parent_first_name}! 👋

What are your thoughts on our classes and branches so far? We'd really appreciate a rating on Google Review — it helps other families discover Ebright too.

As a thank-you, there are gifts you can claim at the branch!

${SIGNOFF}`,
  },
  '3/FNC': {
    subject: 'Friendly reminder: your installment is due soon 💳',
    body: `Hi {parent_first_name}! 👋

Just a gentle reminder that your next installment payment (if applicable) is coming up. Reach out to your branch if you have any questions.

${SIGNOFF}`,
  },
  '3/OPS': {
    subject: "{studentName}'s starter kit has arrived! 🎒",
    body: `Hi {parent_first_name}! 👋

{studentName}'s starter kit has been sent out — keep an eye out for it!

Here's your Aone parent portal link: {aoneLink}

{studentName}'s attendance for today's class has been marked.

${SIGNOFF}`,
  },
  '3/AD_HOC': {
    subject: '[NEEDS COPY] Week 3 — AD HOC Ops event-notification policy',
    needsHumanInput: true,
    body: `⚠️ NEEDS HUMAN INPUT — this was a general OPS policy note ("every event should trigger an FYI email, including new branch openings"), not content tied to a specific Week 3 event. Write a real email only once there's an actual event to announce. Original note preserved below:

Ops

1) Every event they get an email as fyi even including new branch opening.`,
  },

  // --------------------------------------------------------------------------- W4
  '4/ACD': { subject: "Quick check-in on today's class video 🎥", body: videoCheckIn() },
  '4/HR': {
    subject: "How's {studentName}'s coach doing? We'd love to know 💬",
    body: coachFeedback(),
  },
  '4/FNC': {
    subject: 'Thank you for your prompt payment! 🙏',
    body: `Hi {parent_first_name}! 👋

Thank you for your prompt payment — we really appreciate it!

${SIGNOFF}`,
  },
  '4/OPS': { subject: "{studentName}'s attendance update ✅", body: aoneAttendance() },
  '4/AD_HOC': {
    subject: '[NEEDS COPY] Week 4 — AD HOC Ops celebration-notification policy',
    needsHumanInput: true,
    body: `⚠️ NEEDS HUMAN INPUT — general OPS policy note ("every celebration gets an email"), not tied to a specific Week 4 celebration. Original note preserved below:

Ops
1) Every celebration they get an email`,
  },

  // --------------------------------------------------------------------------- W5
  '5/CEO': { subject: 'Share the Ebright experience — get rewarded! 🎁', body: referral() },
  '5/ACD': { subject: "Quick check-in on today's class video 🎥", body: videoCheckIn() },
  '5/HR': { subject: 'Know someone looking for a job? Ebright is hiring! 💼', body: hrPositionOpening() },
  '5/OPS': {
    subject: "{studentName}'s attendance + enrolment gift update 🎁",
    body: `Hi {parent_first_name}! 👋

Here's your Aone parent portal link: {aoneLink}

{studentName}'s attendance for today's class has been marked, and your enrolment gift (if any) has been received.

${SIGNOFF}`,
  },
  '5/AD_HOC': {
    subject: '[NEEDS COPY] Week 5 — AD HOC MKT showcase-announcement task',
    needsHumanInput: true,
    body: `⚠️ NEEDS HUMAN INPUT — this was a production task note for MKT to prepare a showcase announcement (poster + caption). The actual showcase announcement copy already exists as its own CEO template (see Weeks 9/21/33/45) — this cell doesn't add distinct content beyond that. Original note preserved below:

MKT:
1) Give announcement for showcase (poster and caption like on social media)`,
  },

  // --------------------------------------------------------------------------- W6
  '6/CEO': {
    subject: "Halfway there — how's {studentName}'s journey going? ⭐",
    body: `Hi {parent_first_name}! 👋

We're already halfway through the term! Watching our students grow and build their confidence over the past few weeks has been incredibly rewarding.

Your feedback means a great deal to us and helps us continue improving our learning experience for every student and family.

If you have a few minutes, we'd truly appreciate it if you could share your experience by leaving us a review — it also helps other families learn more about Ebright.

${SIGNOFF}`,
  },
  '6/ACD': { subject: "Quick check-in on today's class video 🎥", body: videoCheckIn() },
  '6/HR': { subject: 'Ebright internship openings — spread the word! 🎓', body: internshipIntake() },
  '6/OPS': { subject: "{studentName}'s attendance update ✅", body: aoneAttendance() },
  '6/AD_HOC': {
    subject: '[NEEDS COPY] Week 6 — AD HOC MKT student-ambassador birthday template',
    needsHumanInput: true,
    body: `⚠️ NEEDS HUMAN INPUT — production task note for MKT to build a birthday template for student ambassadors; no specific ambassador or date given to write real copy against. Original note preserved below:

MKT:
1) Put template to wish student ambassadors' birthday`,
  },

  // --------------------------------------------------------------------------- W7
  '7/ACD': { subject: "Quick check-in on today's class video 🎥", body: videoCheckIn() },
  '7/OPS': { subject: "{studentName}'s attendance update ✅", body: aoneAttendance() },

  // --------------------------------------------------------------------------- W8
  '8/ACD': { subject: "{studentName}'s Parent Coach Meetup is coming up! 📅", body: pcmTwoWeeks() },
  '8/FNC': {
    subject: 'A heads-up about your upcoming renewal 📋',
    body: `Hi {parent_first_name}! 👋

Just a friendly heads-up — your current package with us is ending soon. We'll be in touch shortly about continuing {studentName}'s journey with Ebright.

${SIGNOFF}`,
  },
  '8/OPS': { subject: "{studentName}'s attendance update ✅", body: aoneAttendance() },

  // --------------------------------------------------------------------------- W9
  '9/CEO': { subject: 'Our Monthly Showcase is coming — join us! 🎭', body: showcaseAnnouncement() },
  '9/ACD': { subject: "{studentName}'s Parent Coach Meetup is next week! 📅", body: pcmOneWeek() },
  '9/OPS': { subject: "{studentName}'s attendance update ✅", body: aoneAttendance() },

  // -------------------------------------------------------------------------- W10
  '10/CEO': { subject: 'Share the Ebright experience — get rewarded! 🎁', body: referral() },
  '10/ACD': { subject: "{studentName}'s PCM video + Full Assessment invite 🎥", body: pcmVideoFaWorkbook() },
  '10/OPS': {
    subject: "{studentName}'s attendance + term update 📋",
    body: `Hi {parent_first_name}! 👋

Here's your Aone parent portal link: {aoneLink}

{studentName}'s attendance has been marked — just a reminder that there are 2 more classes left before this term ends.

${SIGNOFF}`,
  },

  // -------------------------------------------------------------------------- W11
  '11/ACD': { subject: "{studentName}'s Full Assessment is coming up! 📝", body: faReminderFeedback() },
  '11/HR': { subject: 'Know someone looking for a job? Ebright is hiring! 💼', body: hrPositionOpening() },
  '11/OPS': {
    subject: "{studentName}'s attendance + FA practice reminder 📋",
    body: `Hi {parent_first_name}! 👋

Here's your Aone parent portal link: {aoneLink}

{studentName}'s attendance has been marked. Don't forget to fit in some practice ahead of the upcoming Full Assessment (FA)!

${SIGNOFF}`,
  },

  // -------------------------------------------------------------------------- W12
  '12/ACD': { subject: 'Congratulations, {studentName} — FA complete! 🏅', body: faCompletion() },
  '12/MKT': { subject: 'Share your Ebright story — and claim a free gift! 🎁', body: testimonialAsk() },
  '12/HR': { subject: 'Ebright internship openings — spread the word! 🎓', body: internshipIntake() },
  '12/FNC': {
    subject: 'Thank you for being part of the Ebright family 🙏',
    body: `Hi {parent_first_name}! 👋

Thank you for being part of Ebright — we're so grateful to have {studentName} with us!

${SIGNOFF}`,
  },
  '12/OD': {
    subject: 'Help us improve — share your feedback 💬',
    body: `Hi {parent_first_name}! 👋

We'd love your feedback on our website and app — let us know what you think!

${SIGNOFF}`,
  },
  '12/OPS': {
    subject: "{studentName}'s FA completion + event feedback 🏅",
    body: `Hi {parent_first_name}! 👋

Congratulations to {studentName} on completing the Full Assessment (FA)! Here's a checklist confirming all items received.

We'd also love your feedback on the event itself.

${SIGNOFF}`,
  },

  // -------------------------------------------------------------------------- W13
  '13/ACD': { subject: '{studentName} is moving up a grade! 📘', body: newGradeWorkbook() },
  '13/OPS': {
    subject: 'Welcome to Term 2, {studentName}! 🎉',
    body: `Hi {parent_first_name}! 👋

We've received {studentName}'s Full Assessment (FA) report — welcome to the second term! This is a journey that repeats every grade.

${SIGNOFF}`,
  },

  // ------------------------------------------------------------------- W14-19 (ACD only)
  '14/ACD': { subject: "Quick check-in on today's class video 🎥", body: videoCheckIn() },
  '15/ACD': { subject: "Quick check-in on today's class video 🎥", body: videoCheckIn() },
  '16/ACD': { subject: "Quick check-in on today's class video 🎥", body: videoCheckIn() },
  '17/CEO': { subject: 'Share the Ebright experience — get rewarded! 🎁', body: referral() },
  '17/ACD': { subject: "Quick check-in on today's class video 🎥", body: videoCheckIn() },
  '18/ACD': { subject: "Quick check-in on today's class video 🎥", body: videoCheckIn() },
  '19/ACD': { subject: "Quick check-in on today's class video 🎥", body: videoCheckIn() },

  // --------------------------------------------------------------------------- W20
  '20/ACD': { subject: "{studentName}'s Parent Coach Meetup is coming up! 📅", body: pcmTwoWeeks() },
  '20/HR': { subject: "How's {studentName}'s coach doing? We'd love to know 💬", body: coachFeedback() },

  // --------------------------------------------------------------------------- W21
  '21/CEO': { subject: 'Our Monthly Showcase is coming — join us! 🎭', body: showcaseAnnouncement() },
  '21/ACD': { subject: "{studentName}'s Parent Coach Meetup + renewal gift 🎁", body: pcmRenewalGift() },

  // --------------------------------------------------------------------------- W22
  '22/CEO': { subject: 'Share the Ebright experience — get rewarded! 🎁', body: referral() },
  '22/ACD': { subject: "{studentName}'s PCM video + Full Assessment invite 🎥", body: pcmVideoFaWorkbook() },

  // --------------------------------------------------------------------------- W23
  '23/ACD': { subject: "{studentName}'s Full Assessment is coming up! 📝", body: faReminderFeedback() },

  // --------------------------------------------------------------------------- W24
  '24/ACD': { subject: 'Congratulations, {studentName} — FA complete! 🏅', body: faCompletion() },
  '24/MKT': { subject: 'Share your Ebright story — and claim a free gift! 🎁', body: testimonialAsk() },
  '24/OD': { subject: "We'd love your feedback — any way you like! 💬", body: siteFeedbackVerbal() },

  // ------------------------------------------------------------------- W25-28 (ACD only)
  '25/ACD': { subject: '{studentName} is moving up a grade! 📘', body: newGradeWorkbook() },
  '26/ACD': { subject: "Quick check-in on today's class video 🎥", body: videoCheckIn() },
  '27/ACD': { subject: "Quick check-in on today's class video 🎥", body: videoCheckIn() },
  '28/ACD': { subject: "Quick check-in on today's class video 🎥", body: videoCheckIn() },

  // --------------------------------------------------------------------------- W29
  '29/CEO': { subject: 'Share the Ebright experience — get rewarded! 🎁', body: referral() },
  '29/ACD': { subject: "Quick check-in on today's class video 🎥", body: videoCheckIn() },

  // ------------------------------------------------------------------- W30-32 (ACD only, except 32 PCM)
  '30/ACD': { subject: "Quick check-in on today's class video 🎥", body: videoCheckIn() },
  '31/ACD': { subject: "Quick check-in on today's class video 🎥", body: videoCheckIn() },
  '32/ACD': { subject: "{studentName}'s Parent Coach Meetup is coming up! 📅", body: pcmTwoWeeks() },

  // --------------------------------------------------------------------------- W33
  '33/CEO': { subject: 'Our Monthly Showcase is coming — join us! 🎭', body: showcaseAnnouncement() },
  '33/ACD': { subject: "{studentName}'s Parent Coach Meetup is next week! 📅", body: pcmOneWeek() },

  // --------------------------------------------------------------------------- W34
  '34/CEO': { subject: 'Share the Ebright experience — get rewarded! 🎁', body: referral() },
  '34/ACD': { subject: "{studentName}'s PCM video + Full Assessment invite 🎥", body: pcmVideoFaWorkbook() },

  // --------------------------------------------------------------------------- W35
  '35/ACD': { subject: "{studentName}'s Full Assessment is coming up! 📝", body: faReminderFeedback() },

  // --------------------------------------------------------------------------- W36
  '36/ACD': { subject: 'Congratulations, {studentName} — FA complete! 🏅', body: faCompletion() },
  '36/MKT': { subject: 'Share your Ebright story — and claim a free gift! 🎁', body: testimonialAsk() },
  '36/OD': { subject: "We'd love your feedback — any way you like! 💬", body: siteFeedbackVerbal() },

  // ------------------------------------------------------------------- W37-40 (ACD only)
  '37/ACD': { subject: '{studentName} is moving up a grade! 📘', body: newGradeWorkbook() },
  '38/ACD': { subject: "Quick check-in on today's class video 🎥", body: videoCheckIn() },
  '39/ACD': { subject: "Quick check-in on today's class video 🎥", body: videoCheckIn() },
  '40/ACD': { subject: "Quick check-in on today's class video 🎥", body: videoCheckIn() },

  // --------------------------------------------------------------------------- W41
  '41/CEO': { subject: 'Share the Ebright experience — get rewarded! 🎁', body: referral() },
  '41/ACD': { subject: "Quick check-in on today's class video 🎥", body: videoCheckIn() },

  // ------------------------------------------------------------------- W42-44 (ACD only, except 44 PCM)
  '42/ACD': { subject: "Quick check-in on today's class video 🎥", body: videoCheckIn() },
  '43/ACD': { subject: "Quick check-in on today's class video 🎥", body: videoCheckIn() },
  '44/ACD': { subject: "{studentName}'s Parent Coach Meetup is coming up! 📅", body: pcmTwoWeeks() },

  // --------------------------------------------------------------------------- W45
  '45/CEO': { subject: 'Our Monthly Showcase is coming — join us! 🎭', body: showcaseAnnouncement() },
  '45/ACD': { subject: "{studentName}'s Parent Coach Meetup + renewal gift 🎁", body: pcmRenewalGift() },

  // --------------------------------------------------------------------------- W46
  '46/CEO': { subject: 'Share the Ebright experience — get rewarded! 🎁', body: referral() },
  '46/ACD': { subject: "{studentName}'s PCM video + Full Assessment invite 🎥", body: pcmVideoFaWorkbook() },

  // --------------------------------------------------------------------------- W47
  '47/ACD': { subject: "{studentName}'s Full Assessment is coming up! 📝", body: faReminderFeedback() },

  // --------------------------------------------------------------------------- W48
  '48/ACD': { subject: 'Congratulations, {studentName} — FA complete! 🏅', body: faCompletion() },
  '48/MKT': { subject: 'Share your Ebright story — and claim a free gift! 🎁', body: testimonialAsk() },
  '48/OD': { subject: "We'd love your feedback — any way you like! 💬", body: siteFeedbackVerbal() },
};

// ---------------------------------------------------------------------------
// Reusable copy blocks — the source spreadsheet repeats the same idea verbatim
// across many weeks (e.g. the ACD "video check-in" appears 22 times); writing
// one rewritten variant per distinct idea and reusing it keeps the 107 templates
// consistent instead of introducing 107 independently-drifting versions of the
// same message.
// ---------------------------------------------------------------------------
function videoCheckIn(): string {
  return `Hi {parent_first_name}! 👋

Just checking in — has {studentName} received today's class video yet? Let us know if it hasn't come through!

${SIGNOFF}`;
}

function aoneAttendance(): string {
  return `Hi {parent_first_name}! 👋

Here's your Aone parent portal link: {aoneLink}

{studentName}'s attendance for today's class has been marked.

${SIGNOFF}`;
}

function coachFeedback(): string {
  return `Hi {parent_first_name}! 👋

We're always working to improve our teaching quality. If you have a moment, we'd love your feedback on {studentName}'s coach and classes so far.

${SIGNOFF}`;
}

function referral(): string {
  return `Hi {parent_first_name}! 👋

If you love the transformation and joy you see in {studentName} at Ebright, why not share it with friends and family?

When you refer a friend or relative to Ebright and they successfully enroll, both YOU and YOUR FRIEND will receive a special appreciation reward!

${SIGNOFF}`;
}

function hrPositionOpening(): string {
  return `Hi {parent_first_name}! 👋

Ebright currently has an open position on our team — if you or someone you know might be a great fit, we'd love to hear from you.

Reach out to your branch for more details!

${SIGNOFF}`;
}

function internshipIntake(): string {
  return `Hi {parent_first_name}! 👋

We've opened our internship intake! If you know a student looking for hands-on experience, send them our way.

${SIGNOFF}`;
}

function pcmTwoWeeks(): string {
  return `Hi {parent_first_name}! 👋

Quick check-in — has {studentName} received today's class video yet?

Also, mark your calendar: your Parent Coach Meetup is coming up in 2 weeks, where we'll share {studentName}'s progress with you!

${SIGNOFF}`;
}

function pcmOneWeek(): string {
  return `Hi {parent_first_name}! 👋

Quick check-in — has {studentName} received today's class video yet?

Reminder: your Parent Coach Meetup is happening next week, where we'll share {studentName}'s progress with you!

${SIGNOFF}`;
}

function pcmVideoFaWorkbook(): string {
  return `Hi {parent_first_name}! 👋

Quick check-in — has {studentName} received today's class video yet?

You can now check {studentName}'s PCM video! We've also sent an invitation for the upcoming Full Assessment (FA), and {studentName}'s next workbook is ready.

${SIGNOFF}`;
}

function pcmRenewalGift(): string {
  return `Hi {parent_first_name}! 👋

Quick check-in — has {studentName} received today's class video yet?

Reminder: your Parent Coach Meetup is next week, where we'll share {studentName}'s progress. Renew on the day of your PCM and receive a special renewal gift!

${SIGNOFF}`;
}

function faReminderFeedback(): string {
  return `Hi {parent_first_name}! 👋

Quick check-in — has {studentName} received today's class video yet?

Just a reminder about the upcoming Full Assessment (FA) invitation — we'd also love your feedback on {studentName}'s coaches so far!

${SIGNOFF}`;
}

function faCompletion(): string {
  return `Hi {parent_first_name}! 👋

Congratulations! {studentName} has received their Full Assessment (FA) mic, medal, certificate, and video — what an achievement!

${SIGNOFF}`;
}

function testimonialAsk(): string {
  return `Hi {parent_first_name}! 👋

We'd love to hear about your experience at Ebright! Share a testimonial video about our branches, and claim a free gift as our thank-you.

${SIGNOFF}`;
}

function newGradeWorkbook(): string {
  return `Hi {parent_first_name}! 👋

Exciting news — {studentName} has received a new workbook for their new grade!

Quick check-in — has {studentName} received today's class video yet?

${SIGNOFF}`;
}

function siteFeedbackVerbal(): string {
  return `Hi {parent_first_name}! 👋

We'd love your feedback on our website and app — and if you'd rather share it verbally, we're happy to have a quick chat too!

${SIGNOFF}`;
}

function showcaseAnnouncement(): string {
  return `Hi {parent_first_name}! 👋

It's time to celebrate our students' amazing progress! I'm incredibly proud to announce our upcoming Monthly Showcase — a special stage dedicated to celebrating the hard work, courage, and confidence our students have built over the past weeks.

Event details:
Date:
Time:
Venue:

📎 A branch showcase poster will be attached to this email.

If you have any questions about the showcase, please feel free to reach out directly to your Branch Manager or our Marketing Department.

${SIGNOFF}`;
}

/** Minimal RFC4180-ish CSV parser: handles quoted fields with embedded commas/newlines/"" escapes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c === '\r') {
      // skip, \n follows
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

interface ImportRow {
  weekNumber: number | null; // null = Pre-class
  department: Department;
  rawBody: string;
}

async function main() {
  const csv = readFileSync(CSV_PATH, 'utf-8');
  const rows = parseCsv(csv);
  const [, ...dataRows] = rows; // skip header

  const importRows: ImportRow[] = [];

  for (const cols of dataRows) {
    if (cols.length === 0 || cols.every((c) => !c.trim())) continue;
    const weekCell = cols[0].trim();
    const weekNumber = weekCell.toLowerCase() === 'pre-class' ? null : Number(weekCell);
    if (weekCell.toLowerCase() !== 'pre-class' && !Number.isInteger(weekNumber)) continue; // skip malformed rows

    for (let colIdx = 1; colIdx < cols.length; colIdx++) {
      const dept = COLUMN_DEPARTMENTS[colIdx];
      if (!dept) continue;
      const raw = (cols[colIdx] ?? '').trim();
      if (!raw) continue; // no content in this dept for this week — skip, don't invent
      importRows.push({ weekNumber, department: dept, rawBody: raw });
    }
  }

  // Clear out any previously-imported weekly/pre-class content before re-inserting,
  // so re-running this script (e.g. after editing REWRITE_MAP) never duplicates.
  const deleted = await prisma.content.deleteMany({
    where: {
      OR: [
        { weekNumber: { not: null } },
        { AND: [{ triggerType: 'welcome' }, { department: { not: null } }] },
      ],
    },
  });
  console.log(`Cleared ${deleted.count} previously-imported rows.`);

  // Group by weekNumber to resolve priority (null weekNumber = Pre-class, its own group).
  const byWeek = new Map<number | null, ImportRow[]>();
  for (const r of importRows) {
    const arr = byWeek.get(r.weekNumber) ?? [];
    arr.push(r);
    byWeek.set(r.weekNumber, arr);
  }

  const multiDeptWeeks: Array<{ week: number | string; winner: Department; depts: Department[] }> = [];
  const missingRewrites: string[] = [];
  const needsHumanInput: string[] = [];
  let created = 0;

  for (const [weekNumber, entries] of byWeek) {
    const sorted = [...entries].sort((a, b) => departmentPriority(a.department) - departmentPriority(b.department));
    const winnerDept = sorted[0].department;

    if (sorted.length > 1) {
      multiDeptWeeks.push({
        week: weekNumber ?? 'Pre-class',
        winner: winnerDept,
        depts: sorted.map((s) => s.department),
      });
    }

    for (const entry of sorted) {
      const isActive = entry.department === winnerDept;
      const key = `${weekNumber == null ? 'pre' : weekNumber}/${entry.department}`;
      const label = weekNumber == null ? 'Pre-class' : `Week ${weekNumber}`;
      const rewrite = REWRITE_MAP[key];

      if (!rewrite) {
        // Should not happen — every cell in the CSV was catalogued into REWRITE_MAP.
        // If the CSV changes, fall back to the raw text rather than silently skipping.
        missingRewrites.push(`${label} — ${entry.department}`);
        await prisma.content.create({
          data: {
            title: `[NEEDS REWRITE] ${label} — ${entry.department}`,
            channel: 'EMAIL',
            body: entry.rawBody,
            triggerType: weekNumber == null ? 'welcome' : 'video',
            department: entry.department,
            weekNumber,
            isActive: false, // never auto-active until a human writes real copy
            planTypes: JSON.stringify(['all']),
          },
        });
        created++;
        continue;
      }

      if (rewrite.needsHumanInput) needsHumanInput.push(`${label} — ${entry.department}`);

      // `title` is used verbatim as the real email SUBJECT (see lib/send.ts) — it must
      // never contain the week number or department, or that internal admin metadata
      // would leak straight into what the parent receives. The Content library UI
      // shows week/department as separate badges (app/content/page.tsx) instead.
      await prisma.content.create({
        data: {
          title: rewrite.subject,
          channel: 'EMAIL',
          body: rewrite.body,
          triggerType: weekNumber == null ? 'welcome' : 'video',
          department: entry.department,
          weekNumber,
          // Needs-human-input cells never go active regardless of priority — there's
          // no real copy to send yet.
          isActive: isActive && !rewrite.needsHumanInput,
          planTypes: JSON.stringify(['all']),
        },
      });
      created++;
    }
  }

  console.log(`Created ${created} Content templates across ${byWeek.size} weeks/pre-class rows.`);
  console.log(`\nWeeks with multiple departments (${multiDeptWeeks.length}):`);
  for (const w of multiDeptWeeks.sort((a, b) => (typeof a.week === 'number' && typeof b.week === 'number' ? a.week - b.week : 0))) {
    console.log(`  Week ${w.week}: [${w.depts.join(', ')}] -> active: ${w.winner}`);
  }

  if (needsHumanInput.length > 0) {
    console.log(`\nFlagged as NEEDS HUMAN INPUT (imported inactive, original note preserved, no copy invented):`);
    for (const n of needsHumanInput) console.log(`  ${n}`);
  }

  if (missingRewrites.length > 0) {
    console.warn(`\n⚠️  ${missingRewrites.length} cell(s) had no REWRITE_MAP entry and were imported as raw/inactive — update REWRITE_MAP:`);
    for (const m of missingRewrites) console.warn(`  ${m}`);
  }

  console.log(`\nNew placeholder tokens introduced during the rewrite (beyond [video]/[Facebook link]/[Instagram link]/[Tiktok link]/[Threads link]/[attached poster below]):`);
  console.log('  {aoneLink} — the recurring OPS "Aone [parent portal] link" mention');
  console.log('  {websiteLink} — Pre-class OD "send our website link" mention');
  console.log('  {whatsappChannelLink} — Week 1 MKT "WA Channel link" mention');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
