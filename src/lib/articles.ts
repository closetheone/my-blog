// 文章数据读取层 —— V2.0 实现：读取 PostgreSQL（Prisma）
// 页面调用方零改动，接口签名与 V1.0 保持一致。

import { prisma } from "./prisma";

export type PostStatus = "draft" | "published" | "hidden";

export interface Post {
  slug: string;
  title: string;
  date: string; // ISO 日期 YYYY-MM-DD
  excerpt: string;
  category: string;
  tags: string[];
  status: PostStatus;
  pinned?: boolean;
  content: string; // Markdown 原文（不含 front-matter）
}

/** 将 Prisma Post 记录映射为前端 Post 接口 */
function mapPost(record: {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  status: string;
  pinned: boolean;
  publishedAt: Date | null;
  category: { name: string };
  tags: { tag: { name: string } }[];
}): Post {
  // 优先用 publishedAt（发布时间），fallback 到当天
  const date = record.publishedAt
    ? record.publishedAt.toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  return {
    slug: record.slug,
    title: record.title,
    date,
    excerpt: record.excerpt,
    category: record.category.name,
    tags: record.tags.map((t) => t.tag.name),
    status: record.status as PostStatus,
    pinned: record.pinned,
    content: record.content,
  };
}

/** 全部文章（含草稿/隐藏），按发布时间倒序 */
export async function getAllPosts(): Promise<Post[]> {
  const records = await prisma.post.findMany({
    include: { category: true, tags: { include: { tag: true } } },
    orderBy: { publishedAt: { sort: "desc", nulls: "last" } },
  });
  return records.map(mapPost);
}

/** 仅已发布文章（前台可见），按发布时间倒序 */
export async function getPublishedPosts(): Promise<Post[]> {
  const records = await prisma.post.findMany({
    where: { status: "published" },
    include: { category: true, tags: { include: { tag: true } } },
    orderBy: { publishedAt: { sort: "desc", nulls: "last" } },
  });
  return records.map(mapPost);
}

export async function getPostBySlug(slug: string): Promise<Post | null> {
  const record = await prisma.post.findUnique({
    where: { slug },
    include: { category: true, tags: { include: { tag: true } } },
  });
  if (!record) return null;
  return mapPost(record);
}

/** 字数统计（中文按字计、英文按词计的粗略近似），用于计算阅读时长 */
export function wordCount(content: string): number {
  const cjk = content.match(/[一-龥]/g)?.length ?? 0;
  const words = content
    .replace(/[一-龥]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
  return cjk + words;
}

/** 预计阅读时长（分钟），按 PRD 规定 400 字/分钟，向上取整 */
export function readingMinutes(content: string): number {
  return Math.max(1, Math.ceil(wordCount(content) / 400));
}

/**
 * 上一篇/下一篇（PRD FR-1-04）：在已发布文章（须按日期倒序）中找相邻两篇。
 * prev = 更新的一篇（列表中靠前的），next = 更早的一篇（列表中靠后的）。
 * 首篇没有 prev、末篇没有 next。纯函数，便于单测。
 */
export function getAdjacentPosts(
  posts: Pick<Post, "slug">[],
  slug: string,
): { prev: Pick<Post, "slug"> | undefined; next: Pick<Post, "slug"> | undefined } {
  const index = posts.findIndex((p) => p.slug === slug);
  if (index === -1) return { prev: undefined, next: undefined };
  return {
    prev: index > 0 ? posts[index - 1] : undefined,
    next: index < posts.length - 1 ? posts[index + 1] : undefined,
  };
}
