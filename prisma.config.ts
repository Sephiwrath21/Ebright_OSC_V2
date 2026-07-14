import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // DATABASE_URL is the local Prisma DB (lowercase users/employment/...);
    // HRFS_DATABASE_URL is for raw pg queries via @/lib/ebright-hrfs. Kept
    // here as a fallback only.
    url: (process.env["DATABASE_URL"] ?? process.env["HRFS_DATABASE_URL"]) as string,
  },
});
