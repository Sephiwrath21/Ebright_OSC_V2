// CEO pinned-department dashboard config (per-cadence). Port of
// /api/internal/ceo-dashboard (GET + PUT).
import { z } from "zod";
import type { FlowCeoDashboardConfig, FlowPeriod } from "../ui/types";
import { ApiHttpError } from "../lib/api-server";
import { prisma } from "../prisma";
import { DEPARTMENTS } from "../analytics/_lib";
import { native, requireUserByEmail } from "./core";

const cadenceSchema = z.enum(["daily", "monthly"]);

function parseDepartments(json: unknown): string[] {
  if (!Array.isArray(json)) return [];
  return json.filter((d): d is string => typeof d === "string");
}

async function requireCeo(email: string) {
  const user = await requireUserByEmail(email);
  if (user.role !== "CEO") {
    throw new ApiHttpError(403, "Only the CEO has a customizable department dashboard");
  }
  return user;
}

export function getCeoDashboardConfig(
  email: string,
  cadence: FlowPeriod,
): Promise<FlowCeoDashboardConfig> {
  return native(async () => {
    const parsedCadence = cadenceSchema.parse(cadence);
    const user = await requireCeo(email);
    const config = await prisma.ceoDashboardConfig.findUnique({
      where: { userId_cadence: { userId: user.id, cadence: parsedCadence } },
    });
    // First-ever load for this cadence: default to all 6 official departments,
    // persisted immediately. Once the CEO has saved ANY config (including an
    // empty one), that choice is respected and never auto-reset.
    if (!config) {
      const departments = [...DEPARTMENTS];
      await prisma.ceoDashboardConfig.create({
        data: { userId: user.id, cadence: parsedCadence, departments },
      });
      return { departments } as FlowCeoDashboardConfig;
    }
    return { departments: parseDepartments(config.departments) } as FlowCeoDashboardConfig;
  }, "getCeoDashboardConfig");
}

const saveSchema = z.object({
  cadence: cadenceSchema,
  departments: z.array(z.enum(DEPARTMENTS as [string, ...string[]])).max(DEPARTMENTS.length),
});

/** Replaces the CEO's whole pinned-department list/order for ONE cadence. */
export function saveCeoDashboardConfig(
  email: string,
  cadence: FlowPeriod,
  departments: string[],
): Promise<FlowCeoDashboardConfig> {
  return native(async () => {
    const body = saveSchema.parse({ cadence, departments });
    const user = await requireCeo(email);
    // De-dupe while preserving order.
    const deduped = [...new Set(body.departments)];
    await prisma.ceoDashboardConfig.upsert({
      where: { userId_cadence: { userId: user.id, cadence: body.cadence } },
      create: { userId: user.id, cadence: body.cadence, departments: deduped },
      update: { departments: deduped },
    });
    return { departments: deduped } as FlowCeoDashboardConfig;
  }, "saveCeoDashboardConfig");
}
