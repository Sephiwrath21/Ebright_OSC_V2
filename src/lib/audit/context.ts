// ─────────────────────────────────────────────────────────────
// Audit log — who is making this change, and from where.
//
// Resolved straight from the NextAuth session rather than from an
// AsyncLocalStorage the app would have to remember to populate: `auth()` reads
// the session cookie via next/headers, so it works unchanged in Server
// Components, Server Actions and Route Handlers — i.e. everywhere a write can
// originate from — with no per-call-site wiring.
//
// Outside a request (tsx scripts, the bullmq workers, the attendance cron)
// next/headers throws; that is caught and the event is attributed to "system".
// ─────────────────────────────────────────────────────────────

import { cache } from "react";

export type AuditActor = {
  actorId: number | null;
  actorEmail: string | null;
  actorName: string | null;
  actorRole: string | null;
  /** "user" for an authenticated person, "system" for cron/scripts/workers. */
  actorType: "user" | "system";
};

export type AuditRequestInfo = {
  ipAddress: string | null;
  userAgent: string | null;
  route: string | null;
};

export type AuditContext = AuditActor & AuditRequestInfo;

const SYSTEM_ACTOR: AuditActor = {
  actorId: null,
  actorEmail: null,
  actorName: null,
  actorRole: null,
  actorType: "system",
};

const NO_REQUEST: AuditRequestInfo = {
  ipAddress: null,
  userAgent: null,
  route: null,
};

/**
 * `@/auth` imports `@/lib/prisma`, which imports the audit extension, which
 * imports this file — a static `import { auth }` here would close that cycle.
 * The dynamic import defers resolution to call time, after both modules exist.
 */
async function loadSession() {
  const { auth } = await import("@/auth");
  return auth();
}

/**
 * The signed-in actor, or the system actor outside a request.
 *
 * Wrapped in React `cache` so a request that performs twenty writes decodes the
 * session JWT once, not twenty times.
 */
export const getAuditActor = cache(async (): Promise<AuditActor> => {
  try {
    const session = await loadSession();
    const user = session?.user as
      | { id?: string; email?: string | null; name?: string | null; role?: string | null }
      | undefined;
    if (!user?.email) return SYSTEM_ACTOR;

    const parsedId = user.id ? Number.parseInt(user.id, 10) : NaN;
    return {
      actorId: Number.isFinite(parsedId) ? parsedId : null,
      actorEmail: user.email,
      actorName: user.name ?? null,
      actorRole: user.role ?? null,
      actorType: "user",
    };
  } catch {
    // No request scope, or an unreadable/expired session — neither is worth
    // failing a write over.
    return SYSTEM_ACTOR;
  }
});

/**
 * Client IP, user agent and originating path.
 *
 * `route` comes from the Referer header: this app deliberately has no
 * proxy.ts, and adding one that runs on every request just to stamp a path
 * would be a far bigger change than this field is worth. For Server Actions
 * that is the page the user was on, which is the useful answer anyway; for
 * cross-origin or header-stripped requests it is simply null.
 */
export const getAuditRequestInfo = cache(async (): Promise<AuditRequestInfo> => {
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    let route: string | null = null;
    const referer = h.get("referer");
    if (referer) {
      try {
        route = new URL(referer).pathname;
      } catch {
        route = null;
      }
    }
    return {
      ipAddress:
        h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        h.get("x-real-ip") ??
        null,
      userAgent: h.get("user-agent"),
      route,
    };
  } catch {
    return NO_REQUEST;
  }
});

/** Actor + request metadata in one call. */
export async function getAuditContext(): Promise<AuditContext> {
  const [actor, req] = await Promise.all([getAuditActor(), getAuditRequestInfo()]);
  return { ...actor, ...req };
}
