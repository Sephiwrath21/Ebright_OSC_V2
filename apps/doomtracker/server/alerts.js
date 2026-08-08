require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const nodemailer = require('nodemailer');
const cron = require('node-cron');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD.replace(/\s/g, ''),
  },
});

async function checkOverdueSteps(pool) {
  const now = new Date();

  const result = await pool.query('SELECT id, data FROM doomtracker.runsheets');

  const overdueSteps = [];

  for (const row of result.rows) {
    const runsheet = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    const venueName = runsheet.branchName || runsheet.name || 'Unknown venue';

    if (!runsheet.tasks) continue;

    for (const task of runsheet.tasks) {
      if (task.status === 'done' || task.status === 'completed') continue;

      const dueDate = new Date(task.dueDate + 'T00:00:00');

      if (dueDate < now) {
        const alreadySent = await pool.query(
          'SELECT id FROM doomtracker.alerts_sent WHERE runsheet_id=$1 AND task_id=$2',
          [row.id, task.id]
        );
        if (alreadySent.rows.length === 0) {
          const daysOverdue = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24));
          overdueSteps.push({ venueName, task, dueDate, runsheetId: row.id, daysOverdue });
        }
      }
    }
  }

  if (overdueSteps.length === 0) {
    console.log('[Alerts] No new overdue steps.');
    return;
  }

  // Group by venue
  const grouped = {};
  for (const item of overdueSteps) {
    if (!grouped[item.venueName]) grouped[item.venueName] = [];
    grouped[item.venueName].push(item);
  }

  const totalVenues = Object.keys(grouped).length;
  const dateStr = now.toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' });

  const venueSections = Object.entries(grouped).map(([venue, items]) => {
    const rows = items.map(({ task, dueDate, daysOverdue }) => {
      const urgencyColor = daysOverdue > 14 ? '#E62427' : '#E67E22';
      return `
        <tr style="border-bottom:1px solid #f0f0f0;">
          <td style="padding:10px 12px;font-size:14px;color:#1a1a1a;">${task.title}</td>
          <td style="padding:10px 12px;font-size:14px;color:#555;">${task.dept || '—'}</td>
          <td style="padding:10px 12px;font-size:14px;color:#555;">${task.assignee || '—'}</td>
          <td style="padding:10px 12px;font-size:14px;color:#555;">${dueDate.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
          <td style="padding:10px 12px;font-size:13px;font-weight:600;color:${urgencyColor};">${daysOverdue}d overdue</td>
        </tr>`;
    }).join('');

    return `
      <div style="margin-bottom:28px;">
        <div style="background:#1a1a1a;color:#fff;padding:10px 16px;border-radius:6px 6px 0 0;font-size:14px;font-weight:700;letter-spacing:0.5px;">
          📍 ${venue} — ${items.length} overdue cue${items.length > 1 ? 's' : ''}
        </div>
        <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:0 0 6px 6px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
          <thead>
            <tr style="background:#f7f7f7;">
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#888;font-weight:600;text-transform:uppercase;">Task</th>
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#888;font-weight:600;text-transform:uppercase;">Dept</th>
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#888;font-weight:600;text-transform:uppercase;">Assignee</th>
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#888;font-weight:600;text-transform:uppercase;">Due Date</th>
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#888;font-weight:600;text-transform:uppercase;">Status</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }).join('');

  const html = `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:680px;margin:0 auto;background:#f4f4f4;padding:24px;">

      <div style="background:#E62427;padding:24px 28px;border-radius:8px 8px 0 0;text-align:center;">
        <div style="font-size:28px;font-weight:900;color:#fff;letter-spacing:1px;">DOOM<span style="color:#ffcc00;">TRACKER</span></div>
        <div style="color:rgba(255,255,255,0.85);font-size:13px;margin-top:4px;">Ebright Showcase Workflow Management</div>
      </div>

      <div style="background:#fff;padding:20px 28px;border-left:5px solid #E62427;margin-bottom:20px;">
        <div style="font-size:18px;font-weight:700;color:#1a1a1a;">⚠️ Overdue Cues Report</div>
        <div style="font-size:13px;color:#888;margin-top:4px;">${dateStr} &nbsp;·&nbsp; ${overdueSteps.length} overdue cue${overdueSteps.length > 1 ? 's' : ''} across ${totalVenues} showcase${totalVenues > 1 ? 's' : ''}</div>
      </div>

      ${venueSections}

      <div style="text-align:center;margin:28px 0;">
        <a href="http://localhost:5173" style="background:#E62427;color:#fff;padding:13px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;">
          Open DoomTracker →
        </a>
      </div>

      <div style="background:#1a1a1a;color:#fff;padding:18px 24px;border-radius:6px;text-align:center;margin-top:8px;">
        <div style="font-size:15px;font-weight:700;color:#ffcc00;margin-bottom:6px;">🦾 Dr. Doom, your attention is required.</div>
        <div style="font-size:13px;color:rgba(255,255,255,0.75);line-height:1.6;">
          The cues above have gone unchecked. Issue your decree. Restore order.<br>
          <em style="color:rgba(255,255,255,0.5);">— DoomTracker Command Centre</em>
        </div>
      </div>

      <div style="text-align:center;margin-top:16px;font-size:11px;color:#aaa;">
        This is an automated alert from DoomTracker · Ebright Education · Do not reply to this email
      </div>

    </div>`;

  const plainText = `DOOMTRACKER — Overdue Cues Report\n${dateStr}\n${overdueSteps.length} overdue cues across ${totalVenues} showcase(s)\n\n` +
    Object.entries(grouped).map(([venue, items]) =>
      `${venue}:\n` + items.map(({ task, dueDate, daysOverdue }) =>
        `  • ${task.title} | ${task.dept || '—'} | ${task.assignee || '—'} | Due: ${dueDate.toDateString()} | ${daysOverdue}d overdue`
      ).join('\n')
    ).join('\n\n') +
    '\n\nDr. Doom, your attention is required.\nThe cues above have gone unchecked. Issue your decree. Restore order.\n— DoomTracker Command Centre';

  await transporter.sendMail({
    from: `"DoomTracker" <${process.env.GMAIL_USER}>`,
    to: process.env.ALERT_RECIPIENT,
    subject: `⚠️ DoomTracker: ${overdueSteps.length} overdue cue(s) — ${dateStr}`,
    text: plainText,
    html,
  });

  for (const { runsheetId, task } of overdueSteps) {
    await pool.query(
      'INSERT INTO doomtracker.alerts_sent (runsheet_id, task_id, sent_at) VALUES ($1,$2,NOW()) ON CONFLICT DO NOTHING',
      [runsheetId, task.id]
    );
  }

  console.log(`[Alerts] Sent alert for ${overdueSteps.length} overdue step(s).`);
}

function startAlerts(pool) {
  cron.schedule('0 9 * * *', () => {
    console.log('[Alerts] Running overdue check...');
    checkOverdueSteps(pool).catch(e => console.error('[Alerts] Error:', e.message));
  });
  console.log('[Alerts] Scheduler started — runs daily at 9am.');
}

// Send a single ad-hoc email (used by the /api/notify endpoint so the app can
// fire the flowchart reminder emails on demand — no database involved).
async function sendMail({ to, subject, text, html }) {
  const recipients = Array.isArray(to) ? to.filter(Boolean).join(',') : to;
  if (!recipients) throw new Error('No recipient');
  return transporter.sendMail({
    from: `"DoomTracker" <${process.env.GMAIL_USER}>`,
    to: recipients,
    subject,
    text,
    html,
  });
}

module.exports = { startAlerts, checkOverdueSteps, sendMail };