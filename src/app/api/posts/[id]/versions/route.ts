// /api/posts/[id]/versions —— 版本历史列表（FR-6-10）
// 只读，无副作用：requireAdminRead（不校验 Origin）
// Next 16：动态段参数是 Promise，需 await
import { HttpError, listPostVersions, requireAdminRead } from "@/lib/posts";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { id: idParam } = await ctx.params;
    const id = Number(idParam);
    if (!Number.isInteger(id) || id < 1) throw new HttpError(400, "非法的文章 id");
    await requireAdminRead();
    const versions = await listPostVersions(id);
    return Response.json({ versions });
  } catch (e) {
    if (e instanceof HttpError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    console.error("[api/posts/[id]/versions]", e);
    return Response.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
