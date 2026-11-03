// 管理员认证核心（PRD FR-6-01/02）
// - 密码：argon2id 哈希存储，不存明文
// - 会话：数据库 Session 表，Cookie 只存 opaque token，登出=删行（FR-6-02）
// 注意：Next 16 中 cookies() 为 async，需 await。
import { cookies } from "next/headers";
import crypto from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { prisma } from "@/lib/prisma";

// ---------- 常量 ----------
export const SESSION_COOKIE = "myblog_admin_session";
const DEFAULT_MAX_AGE = 2 * 60 * 60; // 默认 2 小时
const REMEMBER_MAX_AGE = 7 * 24 * 60 * 60; // 「记住我」7 天

// argon2id 参数（OWASP 建议量级）
const ARGON2_PARAMS = {
  memoryCost: 64 * 1024,
  timeCost: 3,
  parallelism: 4,
} as const;

// ---------- 密码 ----------
export function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2_PARAMS);
}

export async function verifyPassword(
  plain: string,
  storedHash: string
): Promise<boolean> {
  try {
    return await verify(storedHash, plain);
  } catch {
    return false;
  }
}

// ---------- Cookie 选项 ----------
function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production", // 生产 HTTPS 才加 Secure
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

// ---------- 会话 ----------
export async function createSession(
  adminId: number,
  rememberMe: boolean
): Promise<{ token: string; maxAge: number; cookieOptions: ReturnType<typeof cookieOptions> }> {
  const token = crypto.randomBytes(32).toString("hex");
  const maxAge = rememberMe ? REMEMBER_MAX_AGE : DEFAULT_MAX_AGE;
  await prisma.session.create({
    data: {
      id: token,
      adminId,
      rememberMe,
      expiresAt: new Date(Date.now() + maxAge * 1000),
    },
  });
  return { token, maxAge, cookieOptions: cookieOptions(maxAge) };
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  await prisma.session.deleteMany({ where: { id: token } });
}

// 供 server component / route handler 读取当前管理员（实时查库，含过期惰性清理）
export async function getCurrentAdmin() {
  const store = await cookies();
  return getSessionFromToken(store.get(SESSION_COOKIE)?.value);
}

export async function getSessionFromToken(token: string | undefined) {
  if (!token) return null;
  const s = await prisma.session.findUnique({
    where: { id: token },
    include: { admin: true },
  });
  if (!s) return null;
  if (s.expiresAt < new Date()) {
    await destroySession(token); // 惰性清理过期会话
    return null;
  }
  return s;
}
