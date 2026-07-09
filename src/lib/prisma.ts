import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  // PG session config (server-side):
  //   TimeZone=UTC              — adapter-pg's normalize_timestamptz rewrites
  //                               "...+08" reads to "+00:00" *without*
  //                               converting the wall clock, silently
  //                               shifting reads +8h. Forcing UTC stops it.
  //   statement_timeout=60000   — kill any single query stuck >60s on the
  //                               server instead of letting it tie up a
  //                               connection slot indefinitely.
  //   idle_in_transaction_session_timeout=30000 — drop sockets that opened
  //                               a tx and went silent.
  //
  // pg.Pool config (client-side):
  //   max=15                    — slightly above the default 10 to keep
  //                               headroom for the scanner-sync background
  //                               poller + interactive auth/page queries.
  //   connectionTimeoutMillis   — fail fast on connect (don't hang the
  //                               request waiting for a free slot forever).
  //   idleTimeoutMillis         — recycle idle conns so a half-dead socket
  //                               is replaced rather than reused.
  //   keepAlive                 — keep TCP alive against idle middleboxes.
  const adapter = new PrismaPg({
    // Prisma reads DATABASE_URL first — that's where the lowercase Prisma
    // tables (users, employment, user_profile, ...) live. HRFS_DATABASE_URL
    // is for raw pg queries via @/lib/ebright-hrfs (hikvision_attendance_all,
    // LeaveTransaction, BranchStaff). Inverting the priority on Jun 23 to
    // unbreak staging login — see /attendance/summary investigation.
    connectionString: process.env.DATABASE_URL ?? process.env.HRFS_DATABASE_URL,
    options:
      "-c TimeZone=UTC " +
      "-c statement_timeout=60000 " +
      "-c idle_in_transaction_session_timeout=30000",
    max: 15,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    keepAlive: true,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
