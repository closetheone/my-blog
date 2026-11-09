// /api/posts/[id]/comments-setting —— PATCH 开/关单篇评论（FR-3-06，requireAdmin）
import { HttpError, requireAdmin } from "@/lib/posts";
import { setCommentsEnabled } from "@/lib/comments";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    await requireAdmin(req);
    const id = Number((await ctx.params).id);
    if (!Number.isInteger(id) || id < 1) throw new HttpError(400, "非法的文章 id");
    const body = (await req.json()) as { enabled?: unknown };
    if (typeof body.enabled !== "boolean") {
      throw new HttpError(400, "请提供 enabled（true/false）");
    }
    const post = await setCommentsEnabled(id, body.enabled);
    return Response.json({ id: post.id, commentsEnabled: post.commentsEnabled });
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
    console.error("[api/posts/[id]/comments-setting]", e);
    return Response.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
