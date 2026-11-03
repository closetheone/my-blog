// 管理员登录接口（PRD FR-6-01）
// CSRF 最小防护：同源 Origin 校验 + SameSite=Lax Cookie（不引入 CSRF token，
// 对单管理员同源表单足够）。
import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  createSession,
  verifyPassword,
} from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  // 1) Origin 同源校验（CSRF）
  const origin = req.headers.get("origin");
  if (origin && new URL(req.url).origin !== origin) {
    return Response.json({ error: "CSRF 校验失败" }, { status: 403 });
  }

  // 2) 频率限制
  const ip = getClientIp(req);
  if (!rateLimit(ip)) {
    return Response.json(
      { error: "尝试过于频繁，请稍后再试" },
      { status: 429 }
    );
  }

  // 3) 解析 & 校验输入
  let body: { username?: unknown; password?: unknown; rememberMe?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "请求体格式错误" }, { status: 400 });
  }
  const { username, password, rememberMe } = body;
  if (!username || !password) {
    return Response.json({ error: "请输入账号和密码" }, { status: 400 });
  }

  // 4) 查管理员 + 验密码（统一提示，防账号枚举）
  const admin = await prisma.admin.findUnique({
    where: { username: String(username) },
  });
  if (!admin) {
    return Response.json({ error: "账号或密码错误" }, { status: 401 });
  }
  const ok = await verifyPassword(String(password), admin.password);
  if (!ok) {
    return Response.json({ error: "账号或密码错误" }, { status: 401 });
  }

  // 5) 创建会话 + 写 Cookie
  const { token, maxAge, cookieOptions } = await createSession(
    admin.id,
    Boolean(rememberMe)
  );
  const store = await cookies();
  store.set(SESSION_COOKIE, token, cookieOptions);

  return Response.json({ ok: true, username: admin.username });
}
