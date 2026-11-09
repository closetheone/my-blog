// CSRF Origin 同源校验（V2.1：公开写接口 评论/点赞/PV 共用）
//
// 模式照抄 posts.ts 的 requireAdmin：浏览器跨站 POST 会带 Origin 头，
// Origin 与本站不一致即拒；curl 等不带 Origin 的调用放行（个人博客量级，
// 与 requireAdmin 既有行为一致）。
//
// 独立成模块是因为 requireAdmin 把 Origin 校验和会话校验绑在一起，
// 公开接口没有会话，需要单独拿 Origin 这一半。
import { HttpError } from "@/lib/posts";

export function checkOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && new URL(req.url).origin !== origin) {
    throw new HttpError(403, "CSRF 校验失败");
  }
}
