// /api/pv —— POST 浏览量上报（公开 + Origin 校验；IP+文章 1h 窗口去重）
import { HttpError } from "@/lib/posts";
import { checkOrigin } from "@/lib/csrf";
import { recordView } from "@/lib/engagement";

export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const body = (await req.json()) as { postId?: unknown };
    const postId = Number(body.postId);
    return Response.json({ pvCount: await recordView(req, postId) });
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
    console.error("[api/pv]", e);
    return Response.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
