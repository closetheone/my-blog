// 管理员改密接口（PRD FR-6-12）
// - 只改当前会话对应的管理员，不接受任何账号参数
// - 会话策略：其他会话全部失效，当前会话延续（不刷新 Cookie，见 docs/tech-管理员改密.md §0）
// - CSRF 最小防护：同源 Origin 校验 + SameSite=Lax（与登录接口一致）
import { cookies } from "next/headers";
import {
  getCurrentAdmin,
  hashPassword,
  invalidateAllSessionsExcept,
  validateNewPassword,
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

  // 2) 频率限制（防连续试错原密码）
  const ip = getClientIp(req);
  if (!rateLimit(ip)) {
    return Response.json(
      { error: "尝试过于频繁，请稍后再试" },
      { status: 429 }
    );
  }

  // 3) 身份（无会话直接 401）
  const s = await getCurrentAdmin();
  if (!s) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }
  const token = s.id;

  // 4) 解析 & 校验输入
  let body: { currentPassword?: unknown; newPassword?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "请求体格式错误" }, { status: 400 });
  }
  const { currentPassword, newPassword } = body;
  if (!currentPassword || !newPassword) {
    return Response.json(
      { error: "请输入原密码和新密码" },
      { status: 400 }
    );
  }

  // 5) 验证原密码
  const ok = await verifyPassword(
    String(currentPassword),
    s.admin.password
  );
  if (!ok) {
    return Response.json({ error: "原密码错误" }, { status: 401 });
  }

  // 6) 新密码强度校验
  const check = validateNewPassword(String(newPassword));
  if (!check.ok) {
    return Response.json({ error: check.error }, { status: 400 });
  }

  // 7) 新密码不能与原密码相同（防"改密"被用来确认当前密码）
  const same = await verifyPassword(String(newPassword), s.admin.password);
  if (same) {
    return Response.json(
      { error: "新密码不能与原密码相同" },
      { status: 400 }
    );
  }

  // 8) 落库 + 会话处理
  // 取舍：不包 $transaction。若第 8 步写库成功、第 9 步进程被杀，
  // 后果是旧会话短暂存活（直到过期），但密码已换新——方向是安全的，
  // 不存在"密码没改但会话已清"的锁死分支。
  const newHash = await hashPassword(String(newPassword));
  await prisma.admin.update({
    where: { id: s.admin.id },
    data: { password: newHash },
  });
  await invalidateAllSessionsExcept(s.admin.id, token);
  // 当前会话不刷新：token 不变、行还在、expiresAt 不变（PRD 允许延续）

  return Response.json({ ok: true });
}
