import { prisma } from "./src/lib/prisma";
import { buildUserAccess } from "./src/lib/rbac";
import { MODULE_TOGGLES_KEY } from "./src/lib/admin-config";

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, fullname: true, email: true, isActive: true, isAdmin: true },
    orderBy: { name: "asc" },
  });

  const modulesSetting = await prisma.systemSetting.findUnique({
    where: { key: MODULE_TOGGLES_KEY },
    select: { value: true },
  });

  const rows: Array<Record<string, unknown>> = [];
  for (const user of users) {
    const access = await buildUserAccess(user.id);
    rows.push({
      id: user.id,
      name: user.fullname || user.name,
      email: user.email,
      isActive: user.isActive,
      isAdmin: user.isAdmin,
      chatRead: access?.permissions.chat.read ?? false,
      chatWrite: access?.permissions.chat.write ?? false,
      chatManage: access?.permissions.chat.manage ?? false,
      teamRead: access?.permissions.team.read ?? false,
    });
  }

  console.log(JSON.stringify({
    totalUsers: users.length,
    moduleToggleRaw: modulesSetting?.value ?? null,
    users: rows,
  }, null, 2));
}

main().finally(async () => {
  await prisma.$disconnect();
});
