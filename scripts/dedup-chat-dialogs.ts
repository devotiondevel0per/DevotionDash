/**
 * One-time script: remove duplicate DM chat dialogs.
 * Keeps the most recently updated dialog for each unique member pair,
 * deletes all older duplicates (cascade deletes messages and members).
 *
 * Run with:  npx ts-node --project tsconfig.json scripts/dedup-chat-dialogs.ts
 * Or:        npx tsx scripts/dedup-chat-dialogs.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Fetch all non-external DM dialogs (no group, no subject)
  const dialogs = await prisma.chatDialog.findMany({
    where: { isExternal: false, groupId: null, subject: null },
    include: { members: { select: { userId: true } } },
    orderBy: { updatedAt: "desc" }, // most recent first
  });

  const seen = new Map<string, string>(); // key → dialogId to keep
  const toDelete: string[] = [];

  for (const dialog of dialogs) {
    if (dialog.members.length !== 2) continue; // only DMs

    const key = dialog.members
      .map((m) => m.userId)
      .sort()
      .join(":");

    if (seen.has(key)) {
      // Already have a more-recent dialog for this pair — delete this one
      toDelete.push(dialog.id);
    } else {
      seen.set(key, dialog.id);
    }
  }

  if (toDelete.length === 0) {
    console.log("No duplicate DM dialogs found.");
    return;
  }

  console.log(`Found ${toDelete.length} duplicate dialog(s). Deleting...`);

  // Delete members first (cascade would handle this, but being explicit)
  await prisma.chatMessage.deleteMany({ where: { dialogId: { in: toDelete } } });
  await prisma.chatDialogMember.deleteMany({ where: { dialogId: { in: toDelete } } });
  await prisma.chatDialog.deleteMany({ where: { id: { in: toDelete } } });

  console.log(`Deleted ${toDelete.length} duplicate dialog(s). Done.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
