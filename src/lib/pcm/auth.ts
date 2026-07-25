import "server-only";
import { auth } from "@/auth";

export interface PcmSessionUser {
  id?: string;
  email: string;
  name?: string | null;
  role?: string | null;
  position?: string | null;
  branchName?: string | null;
}

/** Current portal session user, or null. PCM read endpoints only need "any
 *  logged-in user" — mirrors v1's requireSession() on the read routes. */
export async function pcmSessionUser(): Promise<PcmSessionUser | null> {
  const session = await auth();
  const u = session?.user as PcmSessionUser | undefined;
  if (!u?.email) return null;
  return u;
}
