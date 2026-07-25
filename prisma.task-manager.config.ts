// Prisma CLI config for the Task Manager schema (second client). Invoked via
// --config by the tm:* npm scripts — OSC's own prisma.config.ts is untouched.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/task-manager/schema.prisma",
  migrations: {
    path: "prisma/task-manager/migrations",
  },
  datasource: {
    // Separate database (ebright_task_manager) on the same Postgres server as
    // DATABASE_URL. Unset in prod until the Phase 2 cutover — pages render a
    // "being set up" card in that state, and generate/typecheck don't need it.
    url: process.env["TASK_MANAGER_DATABASE_URL"] as string,
  },
});
