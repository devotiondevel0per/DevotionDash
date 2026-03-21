import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding...");
  const password = await bcrypt.hash("admin123", 12);

  await prisma.user.upsert({
    where: { login: "admin" },
    update: { email: "admin@teamwox.local", password, name: "Admin", surname: "User", fullname: "Admin User", isAdmin: true, isActive: true },
    create: { login: "admin", email: "admin@teamwox.local", password, name: "Admin", surname: "User", fullname: "Admin User", isAdmin: true, isActive: true },
  });

  for (const [key, value] of [
    ["app.name", "TeamWox"],
    ["app.tagline", "Workspace"],
  ] as const) {
    await prisma.systemSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  console.log("Done. Credentials: admin / admin123");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
