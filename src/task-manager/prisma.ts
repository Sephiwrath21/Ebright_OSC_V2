// Task Manager Prisma client — a SECOND client, generated to
// src/generated/task-manager-client, pointed at the separate
// ebright_task_manager database (same Postgres server as DATABASE_URL by
// convention). Session options mirror src/lib/prisma.ts — see the comments
// there for why TimeZone=UTC and the timeouts matter.
import { PrismaClient } from "@/generated/task-manager-client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForTmPrisma = globalThis as unknown as { tmPrisma?: PrismaClient };

function createClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.TASK_MANAGER_DATABASE_URL,
    options:
      "-c TimeZone=UTC " +
      "-c statement_timeout=60000 " +
      "-c idle_in_transaction_session_timeout=30000",
    max: 10,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    keepAlive: true,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForTmPrisma.tmPrisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForTmPrisma.tmPrisma = prisma;
