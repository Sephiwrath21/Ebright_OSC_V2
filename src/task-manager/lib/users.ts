// User lookups for the loose (non-FK) user references across the schema.
// User ids on task tables are plain strings so the User table can later mirror
// OSC identities without cascade surgery — resolve names through these helpers.

import { prisma } from "../prisma";
import type { User } from "@/generated/task-manager-client";

export async function getUsersByIds(ids: string[]): Promise<Map<string, User>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: unique } } });
  return new Map(users.map((u) => [u.id, u]));
}

export function toPublicUser(u: User) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, department: u.department };
}
