"use client";

// 预览 iframe（FR-6-11）：srcDoc 是独立文档，拿不到主页面的 Tailwind 与 globals.css，
// 所以内联一段与 globals.css 中 .prose-post 规则对齐的静态副本。
// ⚠️ 样式同步责任：前台 .prose-post 排版大改时需同步这里——
// 预览底线是「内容渲染一致」（渲染管线已保证），排版像素级一致靠这套内联样式近似。
import { memo } from "react";

// 从 globals.css 的 .prose-post 规则抽取的排版样式（仅预览必需部分）
const PROSE_CSS = `
  :root {
    color-scheme: light dark;
  }
  body {
    background: transparent;
    color: #171717;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, Helvetica, sans-serif;
    margin: 0;
  }
  @media (prefers-color-scheme: dark) {
    body { color: #ededed; }
  }
  .prose-post { font-size: 1.0625rem; line-height: 1.8; }
  .prose-post h1 { font-size: 1.875em; font-weight: 700; line-height: 1.3; margin: 0 0 1em; }
  .prose-post h2 { font-size: 1.5em; font-weight: 700; margin: 2em 0 0.8em; }
  .prose-post h3 { font-size: 1.25em; font-weight: 700; margin: 1.6em 0 0.6em; }
  .prose-post h4, .prose-post h5, .prose-post h6 { font-weight: 700; margin: 1.4em 0 0.6em; }
  .prose-post p { margin: 1em 0; }
  .prose-post ul, .prose-post ol { margin: 1em 0; padding-left: 1.5em; }
  .prose-post ul { list-style: disc; }
  .prose-post ol { list-style: decimal; }
  .prose-post li { margin: 0.4em 0; }
  /* 任务列表（GFM） */
  .prose-post li.task-list-item { list-style: none; margin-left: -1.5em; }
  .prose-post li.task-list-item input { margin-right: 0.5em; }
  .prose-post blockquote {
    border-left: 3px solid #d4d4d8;
    padding-left: 1em;
    margin: 1.5em 0;
    color: #71717a;
  }
  @media (prefers-color-scheme: dark) {
    .prose-post blockquote { border-color: #3f3f46; color: #a1a1aa; }
  }
  .prose-post a { color: #2563eb; text-decoration: underline; text-underline-offset: 3px; }
  @media (prefers-color-scheme: dark) { .prose-post a { color: #60a5fa; } }
  .prose-post hr { border: 0; border-top: 1px solid #e4e4e7; margin: 2.5em 0; }
  @media (prefers-color-scheme: dark) { .prose-post hr { border-color: #27272a; } }
  .prose-post table { width: 100%; border-collapse: collapse; margin: 1.5em 0; font-size: 0.95em; }
  .prose-post th, .prose-post td { border: 1px solid #e4e4e7; padding: 0.5em 0.75em; text-align: left; }
  @media (prefers-color-scheme: dark) { .prose-post th, .prose-post td { border-color: #27272a; } }
  .prose-post th { background: #f4f4f5; font-weight: 600; }
  @media (prefers-color-scheme: dark) { .prose-post th { background: #18181b; } }
  .prose-post img { max-width: 100%; height: auto; border-radius: 0.5rem; }
  .prose-post figure { margin: 1.5em 0; }
  .prose-post figcaption { margin-top: 0.5em; font-size: 0.85em; text-align: center; color: #71717a; }
  @media (prefers-color-scheme: dark) { .prose-post figcaption { color: #a1a1aa; } }
  .prose-post code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.875em;
  }
  .prose-post :not(pre) > code {
    background: #f4f4f5;
    border-radius: 0.375rem;
    padding: 0.15em 0.4em;
  }
  @media (prefers-color-scheme: dark) { .prose-post :not(pre) > code { background: #27272a; } }
  .prose-post pre {
    position: relative;
    margin: 1.5em 0;
    padding: 1em 1.25em;
    border-radius: 0.75rem;
    overflow-x: auto;
    font-size: 0.875rem;
    line-height: 1.7;
  }
  /* 双主题：rehype-pretty-code(keepBackground) 把配色写进 --shiki-light/--shiki-dark 变量，
     pre 与 span 都要设 color 来消费（与前台 globals.css 相同机制） */
  .prose-post pre[data-theme~="github-dark"] { color: var(--shiki-light); background: var(--shiki-light-bg, #f6f8fa); }
  @media (prefers-color-scheme: dark) {
    .prose-post pre[data-theme~="github-dark"] { color: var(--shiki-dark); background: var(--shiki-dark-bg, #0d1117); }
  }
  .prose-post pre[data-theme~="github-dark"] span { color: var(--shiki-light); }
  @media (prefers-color-scheme: dark) { .prose-post pre[data-theme~="github-dark"] span { color: var(--shiki-dark); } }
  .prose-post pre[data-language]::before {
    content: attr(data-language);
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #8b949e;
    pointer-events: none;
  }
  .prose-post pre[data-line-numbers] { counter-reset: line; }
  .prose-post pre[data-line-numbers] .line::before {
    counter-increment: line;
    content: counter(line);
    display: inline-block;
    width: 1.5rem;
    margin-right: 1rem;
    text-align: right;
    color: #8b949e;
    user-select: none;
  }
  .prose-post pre .line[data-highlighted-line] {
    background: rgba(84, 144, 233, 0.16);
    display: inline-block;
    width: 100%;
  }
`;

export interface PreviewFrameData {
  /** 渲染管线输出的正文 HTML（含页头内联内容） */
  html: string;
  title: string;
  excerpt: string;
  date: string; // YYYY-MM-DD 展示用
  category: string;
  tags: string[];
  readingMinutes: number;
  toc: { id: string; text: string; depth: 2 | 3 }[];
}

/** 组装 srcDoc 完整文档（独立文档，样式内联） */
function buildSrcDoc(data: PreviewFrameData): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const tocHtml = data.toc
    .map((item) => {
      const indent = item.depth === 3 ? "style='padding-left:1em'" : "";
      return `<a ${indent}href="#${esc(item.id)}">${esc(item.text)}</a>`;
    })
    .join("\n");
  const meta = [
    data.date,
    `约 ${data.readingMinutes} 分钟`,
    data.category && `· ${esc(data.category)}`,
  ]
    .filter(Boolean)
    .join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>${PROSE_CSS}</style>
</head>
<body>
  <div style="max-width: 860px; margin: 0 auto; padding: 2rem 1.25rem 4rem;">
    <article>
      <header style="margin-bottom: 2rem; padding-bottom: 2rem; border-bottom: 1px solid #e4e4e7;">
        <h1 style="font-size: 1.875rem; font-weight: 700; margin: 0; line-height: 1.3;">${esc(data.title)}</h1>
        ${meta ? `<p style="margin: 0.75rem 0 0; font-size: 0.875rem; color: #71717a;">${meta}</p>` : ""}
        ${data.tags.length > 0 ? `<p style="margin: 0.5rem 0 0; font-size: 0.8rem; color: #71717a;">${data.tags.map((t) => `#${esc(t)}`).join(" ")}</p>` : ""}
      </header>
      ${data.toc.length > 0 ? `<nav style="margin-bottom: 1.5rem; font-size: 0.875rem; line-height: 2;">
        <div style="font-weight: 600; margin-bottom: 0.25rem;">目录</div>
        ${tocHtml}
      </nav>` : ""}
      <div class="prose-post">${data.html}</div>
    </article>
  </div>
</body>
</html>`;
}

export const PreviewFrame = memo(function PreviewFrame({
  data,
  error,
}: {
  data: PreviewFrameData | null;
  /** 渲染失败时的报错文本（显示在预览区，不白屏） */
  error?: string | null;
}) {
  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="whitespace-pre-wrap rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
          预览渲染失败：{error}
        </p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-zinc-400">正在生成预览…</p>
      </div>
    );
  }
  return (
    <iframe
      title="文章预览"
      srcDoc={buildSrcDoc(data)}
      className="h-full w-full border-0 bg-white dark:bg-zinc-950"
    />
  );
});
