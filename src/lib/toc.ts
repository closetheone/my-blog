// 从 Markdown 原文提取文章目录（h2/h3，PRD FR-1-06）。
// 服务组件在构建时调用，与 rehype-slug 用同一个 github-slugger 生成 id，
// 保证 TOC 锚点与正文标题的 id 一致（包括同名标题去重）。

import { unified } from "unified";
import remarkParse from "remark-parse";
import GithubSlugger from "github-slugger";

export interface TocItem {
  id: string;
  text: string;
  depth: 2 | 3;
}

/** unist 节点的最小结构（text 节点 / 带 children 的复合节点） */
type UnistNode = { type: string; value?: string; children?: UnistNode[] };

/** 递归收集节点纯文本 */
function nodeText(node: UnistNode): string {
  if (node.type === "text") return node.value ?? "";
  if (Array.isArray(node.children)) {
    return node.children.map(nodeText).join("");
  }
  return "";
}

const tocParser = unified().use(remarkParse);

export function extractToc(markdown: string): TocItem[] {
  const tree = tocParser.parse(markdown);
  const slugger = new GithubSlugger();
  const items: TocItem[] = [];
  for (const node of tree.children) {
    if (node.type === "heading" && (node.depth === 2 || node.depth === 3)) {
      items.push({
        id: slugger.slug(nodeText(node)),
        text: nodeText(node),
        depth: node.depth as 2 | 3,
      });
    }
  }
  return items;
}
