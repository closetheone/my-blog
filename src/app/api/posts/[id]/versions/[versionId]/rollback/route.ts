// /api/posts/[id]/versions/[versionId]/rollback —— 回滚到指定版本（FR-6-10）
// 回滚 = 一次保存：先对当前内容拍快照（可反悔），再写回目标版本内容。
// 有副作用 → requireAdmin（Origin 同源 + 会话）
// Next 16：动态段参数是 Promise，需 await
import { HttpError, requireAdmin, rollbackPostVersion } from "@/lib/posts";

type Ctx = { params: Promise<{ id: string; versionId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
    const { id: idParam, versionId: versionIdParam } = await ctx.params;
    const id = Number(idParam);
    const versionId = Number(versionIdParam);
    if (!Number.isInteger(id) || id < 1) throw new HttpError(400, "非法的文章 id");
    if (!Number.isInteger(versionId) || versionId < 1) throw new HttpError(400, "非法的版本 id");
    await requireAdmin(req);
    const post = await rollbackPostVersion(id, versionId);
    return Response.json({ post });
  } catch (e) {
    if (e instanceof HttpError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    console.error("[api/posts/[id]/versions/[versionId]/rollback]", e);
    return Response.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
