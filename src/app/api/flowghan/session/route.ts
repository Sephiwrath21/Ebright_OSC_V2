/**
 * /api/flowghan/session — SSO bridge for the embedded Flowghan app.
 *
 * Flowghan (apps/doomtracker) runs as its own React+Express app, iframed into
 * the portal same-origin under /flowghan-embed. Rather than a second login, this
 * route reads the logged-in portal (NextAuth) session, derives the caller's
 * Flowghan identity, and mints a JWT that Flowghan's Express backend already
 * knows how to verify (jwt.verify with its JWT_SECRET). The Flowghan frontend
 * calls this on boot instead of showing its own login page.
 *
 * The token is signed with FLOWGHAN_JWT_SECRET, which MUST equal the Flowghan
 * server's JWT_SECRET (apps/doomtracker/server/.env). HS256 tokens from jose are
 * verifiable by jsonwebtoken as long as the secret bytes match.
 */
import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Portal role_type -> Flowghan's 3-role model (staff | hod | admin).
// superadmin/ceo run Flowghan as admin (cross-department overview + user mgmt);
// hod stays hod within their department; everyone else is plain staff.
function mapRole(roleType: string | null | undefined): "admin" | "hod" | "staff" {
  const r = (roleType ?? "").toLowerCase();
  if (r === "superadmin" || r === "ceo") return "admin";
  if (r === "hod") return "hod";
  return "staff";
}

export async function POST() {
  const session = await auth();
  const email = session?.user?.email;
  if (!session || !email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const secretStr = process.env.FLOWGHAN_JWT_SECRET;
  if (!secretStr) {
    // Misconfiguration, not an auth failure — surface it so it's obvious in dev.
    return NextResponse.json(
      { error: "Flowghan SSO is not configured (FLOWGHAN_JWT_SECRET missing)." },
      { status: 500 },
    );
  }

  const user = await prisma.users.findUnique({
    where: { email },
    include: {
      role: { select: { role_type: true } },
      user_profile: { select: { full_name: true } },
      employment: {
        where: { status: "active" },
        include: { department: { select: { department_name: true } } },
        take: 1,
      },
    },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const role = mapRole(user.role?.role_type);
  // Flowghan scopes all data by department string. Use the active employment's
  // department name; admins (superadmin/ceo) may have none — they get the
  // cross-department overview, so an empty department is fine for them.
  const department = user.employment[0]?.department?.department_name ?? "";
  const name = user.user_profile?.full_name || session.user?.name || email;

  const secret = new TextEncoder().encode(secretStr);
  const token = await new SignJWT({ id: user.user_id, email, name, role, department })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secret);

  return NextResponse.json({
    token,
    user: { id: user.user_id, email, name, role, department },
  });
}
