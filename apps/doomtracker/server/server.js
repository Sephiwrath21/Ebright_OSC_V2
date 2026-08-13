const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { startAlerts, checkOverdueSteps, sendMail } = require('./alerts');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const path = require('path');
const app = express();
// Flowghan is embedded in the Ebright portal same-origin under /flowghan-embed/*;
// the portal reverse-proxies that whole subpath to this server. API calls arrive
// as /flowghan-embed/api/... — strip the prefix here so the existing /api/* routes
// match unchanged. Static asset requests keep the prefix and are served at the
// bottom of this file. (No effect in standalone dev, where the prefix is absent.)
app.use((req, res, next) => {
  if (req.url.startsWith('/flowghan-embed/api')) {
    req.url = req.url.slice('/flowghan-embed'.length);
  }
  next();
});
// Local dev origins are always allowed. Staging/production frontends are ADDED via
// the CORS_ORIGINS env var (comma-separated URLs) so the same code serves every
// environment — set it in each server's .env, leave it unset for plain local dev.
const localOrigins = ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'];
const envOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
const allowedOrigins = [...localOrigins, ...envOrigins];
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
// Proof files are stored as base64 data URLs inside the settings JSON, and a
// department's whole templates blob is saved under one key — so a few screenshots
// can far exceed Express's 100kb default and get rejected with 413. Raise the
// limit so proofs actually save. (Moving proofs to real file storage is a Part B
// item; this keeps the feature working locally in the meantime.)
app.use(express.json({ limit: '25mb' }));

const parseData = (d) => (typeof d === 'string' ? JSON.parse(d) : d);

// Settings are normally scoped to the user's department. `?scope=global` targets
// a reserved company-wide bucket instead (e.g. the single shared CEO), so it never
// collides with any real department.
const settingsScope = (req) =>
  (req.query.scope === 'global' ? '__global__' : (req.user.department || ''));

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// Read-only pool into the HR system's `hrfs` database — the real source of
// truth for which departments exist and who's in them. Flowghan's own
// `department` field is free text typed by whoever creates an account (see
// /api/register), which is how test values like "Sales" ended up on the
// Company Overview page. This pool is only ever SELECTed from.
const hrfsPool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.HRFS_DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// HRFS's canonical department names don't always match the strings Flowghan
// accounts/settings were actually filed under (Flowghan's own DEPARTMENTS
// list in App.jsx uses fuller/older names). This maps each HRFS name to the
// Flowghan-side department string, so existing templates/runsheets still
// surface under the real department instead of looking like "no activity".
const HRFS_TO_FLOWGHAN_DEPT = {
  'CEO': 'MD Office',
  'Optimisation': 'Optimisation',
  'Academy': 'Academy',
  'Marketing': 'Marketing',
  'Operation': 'Operations',
  'IOP': 'Industrial-Organisational Psychology',
  'Finance': 'Finance',
  'Human Resource': 'Human Resources & Legal',
};

// Auth middleware
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Admin-only gate: use AFTER `auth` so req.user is populated. Only users whose
// JWT carries role='admin' may create/list accounts.
const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  next();
};

// --- AUTH ---
// Creating accounts is admin-only: an admin sets each user's department (the field
// that controls all data isolation), so it must never be self-serve.
app.post('/api/register', auth, adminOnly, async (req, res) => {
  const { email, password, name, role, department } = req.body;
  const hash = await bcrypt.hash(password, 10);
  try {
    // Department drives all data isolation, so keep its spelling consistent:
    // trim spaces, and if a department already exists that matches ignoring
    // case, reuse that exact spelling. This stops "finance"/"Finance"/" Finance "
    // from becoming separate buckets whose members can't see each other's data.
    let dept = (department || '').trim() || null;
    if (dept) {
      const match = await pool.query(
        'SELECT department FROM doomtracker.users WHERE lower(department) = lower($1) LIMIT 1',
        [dept]
      );
      if (match.rows[0]) dept = match.rows[0].department;
    }
    const result = await pool.query(
      'INSERT INTO doomtracker.users (email, password, name, role, department) VALUES ($1,$2,$3,$4,$5) RETURNING id, email, name, role, department',
      [email, hash, name, role || 'staff', dept]
    );
    res.json(result.rows[0]);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// List all users (admin-only). Never returns password hashes.
app.get('/api/users', auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, name, role, department FROM doomtracker.users ORDER BY id'
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update an existing account's department and/or role (admin-only). Never touches
// the password, and never deletes anything — it UPDATEs one row. Only the fields
// the caller actually sends are changed. Department drives all data isolation, so
// it is normalized exactly like /api/register: trimmed, and if a department with
// the same spelling (ignoring case) already exists, that exact casing is reused —
// this stops "Human Resources" and "Human Resources & Legal" style splits from
// becoming separate buckets. Changing a user's department re-points them at that
// department's bucket on their next login; it moves no data, so the old bucket's
// contents stay intact and untouched.
app.patch('/api/users/:id', auth, adminOnly, async (req, res) => {
  const { id } = req.params;
  const { department, role } = req.body;
  try {
    const fields = [];
    const values = [];
    let i = 1;

    if (department !== undefined) {
      let dept = (department || '').trim() || null;
      if (dept) {
        const match = await pool.query(
          'SELECT department FROM doomtracker.users WHERE lower(department) = lower($1) LIMIT 1',
          [dept]
        );
        if (match.rows[0]) dept = match.rows[0].department;
      }
      fields.push(`department=$${i++}`);
      values.push(dept);
    }
    if (role !== undefined) {
      const allowed = ['staff', 'hod', 'admin'];
      if (!allowed.includes(role)) return res.status(400).json({ error: 'Invalid role' });
      fields.push(`role=$${i++}`);
      values.push(role);
    }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });

    values.push(id);
    const result = await pool.query(
      `UPDATE doomtracker.users SET ${fields.join(', ')} WHERE id=$${i} RETURNING id, email, name, role, department`,
      values
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Company-wide overview (admin-only, READ-ONLY): every REAL department (from
// HRFS, not Flowghan's own free-text field) with its employee count and
// whatever Flowghan templates/runsheets it has, so an admin can watch every
// department's progress from one screen — including ones that haven't used
// Flowghan yet. Normal /api/settings is department-scoped; this deliberately
// reaches across departments, which is why it's gated to admins. It never
// writes anything.
app.get('/api/admin/overview', auth, adminOnly, async (req, res) => {
  try {
    const [deptRes, settingsRes] = await Promise.all([
      hrfsPool.query(
        `SELECT d.department_name,
                count(*) FILTER (WHERE e.status = 'active') AS employees
         FROM department d
         LEFT JOIN employment e ON e.department_id = d.department_id
         GROUP BY d.department_name
         ORDER BY d.department_name`
      ),
      pool.query(
        `SELECT department, key, value FROM doomtracker.settings
         WHERE key IN ('ebright-templates', 'ebright-runsheets')
           AND department IS NOT NULL AND department <> '' AND department <> '__global__'`
      ),
    ]);

    // Flowghan activity, keyed by whatever department string it's actually filed under.
    const activityByDept = {};
    for (const row of settingsRes.rows) {
      const d = row.department;
      if (!activityByDept[d]) activityByDept[d] = { templates: [], runsheets: [] };
      let parsed = [];
      try { parsed = JSON.parse(row.value); } catch { parsed = []; }
      if (row.key === 'ebright-templates') activityByDept[d].templates = Array.isArray(parsed) ? parsed : [];
      else if (row.key === 'ebright-runsheets') activityByDept[d].runsheets = Array.isArray(parsed) ? parsed : [];
    }

    const overview = deptRes.rows.map((d) => {
      const flowghanName = HRFS_TO_FLOWGHAN_DEPT[d.department_name] || d.department_name;
      const activity = activityByDept[flowghanName] || { templates: [], runsheets: [] };
      return {
        department: d.department_name,
        employees: Number(d.employees) || 0,
        templates: activity.templates,
        runsheets: activity.runsheets,
      };
    });

    res.json(overview);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin-only settings read/write for an ARBITRARY department (mirrors
// /api/settings/:key, but the department comes from the URL instead of the
// caller's own JWT). Lets an admin create/edit templates on another
// department's behalf; adminOnly keeps everyone else out.
app.get('/api/admin/settings/:department/:key', auth, adminOnly, async (req, res) => {
  try {
    const dept = (req.params.department || '').trim();
    if (!dept) return res.status(400).json({ error: 'department is required' });
    const r = await pool.query('SELECT value FROM doomtracker.settings WHERE department=$1 AND key=$2', [dept, req.params.key]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ key: req.params.key, value: r.rows[0].value });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/admin/settings/:department/:key', auth, adminOnly, async (req, res) => {
  try {
    const dept = (req.params.department || '').trim();
    if (!dept) return res.status(400).json({ error: 'department is required' });
    const value = typeof req.body.value === 'string' ? req.body.value : JSON.stringify(req.body.value ?? '');
    await pool.query(
      `INSERT INTO doomtracker.settings (department, key, value, updated_at)
       VALUES ($1,$2, to_jsonb($3::text), NOW())
       ON CONFLICT (department, key) DO UPDATE SET value=to_jsonb($3::text), updated_at=NOW()`,
      [dept, req.params.key, value]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const result = await pool.query('SELECT * FROM doomtracker.users WHERE email=$1', [email]);
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password)))
    return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role, department: user.department }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role, department: user.department } });
});

// Called once by the frontend right after an SSO login (see ssoLogin() in
// storage.js). The portal already verified who this person is; this just keeps
// doomtracker.users in sync so they show up in the department "reminder email"
// directory (/api/people) without an admin manually adding them via /api/register.
// Never overwrites password on an existing row — SSO users never log in with a
// password here, and this must not clobber a real local-login account that
// happens to share the same email.
app.post('/api/auth/sso-sync', auth, async (req, res) => {
  try {
    const { email, name, role, department } = req.user;
    if (!email) return res.status(400).json({ error: 'Token missing email' });

    // Same department-spelling normalization as /api/register, so SSO-synced
    // accounts land in the same bucket as manually created ones.
    let dept = (department || '').trim() || null;
    if (dept) {
      const match = await pool.query(
        'SELECT department FROM doomtracker.users WHERE lower(department) = lower($1) LIMIT 1',
        [dept]
      );
      if (match.rows[0]) dept = match.rows[0].department;
    }
    const allowedRoles = ['staff', 'hod', 'admin'];
    const safeRole = allowedRoles.includes(role) ? role : 'staff';
    // password is NOT NULL with no default; SSO accounts never use it, so give
    // new rows an unguessable placeholder hash that can never authenticate.
    const placeholderHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);

    await pool.query(
      `INSERT INTO doomtracker.users (email, password, name, role, department)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET name=$3, role=$4, department=$5`,
      [email, placeholderHash, name || email, safeRole, dept]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- TEMPLATES ---
app.get('/api/templates', auth, async (req, res) => {
  const result = await pool.query('SELECT * FROM doomtracker.templates ORDER BY updated_at DESC');
  res.json(result.rows.map(r => ({ ...parseData(r.data), _id: r.id, updatedAt: r.updated_at })));
});

app.put('/api/templates/:id', auth, async (req, res) => {
  const { id } = req.params;
  const data = req.body;
  await pool.query(
    'INSERT INTO doomtracker.templates (id, name, description, data, updated_at) VALUES ($1,$2,$3,$4::jsonb,NOW()) ON CONFLICT (id) DO UPDATE SET name=$2, description=$3, data=$4::jsonb, updated_at=NOW()',
    [id, data.name, data.description || '', JSON.stringify(data)]
  );
  res.json({ ok: true });
});

// --- RUNSHEETS ---
app.get('/api/runsheets', auth, async (req, res) => {
  const result = await pool.query('SELECT * FROM doomtracker.runsheets ORDER BY updated_at DESC');
  res.json(result.rows.map(r => ({ ...parseData(r.data), _id: r.id, updatedAt: r.updated_at })));
});

app.put('/api/runsheets/:id', auth, async (req, res) => {
  const { id } = req.params;
  const data = req.body;
  await pool.query(
    'INSERT INTO doomtracker.runsheets (id, template_id, venue, event_date, data, updated_at) VALUES ($1,$2,$3,$4,($5)::jsonb,NOW()) ON CONFLICT (id) DO UPDATE SET template_id=$2, venue=$3, event_date=$4, data=($5)::jsonb, updated_at=NOW()',
    [id, data.templateId, data.branchName, data.eventDate, JSON.stringify(data)]
  );
  res.json({ ok: true });
});

app.delete('/api/runsheets/:id', auth, async (req, res) => {
  await pool.query('DELETE FROM doomtracker.runsheets WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

app.delete('/api/templates/:id', auth, async (req, res) => {
  await pool.query('DELETE FROM doomtracker.templates WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// People (name + email) in the caller's own department, used to address reminder
// emails to the right person. Any logged-in user may read their own department's
// directory; it is department-scoped so no one sees other departments' contacts.
// Never returns password hashes.
app.get('/api/people', auth, async (req, res) => {
  try {
    const dept = req.user.department || null;
    const r = dept
      ? await pool.query('SELECT name, email FROM doomtracker.users WHERE department=$1 ORDER BY name', [dept])
      : await pool.query('SELECT name, email FROM doomtracker.users ORDER BY name');
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- NOTIFY (ad-hoc reminder email from the flowchart Outbox; no DB) ---
app.post('/api/notify', auth, async (req, res) => {
  try {
    const { to, subject, text, html } = req.body;
    if (!to || (Array.isArray(to) && to.filter(Boolean).length === 0)) {
      return res.status(400).json({ error: 'No recipient' });
    }
    await sendMail({ to, subject, text, html });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- ALERTS TEST ---
app.post('/api/alerts/test', auth, async (req, res) => {
  try {
    await checkOverdueSteps(pool);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- SETTINGS (general key/value store, scoped to the user's department) ---
// Values are opaque strings from the frontend (it JSON-stringifies before saving),
// stored as a JSON string in the jsonb column so they round-trip unchanged.
app.get('/api/settings', auth, async (req, res) => {
  try {
    const dept = settingsScope(req);
    const r = await pool.query('SELECT key, value FROM doomtracker.settings WHERE department=$1', [dept]);
    res.json(r.rows);   // value comes back as the original string
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/settings/:key', auth, async (req, res) => {
  try {
    const dept = settingsScope(req);
    const r = await pool.query('SELECT value FROM doomtracker.settings WHERE department=$1 AND key=$2', [dept, req.params.key]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ key: req.params.key, value: r.rows[0].value });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/settings/:key', auth, async (req, res) => {
  try {
    const dept = settingsScope(req);
    const value = typeof req.body.value === 'string' ? req.body.value : JSON.stringify(req.body.value ?? '');
    await pool.query(
      `INSERT INTO doomtracker.settings (department, key, value, updated_at)
       VALUES ($1,$2, to_jsonb($3::text), NOW())
       ON CONFLICT (department, key) DO UPDATE SET value=to_jsonb($3::text), updated_at=NOW()`,
      [dept, req.params.key, value]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/settings/:key', auth, async (req, res) => {
  try {
    const dept = settingsScope(req);
    await pool.query('DELETE FROM doomtracker.settings WHERE department=$1 AND key=$2', [dept, req.params.key]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- DEPARTMENT TEMPLATES ---
app.get('/api/dept-templates/:department', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM doomtracker.flowcharts WHERE department=$1 AND data @> \'{"isTemplate":true}\'::jsonb ORDER BY updated_at DESC',
      [req.params.department]
    );
    res.json(result.rows.map(r => ({
      id: r.id, name: r.name, department: r.department,
      data: typeof r.data === 'string' ? JSON.parse(r.data) : r.data,
      created_at: r.created_at, updated_at: r.updated_at,
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/dept-templates/:department/:id', auth, async (req, res) => {
  try {
    const { name, data } = req.body;
    const templateData = { ...data, isTemplate: true };
    await pool.query(
      `INSERT INTO doomtracker.flowcharts (id, department, name, data, updated_at)
       VALUES ($1,$2,$3,$4::jsonb,NOW())
       ON CONFLICT (id) DO UPDATE SET name=$3, data=$4::jsonb, updated_at=NOW()`,
      [req.params.id, req.params.department, name, JSON.stringify(templateData)]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/dept-templates/:department/:id', auth, async (req, res) => {
  try {
    await pool.query('DELETE FROM doomtracker.flowcharts WHERE id=$1 AND department=$2',
      [req.params.id, req.params.department]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
const PORT = process.env.PORT || 3001;
// --- FLOWCHARTS ---
app.get('/api/flowcharts/:department', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, department, name, created_at, updated_at FROM doomtracker.flowcharts WHERE department=$1 ORDER BY updated_at DESC',
      [req.params.department]
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/flowcharts/:department/:id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM doomtracker.flowcharts WHERE id=$1 AND department=$2',
      [req.params.id, req.params.department]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/flowcharts/:department/:id', auth, async (req, res) => {
  try {
    const { name, data } = req.body;
    await pool.query(
      `INSERT INTO doomtracker.flowcharts (id, department, name, data, updated_at)
       VALUES ($1,$2,$3,$4::jsonb,NOW())
       ON CONFLICT (id) DO UPDATE SET name=$3, data=$4::jsonb, updated_at=NOW()`,
      [req.params.id, req.params.department, name, JSON.stringify(data)]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/flowcharts/:department/:id', auth, async (req, res) => {
  try {
    await pool.query('DELETE FROM doomtracker.flowcharts WHERE id=$1 AND department=$2',
      [req.params.id, req.params.department]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// Serve Flowghan's built SPA under the same /flowghan-embed base the portal proxies.
// Existing files (assets, index.html) are served by express.static; any other
// /flowghan-embed/* path is an SPA client route, so fall back to index.html.
const flowghanDist = path.join(__dirname, '../cue-app/dist');
app.use('/flowghan-embed', express.static(flowghanDist));
app.use('/flowghan-embed', (req, res) => {
  res.sendFile(path.join(flowghanDist, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Flowghan server running on port ${PORT}`);
  startAlerts(pool);
});