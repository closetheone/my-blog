// /api/posts/preview —— 实时预览渲染（FR-6-11）
// 静态段优先级高于动态段 [id]，不会撞路由。
// 只读、无副作用：鉴权不校验 Origin（requireAdminRead）。
import { HttpError, requireAdminRead } from "@/lib/posts";
import { renderContent } from "@/lib/render-content";

export async function POST(req: Request) {
  try {
    await requireAdminRead();
    let body: { title?: unknown; excerpt?: unknown; content?: unknown };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      throw new HttpError(400, "请求体格式错误");
    }
    const content = typeof body.content === "string" ? body.content : "";
    const title = typeof body.title === "string" ? body.title : "";
    const excerpt = typeof body.excerpt === "string" ? body.excerpt : "";
    const { html, toc, readingMinutes } = await renderContent(content);
    return Response.json({ html, toc, readingMinutes, title, excerpt });
  } catch (e) {
    if (e instanceof HttpError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    console.error("[api/posts/preview]", e);
    return Response.json({ error: "渲染失败" }, { status: 500 });
  }
}
