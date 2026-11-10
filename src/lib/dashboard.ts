// 仪表盘数据层（PRD FR-6-08：概览 = 文章总数、评论总数、近 7 天浏览量、最新评论列表）
// 全部直接查库：Post 上的反规范化计数用于展示，ViewEvent 表提供 7 天窗口精确值。
import { prisma } from "@/lib/prisma";

const SEVEN_DAYS_MS = 7 * 24 * 3600 * 1000;

export interface DashboardStats {
  postCounts: Record<string, number>; // status → 数量
  postTotal: number;
  commentTotal: number;
  views7d: number;
  latestComments: Array<{
    id: number;
    nickname: string;
    content: string;
    pinned: boolean;
    createdAt: string; // ISO
    postTitle: string;
    postSlug: string;
  }>;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const [postGroups, commentTotal, views7d, latestComments] = await Promise.all([
    prisma.post.groupBy({ by: ["status"], _count: true }),
    prisma.comment.count(),
    prisma.viewEvent.count({
      where: { createdAt: { gte: new Date(Date.now() - SEVEN_DAYS_MS) } },
    }),
    prisma.comment.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: { post: { select: { title: true, slug: true } } },
    }),
  ]);

  const postCounts: Record<string, number> = {};
  for (const g of postGroups) postCounts[g.status] = g._count;

  return {
    postCounts,
    postTotal: postGroups.reduce((n, g) => n + g._count, 0),
    commentTotal,
    views7d,
    latestComments: latestComments.map((c) => ({
      id: c.id,
      nickname: c.nickname,
      content: c.content,
      pinned: c.pinned,
      createdAt: c.createdAt.toISOString(),
      postTitle: c.post.title,
      postSlug: c.post.slug,
    })),
  };
}
