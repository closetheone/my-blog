// 全文 RSS（PRD FR-7-01）：/feed.xml，输出标题、正文（全文）、发布时间。
// 与 api/search、api/random 同一模式：route handler 返回 XML，每次请求实时生成。
// 正文由 Markdown 原文经 remark → rehype 渲染为 HTML（与前台同源的 MD 管线，
// 不引入 next-mdx-remote 的 RSC 依赖，保持 route handler 轻量）。

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { getPublishedPosts, type Post } from "@/lib/articles";
import { SITE_NAME, SITE_DESCRIPTION, SITE_URL } from "@/lib/site";

/** 将 Markdown 原文渲染为 HTML 字符串（GFM：表格/删除线等） */
async function markdownToHtml(markdown: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm, { singleTilde: false })
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(markdown);
  return file.toString();
}

/** XML 转义：RSS 是 XML 载体，正文里的 <、>、&、"、' 必须转义 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function postUrl(post: Post): string {
  return `${SITE_URL}/posts/${post.slug}`;
}

/** RFC 822 时间格式（RSS pubDate 规范要求） */
function toRfc822(iso: string): string {
  return new Date(`${iso}T00:00:00`).toUTCString();
}

export async function GET() {
  const posts = await getPublishedPosts();
  // 最近 30 篇进 feed，避免文章规模上来后 feed 过大
  const items = posts.slice(0, 30);

  // 正文渲染是异步的，map 里必须逐个 await，不能同步拼字符串
  const rendered = await Promise.all(
    items.map(async (post) => {
      const html = await markdownToHtml(post.content);
      return [
        "    <item>",
        `      <title>${escapeXml(post.title)}</title>`,
        `      <link>${postUrl(post)}</link>`,
        `      <guid isPermaLink="true">${postUrl(post)}</guid>`,
        `      <description>${escapeXml(post.excerpt)}</description>`,
        // 正文全文放 <content:encoded>，<description> 放摘要（各阅读器行为不一，两者都给）
        `      <content:encoded><![CDATA[${html}]]></content:encoded>`,
        `      <pubDate>${toRfc822(post.date)}</pubDate>`,
        "    </item>",
      ].join("\n");
    }),
  );
  const itemXml = rendered.join("\n");

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">',
    "  <channel>",
    `    <title>${escapeXml(SITE_NAME)}</title>`,
    `    <description>${escapeXml(SITE_DESCRIPTION)}</description>`,
    `    <link>${SITE_URL}</link>`,
    `    <language>zh-CN</language>`,
    `    <lastBuildDate>${toRfc822(new Date().toISOString().slice(0, 10))}</lastBuildDate>`,
    `    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml" xmlns:atom="http://www.w3.org/2005/Atom"/>`,
    itemXml,
    "  </channel>",
    "</rss>",
  ].join("\n");

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      // feed 变化不频繁，短缓存减少重复渲染
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
}
