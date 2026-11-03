// /api/posts/[id] —— PUT 更新（不碰 publishedAt，FR-6-07）/ DELETE 删除
// Next 16：动态段参数是 Promise，需 await
import {
  HttpError,
  deletePost,
  requireAdmin,
  unpublishPost,
  updatePost,
} from "@/lib/posts";
import type { PostInput } from "@/lib/posts";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  try {
    const { id: idParam } = await ctx.params;
    const id = Number(idParam);
    if (!Number.isInteger(id) || id < 1) throw new HttpError(400, "非法的文章 id");
    await requireAdmin(req);
    let body: PostInput;
    try {
      body = (await req.json()) as PostInput;
    } catch {
      throw new HttpError(400, "请求体格式错误");
    }
    const post = await updatePost(id, body);
    return Response.json({ post });
  } catch (e) {
    return toResponse(e);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const { id: idParam } = await ctx.params;
    const id = Number(idParam);
    if (!Number.isInteger(id) || id < 1) throw new HttpError(400, "非法的文章 id");
    await requireAdmin(req);
    await deletePost(id);
    return Response.json({ ok: true });
  } catch (e) {
    return toResponse(e);
  }
}

// 下线（published → draft）：编辑器「下线」按钮走这里，
// 不进 PUT，因为 PUT 语义是保存草稿，下线是状态切换的独立动作
export async function POST(req: Request, ctx: Ctx) {
  try {
    const { id: idParam } = await ctx.params;
    const id = Number(idParam);
    if (!Number.isInteger(id) || id < 1) throw new HttpError(400, "非法的文章 id");
    await requireAdmin(req);
    const post = await unpublishPost(id);
    return Response.json({ post });
  } catch (e) {
    return toResponse(e);
  }
}

function toResponse(e: unknown) {
  if (e instanceof HttpError) {
    return Response.json({ error: e.message }, { status: e.status });
  }
  console.error("[api/posts/[id]]", e);
  return Response.json({ error: "服务器内部错误" }, { status: 500 });
}
