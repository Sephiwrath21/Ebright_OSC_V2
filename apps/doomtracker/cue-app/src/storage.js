const PREFIX = "cue-app";
// Embedded in the portal, the API is reached same-origin under /flowghan-embed
// (the portal proxies it to this app's Express server, which strips the prefix
// back to /api). VITE_API_BASE can still override for standalone dev.
const API_BASE = import.meta.env.VITE_API_BASE || "/flowghan-embed";
const TOKEN_KEY = `${PREFIX}:auth:token`;
const USER_KEY = `${PREFIX}:auth:user`;

// The app registers these so storage can react to cross-cutting API outcomes in
// one place instead of at every call site:
//  - onAuthExpired: a 401 means the login token is missing/expired -> bounce to
//    the sign-in screen.
//  - onSaveError: a save failed (network error / non-ok) -> warn the user their
//    change may not have reached the server; called with null on a good save to
//    clear the warning.
let onAuthExpired = null;
export function setAuthExpiredHandler(fn) { onAuthExpired = fn; }
let onSaveError = null;
export function setSaveErrorHandler(fn) { onSaveError = fn; }

// Attach the JWT (from login) so the backend can scope data to the user's
// department. `json: true` adds the Content-Type for write requests.
async function apiFetch(path, { json = false, ...opts } = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(json ? { "Content-Type": "application/json" } : {}),
      ...(opts.headers || {}),
    },
  });
  // A 401 on any authenticated call means the session is gone/expired. login()
  // uses raw fetch (below), so a bad-password 401 during sign-in never lands here.
  if (res.status === 401 && onAuthExpired) onAuthExpired();
  return res;
}

// The app now persists through the backend `/api/settings` key/value store,
// which is scoped to the logged-in user's department (everyone in a department
// shares the same data). `shared = true` targets the company-wide GLOBAL scope
// instead of the department — used for company-level settings like the CEO.
// Values are opaque strings: callers JSON.stringify before set and JSON.parse
// after get, and the value round-trips through the server unchanged.
export const storage = {
  async get(key, shared = false) {
    const res = await apiFetch(
      `/api/settings/${encodeURIComponent(key)}${shared ? "?scope=global" : ""}`
    );
    // A genuine 404 means "this key isn't set yet" — NOT a failure. Return null
    // so callers can safely seed defaults. Any other non-ok status (server down,
    // 500, expired-login 401) still throws, so callers can tell a real error
    // apart from "empty" and must NOT overwrite real data on a real error.
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Failed to load ${key}: HTTP ${res.status}`);
    const data = await res.json();
    return { key, value: data.value, shared };
  },

  async set(key, value, shared = false) {
    try {
      const res = await apiFetch(
        `/api/settings/${encodeURIComponent(key)}${shared ? "?scope=global" : ""}`,
        { method: "PUT", json: true, body: JSON.stringify({ value }) }
      );
      if (!res.ok) throw new Error(`Failed to save ${key}: HTTP ${res.status}`);
      if (onSaveError) onSaveError(null); // a good save clears any prior warning
      return { key, value, shared };
    } catch (e) {
      if (onSaveError) onSaveError(e); // network error or non-ok status
      throw e;
    }
  },

  async delete(key, shared = false) {
    try {
      const res = await apiFetch(
        `/api/settings/${encodeURIComponent(key)}${shared ? "?scope=global" : ""}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error(`Failed to delete ${key}: HTTP ${res.status}`);
      if (onSaveError) onSaveError(null);
      return { key, deleted: true, shared };
    } catch (e) {
      if (onSaveError) onSaveError(e);
      throw e;
    }
  },

  async list(prefix = "", shared = false) {
    const res = await apiFetch(`/api/settings${shared ? "?scope=global" : ""}`);
    if (!res.ok) throw new Error(`Failed to list settings: HTTP ${res.status}`);
    const rows = await res.json(); // [{ key, value }, ...]
    const keys = rows.map((r) => r.key).filter((k) => k.startsWith(prefix));
    return { keys, prefix, shared };
  },
};

// --- SSO (portal-embedded build) ---
// When Flowghan runs inside the Ebright portal, there is no password login: the
// portal already knows who you are. This asks the portal (same-origin) to mint a
// Flowghan token from the logged-in portal session. The endpoint lives at the
// portal ROOT (/api/flowghan/session) — NOT under API_BASE — because it is a
// Next.js route, not this app's Express backend. Returns the token on success,
// or null if the portal session is missing/expired (caller then tells the user
// to open Flowghan from the portal). Stores the same token+user shape as login()
// so the rest of the app is unchanged.
export async function ssoLogin() {
  try {
    const res = await fetch("/api/flowghan/session", {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.token) return null;
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user || null));
    // Keep doomtracker.users (the /api/people reminder-email directory) in sync
    // with the portal. Best-effort: the SSO session above already succeeded, so a
    // sync failure here shouldn't block sign-in.
    apiFetch("/api/auth/sso-sync", { method: "POST" }).catch(() => {});
    return data.token;
  } catch {
    return null;
  }
}

// --- Auth (still authenticates against the backend; no app data is stored there) ---
export async function login(email, password) {
  const res = await fetch(`${API_BASE}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.token) return null;
  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user || null));
  return data.token;
}

// Ask the backend to send a real reminder email. Payload: { to, subject, text, html }.
// This is the ONLY app-data-adjacent call that hits the server; it stores nothing
// in the database — it just relays the email through the Gmail transporter.
export async function sendNotification({ to, subject, text, html }) {
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(`${API_BASE}/api/notify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ to, subject, text, html }),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch { /* non-JSON error body */ }
    throw new Error(msg);
  }
  return res.json();
}

// --- Admin: user management (backend gates these to role='admin') ---
export async function listUsers() {
  const res = await apiFetch("/api/users");
  if (!res.ok) throw new Error(`Failed to load users: HTTP ${res.status}`);
  return res.json(); // [{ id, email, name, role, department }, ...]
}

export async function createUser({ name, email, password, role, department }) {
  const res = await apiFetch("/api/register", {
    method: "POST",
    json: true,
    body: JSON.stringify({ name, email, password, role, department }),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch { /* non-JSON error body */ }
    throw new Error(msg);
  }
  return res.json(); // the created user (no password)
}

// Admin-only: change an existing account's department and/or role. The backend
// UPDATEs one row (never deletes) and normalizes the department spelling. Pass
// only the fields you want to change.
export async function updateUser(id, patch) {
  const res = await apiFetch(`/api/users/${id}`, {
    method: "PATCH",
    json: true,
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch { /* non-JSON error body */ }
    throw new Error(msg);
  }
  return res.json(); // the updated user (no password)
}

// People (name + email) in the caller's department, for addressing reminder
// emails. Any logged-in user may call this; it's scoped to their department.
export async function listPeople() {
  const res = await apiFetch("/api/people");
  if (!res.ok) throw new Error(`Failed to load people: HTTP ${res.status}`);
  return res.json(); // [{ name, email }, ...]
}

// Admin-only, read-only company overview: every department's templates + runsheets.
export async function getDepartmentsOverview() {
  const res = await apiFetch("/api/admin/overview");
  if (!res.ok) throw new Error(`Failed to load overview: HTTP ${res.status}`);
  return res.json(); // [{ department, templates: [...], runsheets: [...] }, ...]
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getCurrentUser() {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
