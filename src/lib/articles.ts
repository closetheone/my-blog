// 文章数据读取层 —— V1.0 的实现是读 content/ 目录下的 Markdown 文件。
// V2.0 接入 Prisma 后仅需替换本文件内部实现，页面调用方零改动。

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

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

const CONTENT_DIR = path.join(process.cwd(), "content", "posts");

/** 容错：字段缺失或类型不对时给出可读的报错，方便写作时快速定位 */
function parseFrontMatter(
  slug: string,
  raw: Record<string, unknown>,
  content: string,
): Post {
  const errors: string[] = [];
  if (typeof raw.title !== "string" || !raw.title) errors.push("title");
  // YAML 会把 2026-10-28 解析成 Date 对象，统一归一化为 YYYY-MM-DD 字符串
  const date =
    raw.date instanceof Date ? raw.date.toISOString().slice(0, 10) : raw.date;
  if (typeof date !== "string" || !date) errors.push("date");
  if (typeof raw.excerpt !== "string" || !raw.excerpt) errors.push("excerpt");
  if (typeof raw.category !== "string" || !raw.category) errors.push("category");
  if (errors.length > 0) {
    throw new Error(
      `content/posts/${slug}.md 缺少必填 front-matter 字段: ${errors.join(", ")}`,
    );
  }

  const status = (raw.status as PostStatus) ?? "published";
  if (!["draft", "published", "hidden"].includes(status)) {
    throw new Error(
      `content/posts/${slug}.md 的 status 必须是 draft/published/hidden 之一，当前为 ${status}`,
    );
  }

  return {
    slug,
    title: raw.title as string,
    date: date as string,
    excerpt: raw.excerpt as string,
    category: raw.category as string,
    tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
    status,
    pinned: raw.pinned === true,
    content,
  };
}

function readOne(slug: string): Post | null {
  const filePath = path.join(CONTENT_DIR, `${slug}.md`);
  if (!fs.existsSync(filePath)) return null;
  const { data, content } = matter(fs.readFileSync(filePath, "utf-8"));
  return parseFrontMatter(slug, data, content);
}

/** 全部文章（含草稿/隐藏），按日期倒序 */
export async function getAllPosts(): Promise<Post[]> {
  fs.mkdirSync(CONTENT_DIR, { recursive: true });
  const files = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith(".md"));
  const posts = files.map((file) => readOne(file.replace(/\.md$/, "")));
  return posts
    .filter((p): p is Post => p !== null)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** 仅已发布文章（前台可见），按日期倒序 */
export async function getPublishedPosts(): Promise<Post[]> {
  const posts = await getAllPosts();
  return posts.filter((p) => p.status === "published");
}

export async function getPostBySlug(slug: string): Promise<Post | null> {
  return readOne(slug);
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
