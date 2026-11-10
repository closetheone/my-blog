// /api/like —— POST 点赞（公开 + Origin 校验；localStorage + 内存 Set 双去重）
import { HttpError } from "@/lib/posts";
import { checkOrigin } from "@/lib/csrf";
import { likePost } from "@/lib/engagement";

export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const body = (await req.json()) as { postId?: unknown };
    const postId = Number(body.postId);
    return Response.json({ likesCount: await likePost(req, postId) });
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
    console.error("[api/like]", e);
    return Response.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
