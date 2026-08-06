import { PrismaClient } from '@/generated/crm-client'
import { PrismaPg } from '@prisma/adapter-pg'

// CRM Prisma client (ported from Ebright_OSC v1). This is a SECOND Prisma
// client — generated to src/generated/crm-client and pointed at the live
// ebright_crm database via CRM_DATABASE_URL. It mirrors the task-manager
// second-client pattern (src/task-manager/prisma.ts): Prisma 7 requires a
// driver adapter, so we connect through PrismaPg rather than passing a raw
// datasourceUrl.
//
// NOTE: v1 read CRM_DATABASE_URL under the name DATABASE_URL. In V2 that var is
// already taken by the portal/HR database, so the CRM client uses its own
// CRM_DATABASE_URL to avoid the collision.
const globalForPrisma = global as unknown as { crmPrisma?: PrismaClient }

const databaseUrl = process.env.CRM_DATABASE_URL
if (!databaseUrl) {
  throw new Error('CRM_DATABASE_URL is not set — cannot initialise the CRM Prisma client')
}

function createClient(): PrismaClient {
  // The CRM tables live in the Postgres `crm` schema. v1 relied on the
  // `?schema=crm` URL param, but the PrismaPg driver adapter (Prisma 7) hands
  // the connection to node-postgres, which ignores that Prisma-only param AND
  // libpq `options`/`-c search_path`. The reliable way to pin the schema for
  // the adapter is its SECOND argument `{ schema: 'crm' }` — otherwise every
  // unqualified model resolves against the near-empty `public` copy of these
  // tables (crm_auth_user etc. also exist in public/old_import) and silently
  // returns nothing.
  const adapter = new PrismaPg(
    {
      connectionString: databaseUrl,
      options:
        '-c TimeZone=UTC ' +
        '-c statement_timeout=60000 ' +
        '-c idle_in_transaction_session_timeout=30000',
      max: 10,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
      keepAlive: true,
    },
    { schema: 'crm' },
  )
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === 'development'
        ? ['warn', 'error']
        : ['warn', 'error'],
  })
}

export const prisma: PrismaClient = globalForPrisma.crmPrisma ?? createClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.crmPrisma = prisma
}
