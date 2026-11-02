// Prisma 客户端单例 —— 优先使用连接池 URL（Prisma Postgres 免费层仅 1 并发直连）
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const url = process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL;

const prisma = globalForPrisma.prisma ?? new PrismaClient({
  datasources: { db: { url } },
});

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export { prisma };
