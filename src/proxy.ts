// Next.js Proxy（Next 16，原 middleware.ts）
// 守卫 /admin：无会话 Cookie 时跳转登录页。
// 说明：仅做「有无 token」的轻量乐观检查，不查库（避免 Edge 查库）；
// 无效/过期 token 由 admin 页面查库兜底 redirect。
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE = "myblog_admin_session";

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 仅保护 /admin 下的非登录路径
  if (!pathname.startsWith("/admin")) return NextResponse.next();
  if (pathname.startsWith("/admin/login")) return NextResponse.next();

  const token = req.cookies.get(COOKIE)?.value;
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
