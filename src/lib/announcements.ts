import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

// Company-wide announcements (bulletin board), stored in the hrfs DB in the
// additive `announcement` table. Images are kept inline as a data URL.

export type Announcement = {
  id: number;
  title: string;
  body: string;
  imageData: string | null; // data: URL or null
  createdByName: string | null;
  createdAt: string; // ISO
};

type RawRow = {
  id: number;
  title: string;
  body: string;
  image_data: string | null;
  created_by_name: string | null;
  created_at: Date;
};

const SELECT = Prisma.sql`id::int AS id, title, body, image_data, created_by_name, created_at`;
// Cap the stored image so a runaway upload can't bloat the row (~1.5MB data URL).
export const MAX_IMAGE_CHARS = 2_000_000;

function mapRow(r: RawRow): Announcement {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    imageData: r.image_data,
    createdByName: r.created_by_name,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

let ensured: Promise<void> | null = null;
export function ensureAnnouncementTable(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      await prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS announcement (
           id BIGSERIAL PRIMARY KEY,
           title TEXT NOT NULL,
           body TEXT NOT NULL,
           image_data TEXT,
           created_by_email TEXT,
           created_by_name TEXT,
           created_at TIMESTAMPTZ NOT NULL DEFAULT now()
         )`,
      );
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS idx_announcement_created ON announcement (created_at DESC)`,
      );
    })().catch((e) => {
      ensured = null;
      throw e;
    });
  }
  return ensured;
}

export async function listAnnouncements(): Promise<Announcement[]> {
  await ensureAnnouncementTable();
  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT ${SELECT} FROM announcement ORDER BY created_at DESC, id DESC LIMIT 100`);
  return rows.map(mapRow);
}

export async function createAnnouncement(args: {
  title: string;
  body: string;
  imageData: string | null;
  byEmail: string;
  byName: string | null;
}): Promise<Announcement> {
  await ensureAnnouncementTable();
  const { title, body, imageData, byEmail, byName } = args;
  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    INSERT INTO announcement (title, body, image_data, created_by_email, created_by_name)
    VALUES (${title}, ${body}, ${imageData}, ${byEmail}, ${byName})
    RETURNING ${SELECT}`);
  return mapRow(rows[0]);
}

export async function updateAnnouncement(
  id: number,
  args: { title: string; body: string; imageData: string | null },
): Promise<Announcement | null> {
  await ensureAnnouncementTable();
  const { title, body, imageData } = args;
  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    UPDATE announcement
       SET title = ${title}, body = ${body}, image_data = ${imageData}
     WHERE id = ${id}
    RETURNING ${SELECT}`);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function deleteAnnouncement(id: number): Promise<void> {
  await ensureAnnouncementTable();
  await prisma.$executeRaw(Prisma.sql`DELETE FROM announcement WHERE id = ${id}`);
}
