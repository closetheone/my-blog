"use client";

// 文章目录（PRD FR-1-06）：桌面端右侧固定栏，滚动高亮当前章节；
// 移动端折叠为顶部展开式（由调用方包一层 <details>）。
// 锚点 id 由 rehype-slug 在渲染管线里生成（见 lib/mdx.ts）。

import { useEffect, useState } from "react";
import type { TocItem } from "@/lib/toc";

export function TableOfContents({ items }: { items: TocItem[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);

  // 滚动高亮：只把页面顶部下方一条窄带设为观察区，标题滑过即高亮
  useEffect(() => {
    const headings = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null);
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveId(entry.target.id);
        }
      },
      { rootMargin: "-80px 0px -75% 0px" },
    );
    headings.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items]);

  if (items.length === 0) return null;

  return (
    <nav aria-label="文章目录">
      <p className="mb-3 text-xs font-semibold tracking-wide text-zinc-400 dark:text-zinc-500">
        目录
      </p>
      <ul className="space-y-1 border-l border-zinc-200 text-sm dark:border-zinc-800">
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className={`-ml-px block border-l-2 py-1 pr-2 leading-snug transition-colors ${
                  item.depth === 3 ? "pl-6" : "pl-3"
                } ${
                  active
                    ? "border-foreground font-medium text-foreground"
                    : "border-transparent text-zinc-500 hover:border-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
                }`}
              >
                {item.text}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
