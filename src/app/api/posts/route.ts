// /api/posts —— GET 列表（?status= 筛选）/ POST 新建
import { HttpError, createPost, listPosts, requireAdmin, requireAdminRead } from "@/lib/posts";
import type { PostInput } from "@/lib/posts";

export async function GET(req: Request) {
  try {
    await requireAdminRead();
    const status = new URL(req.url).searchParams.get("status");
    const posts = await listPosts(
      status === "draft" || status === "published" || status === "hidden" ? status : undefined
    );
    return Response.json({ posts });
  } catch (e) {
    return toResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin(req);
    let body: PostInput;
    try {
      body = (await req.json()) as PostInput;
    } catch {
      throw new HttpError(400, "请求体格式错误");
    }
    const post = await createPost(body);
    return Response.json({ post }, { status: 201 });
  } catch (e) {
    return toResponse(e);
  }
}

// route 层统一把 HttpError 转 Response（tech 文档 §3.1）
function toResponse(e: unknown) {
  if (e instanceof HttpError) {
    return Response.json({ error: e.message }, { status: e.status });
  }
  console.error("[api/posts]", e);
  return Response.json({ error: "服务器内部错误" }, { status: 500 });
}
