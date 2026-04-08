import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

/** Platform DB client — always points to DATABASE_URL (the master registry DB). */
export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    transactionOptions: {
      // Avoid frequent P2028 on heavier interactive transactions.
      maxWait: 10_000,
      timeout: 120_000,
    },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
