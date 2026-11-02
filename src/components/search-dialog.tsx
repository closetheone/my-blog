"use client";

// 全站搜索（PRD FR-5-01/02）：导航栏放大镜入口 + 全屏搜索层。
// - 输入防抖 300ms 后请求 /api/search
// - 结果标题与摘要高亮命中词
// - 桌面端 Cmd/Ctrl+K 快捷键呼出，Esc 关闭
// - 无结果时展示引导（热门标签，点击直接发起新搜索）

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SearchResult } from "@/lib/search";

interface SearchDialogProps {
  /** 热门标签（前台可见文章中出现次数最高的前 8 个），用于无结果引导 */
  popularTags: string[];
}

const DEBOUNCE_MS = 300;

/** 按词切分文本并高亮命中部分（忽略大小写） */
function Highlight({ text, tokens }: { text: string; tokens: string[] }) {
  if (tokens.length === 0) return <>{text}</>;
  // 词可能互为子串（如 "next" / "nextjs"），先长后短避免短词先吃掉
  const escaped = [...new Set(tokens)].sort((a, b) => b.length - a.length);
  const pattern = escaped.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const parts = text.split(new RegExp(`(${pattern})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        escaped.some((t) => t === part.toLowerCase()) ? (
          <mark key={i} className="rounded bg-amber-200/80 px-0.5 text-inherit dark:bg-amber-400/30">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export function SearchDialog({ popularTags }: SearchDialogProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // 丢弃过期响应：防抖只挡了请求发出，先发后至的旧结果仍可能覆盖新结果
  const requestIdRef = useRef(0);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults(null);
  }, []);

  // 快捷键：Cmd/Ctrl+K 呼出，Esc 关闭
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === "Escape" && open) {
        close();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  // 打开后聚焦输入框
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // 防抖搜索
  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (!trimmed) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const requestId = ++requestIdRef.current;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`);
        const data = (await res.json()) as { results: SearchResult[] };
        if (requestId === requestIdRef.current) {
          setResults(data.results);
        }
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, open]);

  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="搜索"
        title="搜索（Ctrl/⌘ + K）"
        className="rounded-lg px-2 py-1 text-base leading-none hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        🔍
      </button>

      {open && (
        /* 全屏搜索层（PRD FR-5-01：桌面端全屏层） */
        <div
          className="fixed inset-0 z-20 bg-zinc-900/40 backdrop-blur-sm"
          onClick={close}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="站内搜索"
            className="mx-auto mt-24 w-[min(90vw,40rem)] overflow-hidden rounded-2xl border border-zinc-200 bg-background shadow-xl dark:border-zinc-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-zinc-200 px-4 dark:border-zinc-800">
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索文章标题、正文、标签…"
                className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-zinc-400"
              />
              {loading && <span className="shrink-0 text-xs text-zinc-400">搜索中…</span>}
              <button
                type="button"
                onClick={close}
                className="shrink-0 rounded-md px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
              >
                Esc
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-2">
              {/* 未输入：提示搜索范围 */}
              {results === null && !query.trim() && (
                <p className="px-3 py-8 text-center text-sm text-zinc-400">
                  输入关键词，匹配标题、正文与标签
                </p>
              )}

              {/* 无结果引导（PRD FR-5-02：不留空白页） */}
              {results !== null && !loading && results.length === 0 && (
                <div className="px-3 py-6">
                  <p className="mb-3 text-sm text-zinc-500">
                    没找到「{query.trim()}」，要不要试试这些标签？
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {popularTags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setQuery(tag)}
                        className="rounded-full border border-zinc-300 px-3 py-1 text-xs text-zinc-600 hover:border-zinc-500 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-100"
                      >
                        #{tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 结果列表 */}
              {results !== null &&
                results.map((r) => (
                  <Link
                    key={r.slug}
                    href={`/posts/${r.slug}`}
                    onClick={close}
                    className="block rounded-lg px-3 py-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
                  >
                    <div className="flex items-baseline gap-2">
                      <h3 className="truncate text-sm font-medium">
                        <Highlight text={r.title} tokens={tokens} />
                      </h3>
                      <time className="shrink-0 text-xs tabular-nums text-zinc-400">
                        {r.date}
                      </time>
                    </div>
                    {r.excerpt && (
                      <p className="mt-1 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">
                        <Highlight text={r.excerpt} tokens={tokens} />
                      </p>
                    )}
                  </Link>
                ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
