// rehype-sanitize 白名单配置（PRD FR-1-02 验收标准 3：Markdown 中 HTML 白名单过滤）
//
// hast-util-sanitize 的 Schema 是「部分类型」：未提供的顶层 key 回退到其内置
// GitHub 风格默认值；一旦提供 attributes，即为完整替换（不与默认合并）。
// 因此这里显式写全要放行的标签与属性：
// - 放行正文常见的安全标签（表格、图片、列表、标题等），外加 figure/figcaption（图注，FR-1-08）
// - 放行 shiki 代码高亮所需的 data-* 与 style（双主题配色、行号都写在这些属性上）
// - 图片放行 loading（懒加载，FR-1-08）
// 不在列表内的标签/属性（script、on* 事件、iframe srcdoc 等）一律被剥离。

import type { Schema } from "hast-util-sanitize";

export const sanitizeSchema: Schema = {
  allowComments: false,
  ancestors: {
    tbody: ["table"],
    td: ["table"],
    th: ["table"],
    thead: ["table"],
    tfoot: ["table"],
    tr: ["table"],
  },
  tagNames: [
    "a", "abbr", "b", "blockquote", "br", "caption", "cite", "code", "del",
    "details", "div", "dl", "dt", "dd", "em", "figcaption", "figure", "h1",
    "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "ins", "kbd", "li", "mark",
    "ol", "p", "pre", "q", "rp", "rt", "ruby", "s", "samp", "source", "span",
    "strike", "strong", "sub", "summary", "sup", "table", "tbody", "td",
    "tfoot", "th", "thead", "tr", "tt", "ul", "var", "video", "audio",
  ],
  attributes: {
    a: ["href", "title"],
    audio: ["controls", "loop", "muted", "preload", "src", "srcset"],
    blockquote: ["cite"],
    code: ["data-language", "data-theme", "class", "style"],
    del: ["cite"],
    img: ["alt", "src", "srcset", "width", "height", "loading", "decoding", "title"],
    ins: ["cite"],
    ol: ["start", "reversed"],
    pre: ["data-language", "data-theme", "class", "style", "tabindex"],
    q: ["cite"],
    span: ["data-line", "data-highlighted-line", "style", "class"],
    source: ["src", "srcset", "type", "size"],
    video: ["controls", "loop", "muted", "poster", "preload", "src", "width", "height"],
  },
  clobber: ["id", "name"],
  clobberPrefix: "user-content-",
  strip: ["script", "iframe", "form", "object", "embed"],
  protocols: {
    src: ["http", "https", "mailto", "data"],
    href: ["http", "https", "mailto", "tel"],
    cite: ["http", "https"],
  },
};
