import { prisma } from "../src/lib/prisma";

// Separate from this directory's own seed.ts (that one seeds disposable
// induction mock/demo data, deleting and recreating on every run) — this
// seeds real, permanent reference data (the actual Exit > Clearance
// checklist catalog) and is idempotent instead: skips a table entirely if
// it already has rows, so it's safe to keep around and re-run against a
// fresh environment rather than a delete-then-recreate script.
//
// One-time seed — the 5 fixed items per checklist, as global rows
// (user_id: null), per explicit spec (see conversation). Idempotent: skips
// a table entirely if it already has any rows, so re-running this is safe.
const KNOWLEDGE_TRANSFER_ITEMS = [
  "Handover document prepared and shared with successor",
  "Ongoing tasks and projects reassigned",
  "Knowledge transfer session conducted with successor / team",
  "Project files, credentials, and documentation locations shared",
  "Client / vendor contact list handed over to team",
];

const ASSET_RECOVERY_ITEMS = [
  "Company laptop / desktop returned",
  "Company mobile phone / SIM returned",
  "Access card / ID badge returned",
  "Uniform / PPE returned",
  "Other company assets (keys, tools, equipment) returned",
];

const SYSTEM_REVOCATION_ITEMS = [
  "Company email account access revoked",
  "VPN / network access revoked",
  "Software licenses and internal system accounts revoked",
  "Building / server room access revoked",
  "Third-party / vendor system accounts revoked",
];

async function seed(
  label: string,
  items: string[],
  create: (data: { label: string; sort_order: number }) => Promise<unknown>,
  count: () => Promise<number>,
) {
  const existing = await count();
  if (existing > 0) {
    console.log(`${label}: already has ${existing} row(s), skipping`);
    return;
  }
  for (let i = 0; i < items.length; i++) {
    await create({ label: items[i], sort_order: i });
  }
  console.log(`${label}: inserted ${items.length} global items`);
}

async function main() {
  await seed(
    "exit_knowledge_transfer_item",
    KNOWLEDGE_TRANSFER_ITEMS,
    (data) => prisma.exit_knowledge_transfer_item.create({ data }),
    () => prisma.exit_knowledge_transfer_item.count(),
  );
  await seed(
    "exit_asset_recovery_item",
    ASSET_RECOVERY_ITEMS,
    (data) => prisma.exit_asset_recovery_item.create({ data }),
    () => prisma.exit_asset_recovery_item.count(),
  );
  await seed(
    "exit_system_revocation_item",
    SYSTEM_REVOCATION_ITEMS,
    (data) => prisma.exit_system_revocation_item.create({ data }),
    () => prisma.exit_system_revocation_item.count(),
  );
}

main().finally(() => prisma.$disconnect());
