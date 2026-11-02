// 全文搜索（PRD FR-5-01）：标题 + 正文 + 标签，多词 AND 匹配。
// 纯函数实现，不依赖 Next/Node API，便于理解与迁移（V2.0 入库后可换 SQL 实现）。

import type { Post } from "@/lib/articles";

export interface SearchResult {
  slug: string;
  title: string;
  date: string;
  tags: string[];
  /** 命中分数：标题 > 标签 > 正文，同分时取更近命中的 */
  score: number;
  /** 正文命中摘要（无正文命中时为 null） */
  excerpt: string | null;
  /** 各词在哪些字段命中（用于前端高亮定位） */
  matchedFields: { title: boolean; tags: boolean; content: boolean };
}

/** 每个搜索词的分词结果：统一转小写后按空白拆分，过滤空词 */
function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * 从 Markdown 原文中提取纯文本用于搜索与摘要生成。
 * 规则从粗到细：去代码块、图片留 alt、链接留文字、去格式符号与 front-matter 残留。
 * 搜索场景不追求还原排版，只要不引入噪声词即可。
 */
export function extractPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ") // 围栏代码块整体剔除（代码词对中文搜索基本是噪声）
    .replace(/`[^`]*`/g, " ") // 行内代码
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // 图片 → alt 文本
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // 链接 → 文字
    .replace(/^#{1,6}\s+/gm, "") // 标题符号
    .replace(/[*_~>#|]/g, " ") // 强调、引用、表格符号
    .replace(/\s+/g, " ")
    .trim();
}

/** 摘要截取：以首个命中位置为中心取前后 window 字，越界时截短 */
function buildExcerpt(text: string, index: number, window = 40): string {
  const start = Math.max(0, index - window);
  const end = Math.min(text.length, index + window);
  let excerpt = text.slice(start, end);
  if (start > 0) excerpt = `…${excerpt}`;
  if (end < text.length) excerpt = `${excerpt}…`;
  return excerpt;
}

/**
 * 在已发布文章（date 倒序）中全文搜索。
 * 匹配规则：所有搜索词都须在标题、标签或正文中至少出现一次（AND 语义，忽略大小写）。
 * 排序：命中字段加权（标题 4 / 标签 2 / 正文 1），同分按原日期倒序。
 * 结果上限 limit 条（默认 20），避免大词表查询时客户端渲染过多节点。
 */
export function searchPosts(
  posts: Pick<Post, "slug" | "title" | "date" | "tags" | "content">[],
  query: string,
  limit = 20,
): SearchResult[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const results: SearchResult[] = [];
  for (const post of posts) {
    const title = post.title.toLowerCase();
    const tags = post.tags.map((t) => t.toLowerCase());
    const plainText = extractPlainText(post.content).toLowerCase();

    let score = 0;
    let excerpt: string | null = null;
    const matched = { title: false, tags: false, content: false };

    for (const token of tokens) {
      let hit = false;
      if (title.includes(token)) {
        matched.title = true;
        score += 4;
        hit = true;
      }
      if (tags.some((t) => t.includes(token))) {
        matched.tags = true;
        score += 2;
        hit = true;
      }
      if (plainText.includes(token)) {
        matched.content = true;
        score += 1;
        hit = true;
        // 只取第一个词命中的位置生成摘要，避免多词命中时摘要漂移
        if (excerpt === null) {
          const index = plainText.indexOf(token);
          excerpt = buildExcerpt(extractPlainText(post.content), index);
        }
      }
      if (!hit) {
        score = 0;
        break; // 有词未命中，AND 语义不满足
      }
    }

    if (score > 0) {
      results.push({
        slug: post.slug,
        title: post.title,
        date: post.date,
        tags: post.tags,
        score,
        excerpt,
        matchedFields: matched,
      });
    }
  }

  // score 倒序；同分保持入参（日期倒序）顺序
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
