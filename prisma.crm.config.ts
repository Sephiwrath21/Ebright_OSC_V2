// Prisma CLI config for the CRM schema (second client, ported from Ebright_OSC
// v1). Invoked via --config by the crm:* npm scripts — the main
// prisma.config.ts and prisma.task-manager.config.ts are untouched.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/crm/schema.prisma",
  datasource: {
    // The live ebright_crm database (schema `crm`) on the shared Postgres
    // server. This is the SAME database v1 owns and writes. `prisma generate`
    // and typecheck don't need it set; only runtime queries do.
    url: process.env["CRM_DATABASE_URL"] as string,
  },
});
