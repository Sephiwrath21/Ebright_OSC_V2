import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { titleCaseName } from "@/lib/text";
import { logAuditEvent } from "@/lib/audit/log";

/**
 * Record a rejected sign-in. Sign-in attempts are the one audit event with no
 * session behind them, so the actor is stamped from the submitted email and
 * marked `system` — nothing here is authenticated and must not read as if it
 * were. The reason is deliberately coarse: "no such account" vs "wrong
 * password" is exactly the distinction an attacker wants, so it stays in the
 * audit trail (admins only) and never reaches the login screen.
 */
function auditFailedLogin(email: string, reason: string) {
  void logAuditEvent({
    action: "LOGIN_FAILED",
    entity: "users",
    detail: email,
    meta: { email, reason },
    actor: { actorEmail: email, actorType: "system" },
  });
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email:    { label: "Username/Email", type: "text" },
        password: { label: "Password",       type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.users.findUnique({
          where: { email: credentials.email as string },
          include: {
            role: true,
            user_profile: true,
            employment: {
              where: { status: "active" },
              include: { branch: true },
              take: 1,
            },
          },
        });
        const attemptedEmail = credentials.email as string;
        if (!user) {
          auditFailedLogin(attemptedEmail, "unknown account");
          return null;
        }
        if (user.status !== "active") {
          auditFailedLogin(attemptedEmail, `account status "${user.status}"`);
          return null;
        }
        if (!user.password) {
          auditFailedLogin(attemptedEmail, "no password set");
          return null;
        }

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.password,
        );
        if (!valid) {
          auditFailedLogin(attemptedEmail, "wrong password");
          return null;
        }

        await prisma.users.update({
          where: { user_id: user.user_id },
          data: { last_login: new Date() },
        });

        const activeEmployment = user.employment[0];

        return {
          id:         user.user_id.toString(),
          email:      user.email,
          name:       titleCaseName(user.user_profile?.full_name) || null,
          role:       user.role.role_type,
          position:   activeEmployment?.position ?? null,
          branchName: activeEmployment?.branch?.branch_name ?? null,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.userId     = (user as { id?: string }).id;
        token.role       = (user as { role?: string }).role;
        token.position   = (user as { position?: string | null }).position;
        token.branchName = (user as { branchName?: string | null }).branchName;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as { id?: unknown }).id           = token.userId;
        (session.user as { role?: unknown }).role       = token.role;
        (session.user as { position?: unknown }).position = token.position;
        (session.user as { branchName?: unknown }).branchName = token.branchName;
      }
      return session;
    },
  },
  events: {
    async signIn(message) {
      const userIdStr = (message.user as { id?: string }).id;
      const userId = userIdStr ? Number.parseInt(userIdStr, 10) : NaN;

      // The session cookie is not set yet at this point, so getAuditActor()
      // would resolve to "system" — stamp the actor from the authorized user.
      const u = message.user as {
        email?: string | null;
        name?: string | null;
        role?: string | null;
      };
      void logAuditEvent({
        action: "LOGIN",
        entity: "users",
        entityId: Number.isFinite(userId) ? userId : null,
        detail: u.email ?? undefined,
        actor: {
          actorId: Number.isFinite(userId) ? userId : null,
          actorEmail: u.email ?? null,
          actorName: u.name ?? null,
          actorRole: u.role ?? null,
          actorType: "user",
        },
      });

      if (!Number.isFinite(userId)) return;

      try {
        const profile = await prisma.induction_profile.findUnique({
          where: { user_id: userId },
          select: { id: true, status: true },
        });
        if (!profile || profile.status !== "Sent") return;

        const existingRequest = await prisma.induction_request.findFirst({
          where: { user_id: userId, status: { not: "completed" } },
          select: { id: true },
        });
        if (existingRequest) return;

        await prisma.induction_request.create({
          data: {
            user_id: userId,
            triggered_by_id: userId,
            status: "pending",
          },
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[auth] induction-request on first login failed:", msg);
      }
    },

    // JWT sessions: the token carries the user, so `message` has `token`
    // rather than `session` — hence the union narrowing.
    async signOut(message) {
      const token = (message as { token?: { userId?: string; role?: string } }).token;
      const userId = token?.userId ? Number.parseInt(token.userId, 10) : NaN;
      void logAuditEvent({
        action: "LOGOUT",
        entity: "users",
        entityId: Number.isFinite(userId) ? userId : null,
        actor: {
          actorId: Number.isFinite(userId) ? userId : null,
          actorRole: token?.role ?? null,
          actorType: "user",
        },
      });
    },
  },
  pages:     { signIn: "/login", error: "/login" },
  session:   { strategy: "jwt" },
  secret:    process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  trustHost: true,
});
