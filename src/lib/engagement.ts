// 点赞 / 浏览量（FR-3-03 / FR-3-05）
//
// 点赞：localStorage 本地去重（前端）+ 进程内内存 Set（IP+postId）服务端校验。
// PV：ViewEvent 表按 IP+文章 1 小时窗口去重（跨实例可靠）。
// PRD 明确「不追求强一致」，内存 Set 在 serverless 多实例下不共享，接受。
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/posts";
import { getClientIp } from "@/lib/rate-limit";

const PV_WINDOW_MS = 60 * 60 * 1000; // 1 小时

// 进程内点赞去重（IP+postId）；上限保护防膨胀
const liked = new Set<string>();

export async function likePost(req: Request, postId: number): Promise<number> {
  if (!Number.isInteger(postId) || postId < 1) throw new HttpError(400, "请提供有效文章");
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { status: true, likesCount: true },
  });
  if (!post || post.status !== "published") throw new HttpError(404, "文章不存在");

  const key = `${getClientIp(req)}:${postId}`;
  if (liked.has(key)) throw new HttpError(409, "已经点过赞了");
  if (liked.size > 10000) liked.clear(); // 简单保护

  const updated = await prisma.post.update({
    where: { id: postId },
    data: { likesCount: { increment: 1 } },
    select: { likesCount: true },
  });
  liked.add(key);
  return updated.likesCount;
}

export async function recordView(req: Request, postId: number): Promise<number> {
  if (!Number.isInteger(postId) || postId < 1) throw new HttpError(400, "请提供有效文章");
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { status: true },
  });
  if (!post || post.status !== "published") throw new HttpError(404, "文章不存在");

  const ip = getClientIp(req);
  const since = new Date(Date.now() - PV_WINDOW_MS);
  const dup = await prisma.viewEvent.findFirst({
    where: { postId, ip, createdAt: { gte: since } },
    select: { id: true },
  });
  if (dup) {
    const p = await prisma.post.findUnique({
      where: { id: postId },
      select: { pvCount: true },
    });
    return p?.pvCount ?? 0;
  }
  await prisma.viewEvent.create({ data: { postId, ip } });
  const updated = await prisma.post.update({
    where: { id: postId },
    data: { pvCount: { increment: 1 } },
    select: { pvCount: true },
  });
  return updated.pvCount;
}
