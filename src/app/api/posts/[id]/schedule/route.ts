// /api/posts/[id]/schedule —— 定时发布（FR-6-06）
// POST: 设置定时发布时间
// DELETE: 取消定时发布
import { HttpError, schedulePost, cancelSchedulePost, requireAdmin } from "@/lib/posts";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
    const { id: idParam } = await ctx.params;
    const id = Number(idParam);
    if (!Number.isInteger(id) || id < 1) throw new HttpError(400, "非法的文章 id");
    await requireAdmin(req);
    const body = (await req.json()) as { scheduledFor?: unknown };
    if (typeof body.scheduledFor !== "string" || isNaN(Date.parse(body.scheduledFor))) {
      throw new HttpError(400, "请提供有效的定时发布时间（ISO 格式）");
    }
    const scheduledFor = new Date(body.scheduledFor);
    const post = await schedulePost(id, scheduledFor);
    return Response.json({ post });
  } catch (e) {
    if (e instanceof HttpError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    console.error("[api/posts/[id]/schedule]", e);
    return Response.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const { id: idParam } = await ctx.params;
    const id = Number(idParam);
    if (!Number.isInteger(id) || id < 1) throw new HttpError(400, "非法的文章 id");
    await requireAdmin(req);
    const post = await cancelSchedulePost(id);
    return Response.json({ post });
  } catch (e) {
    if (e instanceof HttpError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    console.error("[api/posts/[id]/schedule DELETE]", e);
    return Response.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
