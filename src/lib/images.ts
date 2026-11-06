// 图片管理核心逻辑（PRD FR-6-05）
// 存储：Vercel Blob（serverless，返回公网 URL，天然支持跨文章复用）。
// 压缩：sharp 服务端统一处理（jpeg/png/webp resize 长边 ≤1920 + 质量 80 重编码；gif 不压缩）。
// 鉴权/CSRF 复用 posts.ts 的 requireAdmin（上传与删除均要求管理员 + Origin 校验）。
import { put, del, type PutBlobResult } from "@vercel/blob";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { HttpError, requireAdmin, requireAdminRead } from "@/lib/posts";

const MAX_BYTES = 5 * 1024 * 1024; // 5MB（PRD）
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_EDGE = 1920;
const JPEG_QUALITY = 80;

export interface ImageListItem {
  id: number;
  url: string;
  filename: string;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
  usedByThisPost: boolean;
}

function getBlobToken(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new HttpError(500, "服务端未配置 BLOB_READ_WRITE_TOKEN");
  return token;
}

/** 压缩（gif 原样返回）：resize 长边 ≤1920，jpeg/webp 质量 80 重编码 */
async function compress(buf: Buffer, mimeType: string): Promise<{ buf: Buffer; mimeType: string; width: number; height: number }> {
  if (mimeType === "image/gif") {
    const meta = await sharp(buf).metadata();
    return { buf, mimeType, width: meta.width ?? 0, height: meta.height ?? 0 };
  }
  const pipeline = sharp(buf).rotate().resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true });
  if (mimeType === "image/png") {
    const out = await pipeline.webp({ quality: JPEG_QUALITY }).toBuffer({ resolveWithObject: true });
    return { buf: out.data, mimeType: "image/webp", width: out.info.width, height: out.info.height };
  }
  // jpeg / webp
  const out = await pipeline.toBuffer({ resolveWithObject: true });
  return { buf: out.data, mimeType, width: out.info.width, height: out.info.height };
}

/** 上传 + 落库（不关联文章；关联走 associate，规避新建文章 id 时序） */
export async function uploadImage(req: Request) {
  await requireAdmin(req);
  const token = getBlobToken();

  const form = await req.formData().catch(() => {
    throw new HttpError(400, "请求体需为 multipart/form-data");
  });
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "缺少文件（字段名 file）");
  if (!ALLOWED_MIME.has(file.type)) throw new HttpError(400, "仅支持 JPEG / PNG / WebP / GIF");
  if (file.size > MAX_BYTES) throw new HttpError(400, "图片超过 5MB 限制");
  if (file.size === 0) throw new HttpError(400, "文件为空");

  const raw = Buffer.from(await file.arrayBuffer());
  let result: { buf: Buffer; mimeType: string; width: number; height: number };
  try {
    result = await compress(raw, file.type);
  } catch {
    throw new HttpError(400, "图片解码失败，文件可能已损坏");
  }

  const ext = result.mimeType === "image/jpeg" ? "jpg" : result.mimeType === "image/png" ? "png" : result.mimeType.split("/")[1];
  const rand = Math.random().toString(36).slice(2, 8);
  const key = `posts/${Date.now()}-${rand}.${ext}`;
  const blob: PutBlobResult = await put(key, result.buf, {
    access: "public",
    token,
    contentType: result.mimeType,
    addRandomSuffix: false,
  });

  const image = await prisma.postImage.create({
    data: {
      url: blob.url,
      filename: file.name || key,
      mimeType: result.mimeType,
      width: result.width,
      height: result.height,
      sizeBytes: result.buf.length, // 压缩后字节数
    },
  });
  return { id: image.id, url: image.url };
}

/** 图库列表；postId 存在时标记本文章已关联 */
export async function listImages(postId?: number) {
  await requireAdminRead();
  const images = await prisma.postImage.findMany({ orderBy: { id: "desc" } });
  const used = new Set(
    (await prisma.postImageRelation.findMany({ where: { postId }, select: { imageId: true } })).map((r) => r.imageId),
  );
  return images.map((i) => ({
    id: i.id,
    url: i.url,
    filename: i.filename,
    mimeType: i.mimeType,
    width: i.width,
    height: i.height,
    sizeBytes: i.sizeBytes,
    usedByThisPost: used.has(i.id),
  })) as ImageListItem[];
}

/** 关联（幂等 upsert；urls 为 Blob URL 列表）——保存成功后由前端补传，新建/编辑统一 */
export async function associateImages(req: Request) {
  await requireAdmin(req);
  const body = (await req.json().catch(() => null)) as { postId?: unknown; urls?: unknown } | null;
  const postId = Number(body?.postId);
  const urls = Array.isArray(body?.urls) ? (body?.urls as unknown[]).filter((u): u is string => typeof u === "string") : null;
  if (!Number.isInteger(postId) || !urls) throw new HttpError(400, "需要 postId 和 urls[]");

  const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
  if (!post) throw new HttpError(404, "文章不存在");

  const images = await prisma.postImage.findMany({ where: { url: { in: urls } } });
  for (const img of images) {
    await prisma.postImageRelation.upsert({
      where: { postId_imageId: { postId, imageId: img.id } },
      create: { postId, imageId: img.id },
      update: {},
    });
  }
  return { associated: images.length };
}

/** 删图：清关联 + 删 Blob + 删行 */
export async function deleteImage(req: Request, id: number) {
  await requireAdmin(req);
  const image = await prisma.postImage.findUnique({ where: { id } });
  if (!image) throw new HttpError(404, "图片不存在");

  await prisma.postImageRelation.deleteMany({ where: { imageId: id } });
  await prisma.postImage.delete({ where: { id } });
  // Blob 删除失败不阻塞（DB 已清，残留对象无害）
  try {
    await del(image.url, { token: getBlobToken() });
  } catch {
    // ignore
  }
  return { ok: true };
}
