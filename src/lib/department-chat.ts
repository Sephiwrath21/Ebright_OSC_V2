import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

// Department chat history, stored in the hrfs DB (same DB as auth) in the
// additive `department_chat_message` table. recipient_email NULL = a message to
// "Everyone" in the department; otherwise it's a private 1-on-1.

export type ChatMsg = {
  id: number;
  dept: string;
  senderEmail: string;
  senderName: string | null;
  recipientEmail: string | null; // null = Everyone
  body: string;
  createdAt: string; // ISO
  edited: boolean;
};

type RawRow = {
  id: number;
  dept: string;
  sender_email: string;
  sender_name: string | null;
  recipient_email: string | null;
  body: string;
  created_at: Date;
  edited: boolean;
};

const MAX = 200;
const SELECT = Prisma.sql`id::int AS id, dept, sender_email, sender_name, recipient_email, body, created_at, (edited_at IS NOT NULL) AS edited`;

function mapRow(r: RawRow): ChatMsg {
  return {
    id: r.id,
    dept: r.dept,
    senderEmail: r.sender_email,
    senderName: r.sender_name,
    recipientEmail: r.recipient_email,
    body: r.body,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    edited: !!r.edited,
  };
}

// Create the table the first time it's needed (idempotent, additive). Cached so
// the DDL only runs once per server process.
let ensured: Promise<void> | null = null;
export function ensureChatTable(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      await prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS department_chat_message (
           id BIGSERIAL PRIMARY KEY,
           dept TEXT NOT NULL,
           sender_email TEXT NOT NULL,
           sender_name TEXT,
           recipient_email TEXT,
           body TEXT NOT NULL,
           created_at TIMESTAMPTZ NOT NULL DEFAULT now()
         )`,
      );
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS idx_dcm_dept_created ON department_chat_message (dept, created_at)`,
      );
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS idx_dcm_recipient ON department_chat_message (recipient_email, created_at)`,
      );
      await prisma.$executeRawUnsafe(
        `ALTER TABLE department_chat_message ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ`,
      );
    })().catch((e) => {
      ensured = null; // allow retry on next call
      throw e;
    });
  }
  return ensured;
}

/** Messages in one conversation: Everyone (withEmail null) or private with a person. */
export async function listConversation(
  dept: string,
  me: string,
  withEmail: string | null,
): Promise<ChatMsg[]> {
  await ensureChatTable();
  const meL = me.toLowerCase();
  const rows =
    withEmail == null
      ? await prisma.$queryRaw<RawRow[]>(Prisma.sql`
          SELECT ${SELECT} FROM department_chat_message
          WHERE dept = ${dept} AND recipient_email IS NULL
          ORDER BY id DESC LIMIT ${MAX}`)
      : await prisma.$queryRaw<RawRow[]>(Prisma.sql`
          SELECT ${SELECT} FROM department_chat_message
          WHERE dept = ${dept}
            AND ((lower(sender_email) = ${meL} AND lower(recipient_email) = ${withEmail.toLowerCase()})
              OR (lower(sender_email) = ${withEmail.toLowerCase()} AND lower(recipient_email) = ${meL}))
          ORDER BY id DESC LIMIT ${MAX}`);
  return rows.reverse().map(mapRow); // chronological
}

/** New messages addressed to me (private to me OR Everyone) from others, id > sinceId. */
export async function listInbox(dept: string, me: string, sinceId: number): Promise<ChatMsg[]> {
  await ensureChatTable();
  const meL = me.toLowerCase();
  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT ${SELECT} FROM department_chat_message
    WHERE dept = ${dept} AND id > ${sinceId}
      AND lower(sender_email) <> ${meL}
      AND (recipient_email IS NULL OR lower(recipient_email) = ${meL})
    ORDER BY id ASC LIMIT ${MAX}`);
  return rows.map(mapRow);
}

/** Highest message id in a department (baseline for notification polling). */
export async function maxMessageId(dept: string): Promise<number> {
  await ensureChatTable();
  const rows = await prisma.$queryRaw<Array<{ max: number | null }>>(Prisma.sql`
    SELECT max(id)::int AS max FROM department_chat_message WHERE dept = ${dept}`);
  return rows[0]?.max ?? 0;
}

/** Edit your own message. Returns the updated row, or null if not yours. */
export async function editMessage(id: number, me: string, body: string): Promise<ChatMsg | null> {
  await ensureChatTable();
  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    UPDATE department_chat_message
       SET body = ${body}, edited_at = now()
     WHERE id = ${id} AND lower(sender_email) = ${me.toLowerCase()}
    RETURNING ${SELECT}`);
  return rows[0] ? mapRow(rows[0]) : null;
}

/** Unsend (delete) your own message. Returns true if a row was removed. */
export async function deleteMessage(id: number, me: string): Promise<boolean> {
  await ensureChatTable();
  const rows = await prisma.$queryRaw<Array<{ id: number }>>(Prisma.sql`
    DELETE FROM department_chat_message
     WHERE id = ${id} AND lower(sender_email) = ${me.toLowerCase()}
    RETURNING id::int AS id`);
  return rows.length > 0;
}

export async function sendMessage(args: {
  dept: string;
  senderEmail: string;
  senderName: string | null;
  recipientEmail: string | null;
  body: string;
}): Promise<ChatMsg> {
  await ensureChatTable();
  const { dept, senderEmail, senderName, recipientEmail, body } = args;
  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    INSERT INTO department_chat_message (dept, sender_email, sender_name, recipient_email, body)
    VALUES (${dept}, ${senderEmail}, ${senderName}, ${recipientEmail}, ${body})
    RETURNING ${SELECT}`);
  return mapRow(rows[0]);
}
