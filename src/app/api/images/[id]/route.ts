// DELETE 删图（清关联 + 删 Blob + 删行，仅管理员）
import { NextRequest } from "next/server";
import { HttpError } from "@/lib/posts";
import { deleteImage } from "@/lib/images";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const imageId = Number(id);
    if (!Number.isInteger(imageId)) return Response.json({ error: "无效的图片 ID" }, { status: 400 });
    return Response.json(await deleteImage(req, imageId));
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
