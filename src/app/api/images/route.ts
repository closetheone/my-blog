// POST 上传（multipart/form-data，仅管理员）/ GET 图库列表（?postId= 标记已关联）
import { NextRequest } from "next/server";
import { HttpError } from "@/lib/posts";
import { listImages, uploadImage } from "@/lib/images";

export async function POST(req: NextRequest) {
  try {
    return Response.json(await uploadImage(req));
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

export async function GET(req: NextRequest) {
  try {
    const raw = req.nextUrl.searchParams.get("postId");
    const postId = raw ? Number(raw) : undefined;
    return Response.json(await listImages(postId));
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
