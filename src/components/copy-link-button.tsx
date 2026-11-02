"use client";

// 文章页「复制链接」分享按钮（PRD FR-7-03）：复制当前 URL，成功有反馈。
// 交互与代码块复制按钮保持一致（按钮内状态提示）。

import { useState } from "react";

export function CopyLinkButton() {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API 不可用（如非安全上下文）时静默失败
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 transition-colors hover:border-zinc-400 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-100"
      aria-live="polite"
    >
      {copied ? "✓ 链接已复制" : "🔗 复制链接"}
    </button>
  );
}
