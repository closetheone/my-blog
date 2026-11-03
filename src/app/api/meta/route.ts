// /api/meta —— GET 编辑器下拉数据（现有分类/标签）；POST 新建标签（按 slug upsert）
import { HttpError, requireAdmin, requireAdminRead, upsertTag } from "@/lib/posts";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await requireAdminRead();
    const [categories, tags] = await Promise.all([
      prisma.category.findMany({
        select: { id: true, name: true },
        orderBy: { id: "asc" },
      }),
      prisma.tag.findMany({
        select: { id: true, name: true },
        orderBy: { id: "asc" },
      }),
    ]);
    return Response.json({ categories, tags });
  } catch (e) {
    if (e instanceof HttpError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    console.error("[api/meta]", e);
    return Response.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

// 新建标签：编辑器允许输入新标签名；分类只允许从现有列表选
export async function POST(req: Request) {
  try {
    await requireAdmin(req);
    let body: { name?: unknown };
    try {
      body = (await req.json()) as { name?: unknown };
    } catch {
      throw new HttpError(400, "请求体格式错误");
    }
    if (typeof body.name !== "string" || !body.name.trim()) {
      throw new HttpError(400, "标签名不能为空");
    }
    if (body.name.trim().length > 50) {
      throw new HttpError(400, "标签名过长");
    }
    const tag = await upsertTag(body.name);
    if (!tag) throw new HttpError(400, "标签名不能为空");
    return Response.json({ tag: { id: tag.id, name: tag.name } });
  } catch (e) {
    if (e instanceof HttpError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    console.error("[api/meta POST]", e);
    return Response.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
