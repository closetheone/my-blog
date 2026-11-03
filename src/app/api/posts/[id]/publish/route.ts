// /api/posts/[id]/publish —— 发布（检查单语义的落库动作）
// publishedAt 为空才写入；refreshPublishedAt=true 才刷新（FR-6-07）
import { HttpError, publishPost, requireAdmin } from "@/lib/posts";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
    const { id: idParam } = await ctx.params;
    const id = Number(idParam);
    if (!Number.isInteger(id) || id < 1) throw new HttpError(400, "非法的文章 id");
    await requireAdmin(req);
    let body: { refreshPublishedAt?: unknown } = {};
    try {
      body = (await req.json()) as { refreshPublishedAt?: unknown };
    } catch {
      body = {};
    }
    const post = await publishPost(id, {
      refreshPublishedAt: Boolean(body.refreshPublishedAt),
    });
    return Response.json({ post });
  } catch (e) {
    if (e instanceof HttpError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    console.error("[api/posts/[id]/publish]", e);
    return Response.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
