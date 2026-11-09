// /api/admin/comments —— GET 评论列表（requireAdmin，?postId= ?q= 过滤）
import { HttpError, requireAdminRead } from "@/lib/posts";
import { listAdminComments } from "@/lib/comments";

export async function GET(req: Request) {
  try {
    await requireAdminRead();
    const url = new URL(req.url);
    const rawPostId = url.searchParams.get("postId");
    const postId = rawPostId ? Number(rawPostId) : undefined;
    if (postId !== undefined && (!Number.isInteger(postId) || postId < 1)) {
      throw new HttpError(400, "请提供有效文章 id");
    }
    const q = url.searchParams.get("q") ?? undefined;
    return Response.json(await listAdminComments({ postId, q }));
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
    console.error("[api/admin/comments]", e);
    return Response.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
