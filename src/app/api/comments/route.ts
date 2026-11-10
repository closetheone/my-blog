// /api/comments —— GET 读评论（公开）/ POST 发评论（公开 + Origin 校验 + 限流 + 敏感词）
import { NextRequest } from "next/server";
import { HttpError } from "@/lib/posts";
import { checkOrigin } from "@/lib/csrf";
import { listComments, createComment } from "@/lib/comments";

type Body = {
  postId?: unknown;
  parentId?: unknown;
  nickname?: unknown;
  email?: unknown;
  content?: unknown;
  url?: unknown;
};

export async function GET(req: NextRequest) {
  try {
    const raw = req.nextUrl.searchParams.get("postId");
    const postId = raw ? Number(raw) : NaN;
    if (!Number.isInteger(postId) || postId < 1) throw new HttpError(400, "请提供有效文章");
    return Response.json(await listComments(postId));
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const body = (await req.json()) as Body;
    return Response.json(await createComment(req, body));
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
    console.error("[api/comments]", e);
    return Response.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
