// POST 关联文章与图片（{postId, urls[]}，幂等 upsert；保存成功后前端补传）
import { NextRequest } from "next/server";
import { HttpError } from "@/lib/posts";
import { associateImages } from "@/lib/images";

export async function POST(req: NextRequest) {
  try {
    return Response.json(await associateImages(req));
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
