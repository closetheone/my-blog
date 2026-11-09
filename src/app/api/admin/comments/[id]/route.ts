// /api/admin/comments/[id] —— PATCH 置顶/取消（{pinned: bool}）/ DELETE 删除
import { HttpError, requireAdmin } from "@/lib/posts";
import { setCommentPinned, deleteComment } from "@/lib/comments";

type Ctx = { params: Promise<{ id: string }> };

function parseId(idParam: string): number {
  const id = Number(idParam);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, "非法的评论 id");
  return id;
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    await requireAdmin(req);
    const id = parseId((await ctx.params).id);
    const body = (await req.json()) as { pinned?: unknown };
    if (typeof body.pinned !== "boolean") throw new HttpError(400, "请提供 pinned（true/false）");
    return Response.json(await setCommentPinned(id, body.pinned));
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
    console.error("[api/admin/comments/[id] PATCH]", e);
    return Response.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    await requireAdmin(req);
    const id = parseId((await ctx.params).id);
    return Response.json(await deleteComment(id));
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
    console.error("[api/admin/comments/[id] DELETE]", e);
    return Response.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
