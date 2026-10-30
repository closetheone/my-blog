"use client";

import { useRef, useState, type HTMLAttributes } from "react";

/**
 * 代码块容器：在 <pre> 右上角渲染复制按钮（PRD FR-1-02 验收标准 2 / M9 排版规格）。
 * 通过 MDX components 映射接入，替代默认的 pre 渲染。
 * 注意：必须把 shiki 写好的 props（style 里的双主题 CSS 变量、data-language、
 * tabindex、className 等）原样透传到 <pre>，否则语法高亮和语言标签会丢失。
 */
export function CodeBlock({
  children,
  ...props
}: React.HTMLAttributes<HTMLPreElement>) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    // 排除复制按钮自身，避免 "⧉"/"✓" 混入复制内容
    const btn = ref.current?.querySelector("button");
    const text = ref.current
      ? Array.from(ref.current.childNodes)
          .filter((node) => node !== btn)
          .map((node) => node.textContent ?? "")
          .join("")
      : undefined;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API 不可用（如非安全上下文）时静默失败
    }
  }

  return (
    <pre ref={ref} {...props}>
      {children}
      <button
        type="button"
        onClick={handleCopy}
        aria-label="复制代码"
        title={copied ? "已复制" : "复制代码"}
        className="code-copy-btn"
        data-copied={copied || undefined}
      >
        {copied ? "✓" : "⧉"}
      </button>
    </pre>
  );
}
