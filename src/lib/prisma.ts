// Prisma 客户端单例 —— 优先使用连接池 URL（Prisma Postgres 免费层仅 1 并发直连）
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// 每个 worker 进程限制 1 条连接：Next build 的 page-data 阶段会起 7 个 worker
// 各自 new PrismaClient（默认池上限 15），7×15 会挤爆免费层池（10 并发）→
// build 时随机 "fetch connection timeout"。限到 1 后 7 进程共 7 连接，安全。
function withConnectionLimit(url: string | undefined): string | undefined {
  if (!url) return url;
  if (url.includes("connection_limit=")) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}connection_limit=1`;
}

const url = withConnectionLimit(process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL);

const prisma = globalForPrisma.prisma ?? new PrismaClient({
  datasources: { db: { url } },
});

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export { prisma };
