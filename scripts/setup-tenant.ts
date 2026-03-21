#!/usr/bin/env tsx
/**
 * TeamWox Tenant Setup Script
 *
 * Creates a new tenant's database schema and initial admin user.
 * Run AFTER manually creating the MySQL database.
 *
 * Usage:
 *   npx tsx scripts/setup-tenant.ts \
 *     --db-url="mysql://user:pass@localhost:3306/teamwox_acme" \
 *     --admin-login=admin \
 *     --admin-email=admin@acme.com \
 *     --admin-password=SecurePass123!
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { execSync } from "child_process";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=")];
  })
);

const dbUrl = args["db-url"];
const adminLogin = args["admin-login"] ?? "admin";
const adminEmail = args["admin-email"];
const adminPassword = args["admin-password"];
const adminName = args["admin-name"] ?? "Administrator";

if (!dbUrl || !adminEmail || !adminPassword) {
  console.error("Usage: npx tsx scripts/setup-tenant.ts --db-url=<url> --admin-email=<email> --admin-password=<password>");
  console.error("Options:");
  console.error("  --db-url=<mysql://user:pass@host:port/dbname>  (required)");
  console.error("  --admin-email=<email>                          (required)");
  console.error("  --admin-password=<password>                    (required)");
  console.error("  --admin-login=<login>                          (default: admin)");
  console.error("  --admin-name=<name>                            (default: Administrator)");
  process.exit(1);
}

async function main() {
  console.log("\n TeamWox Tenant Setup\n");
  console.log(`Database: ${dbUrl.replace(/:[^:@]+@/, ":****@")}`);

  // Step 1: Push Prisma schema to tenant DB
  console.log("\n1. Pushing database schema...");
  try {
    execSync(`npx prisma db push --schema=prisma/schema.prisma --accept-data-loss`, {
      env: { ...process.env, DATABASE_URL: dbUrl },
      stdio: "inherit",
    });
    console.log("   Schema pushed successfully");
  } catch {
    console.error("   Failed to push schema. Make sure the database exists and credentials are correct.");
    process.exit(1);
  }

  // Step 2: Create admin user
  console.log("\n2. Creating admin user...");
  const client = new PrismaClient({
    datasources: { db: { url: dbUrl } },
    log: ["error"],
  });

  try {
    const hashedPassword = await bcrypt.hash(adminPassword, 12);

    // Check if user already exists
    const existing = await client.user.findFirst({
      where: { OR: [{ login: adminLogin }, { email: adminEmail }] },
    });

    if (existing) {
      console.log(`   User '${adminLogin}' already exists, updating password...`);
      await client.user.update({
        where: { id: existing.id },
        data: { password: hashedPassword, isAdmin: true, isActive: true },
      });
    } else {
      await client.user.create({
        data: {
          login: adminLogin,
          email: adminEmail,
          password: hashedPassword,
          name: adminName,
          surname: "",
          fullname: adminName,
          isAdmin: true,
          isActive: true,
        },
      });
    }
    console.log(`   Admin user created: ${adminLogin} / ${adminEmail}`);

    // Step 3: Create default system settings
    console.log("\n3. Initializing default settings...");
    await client.systemSetting.upsert({
      where: { key: "app.name" },
      create: { key: "app.name", value: "TeamWox" },
      update: {},
    });
    console.log("   Default settings initialized");

  } finally {
    await client.$disconnect();
  }

  console.log("\nTenant setup complete!\n");
  console.log("Summary:");
  console.log(`   Database URL : ${dbUrl.replace(/:[^:@]+@/, ":****@")}`);
  console.log(`   Admin Login  : ${adminLogin}`);
  console.log(`   Admin Email  : ${adminEmail}`);
  console.log(`   Admin Pass   : ${adminPassword}`);
  console.log("\nRemember to register this tenant in your platform:");
  console.log(`   Administration -> Tenants -> Create New Tenant\n`);
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
