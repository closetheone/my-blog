"use client";

import { useRef, useState, type ReactNode } from "react";

/**
 * 代码块容器：在 <pre> 右上角渲染复制按钮（PRD FR-1-02 验收标准 2 / M9 排版规格）。
 * 通过 MDX components 映射接入，替代默认的 pre 渲染。
 */
export function CodeBlock({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const text = ref.current?.innerText;
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
    <pre ref={ref}>
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
