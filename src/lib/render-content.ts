// 服务端 Markdown → HTML 渲染管线（PRD FR-6-11：预览必须与读者所见一致）
// 插件链与 src/lib/mdx.ts 的 mdxOptions 完全同源——直接展开同一份数组，
// 不要在此复制插件配置（单一事实来源，改一处两边生效）。
// 差异：mdx 走 MDXRemote 编译，这里走 rehypeStringify 输出 HTML 字符串
// （route handler 无法把 RSC payload 塞进 iframe 预览，见 tech 文档 §2）。

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { mdxOptions } from "./mdx";
import { extractToc } from "./toc";
import { readingMinutes } from "./articles";

export interface PreviewResult {
  html: string;
  toc: ReturnType<typeof extractToc>;
  readingMinutes: number;
}

// 管线含异步插件（rehype-pretty-code / shiki），必须用 process()（返回 Promise），
// 不能 processSync（会因异步插件抛错）
export async function renderContent(markdown: string): Promise<PreviewResult> {
  const vfile = await unified()
    .use(remarkParse)
    .use(mdxOptions.remarkPlugins)
    .use(remarkRehype)
    .use(mdxOptions.rehypePlugins)
    .use(rehypeStringify)
    .process(markdown);
  const html = String(vfile.value);
  return { html, toc: extractToc(markdown), readingMinutes: readingMinutes(markdown) };
}
