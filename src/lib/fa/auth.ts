import "server-only";
import { auth } from "@/auth";

export interface FaSessionUser {
  id?: string;
  email: string;
  name?: string | null;
  role?: string | null;
  position?: string | null;
  branchName?: string | null;
}

/** Resolve the current portal session's user, or null if unauthenticated.
 *  FA read endpoints only need "any logged-in user" — mirrors v1's
 *  requireSession() on the read routes (/api/fa/data, /students, /reports GET). */
export async function faSessionUser(): Promise<FaSessionUser | null> {
  const session = await auth();
  const u = session?.user as FaSessionUser | undefined;
  if (!u?.email) return null;
  return u;
}
