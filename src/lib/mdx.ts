// MDX 渲染配置：一条渲染管线，前台文章页与后台预览（V2.0）共用。
// 类型直接内联声明，与 next-mdx-remote 的 mdxOptions 参数结构保持一致。

import type { PluggableList } from "unified";
import rehypePrettyCode, { type Options as PrettyCodeOptions } from "rehype-pretty-code";
import rehypeExternalLinks from "rehype-external-links";
import rehypeSanitize from "rehype-sanitize";
import { sanitizeSchema } from "./sanitize";

const prettyCodeOptions: PrettyCodeOptions = {
  // 双主题：构建时同时生成两套配色，用 CSS 按 html 明/暗切换
  theme: {
    light: "github-light",
    dark: "github-dark",
  },
  keepBackground: true,
};

/** 传给 <MDXRemote options={{ mdxOptions }}> 的配置 */
export const mdxOptions: { format: "md"; rehypePlugins: PluggableList } = {
  format: "md",
  rehypePlugins: [
    [rehypePrettyCode, prettyCodeOptions],
    // 正文外部链接新窗口打开（PRD FR-1-02 验收标准 4）
    [rehypeExternalLinks, { target: "_blank", rel: ["noopener", "noreferrer"] }],
    // 最后执行：剥离白名单之外的标签与属性（PRD FR-1-02 验收标准 3）
    [rehypeSanitize, sanitizeSchema],
  ],
};
