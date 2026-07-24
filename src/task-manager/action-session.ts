// Request-time session revalidation for Task Manager server actions. The
// actions close over the render-time session email; Next's encrypted
// bound-args survive logout, so every mutation re-checks the LIVE session
// and confirms it still belongs to the same user before dispatching.
import { auth } from "@/auth";

export type StaleSessionResult = { ok: false; message: string };

/** Returns null when the live session still matches `email`; otherwise a
 *  ready-to-return ActionResult-shaped failure. */
export async function requireLiveSession(email: string): Promise<StaleSessionResult | null> {
  const session = await auth();
  const live = session?.user?.email;
  if (!live || live.toLowerCase() !== email.toLowerCase()) {
    return { ok: false, message: "Your session has changed — please sign in again and retry" };
  }
  return null;
}
