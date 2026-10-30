"use client";

// 运行天数/年份在客户端计算：SSG 页面构建时间不可用（blocking-prerender-current-time），
// 而且客户端实时计算才能在跨天时保持准确（PRD M9：运行天数实时计算）。

import Link from "next/link";
import { useEffect, useState } from "react";
import { SITE_NAME, SITE_START_DATE } from "@/lib/site";

function runningDays(): number {
  const start = new Date(`${SITE_START_DATE}T00:00:00`);
  return Math.max(
    0,
    Math.floor((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24)),
  );
}

export function SiteFooter() {
  // 初始值与服务端渲染时可能显示的静态占位一致，水合后即为真实值
  const [days, setDays] = useState<number | null>(null);
  const [year, setYear] = useState<number>(2026);

  useEffect(() => {
    // 运行天数/年份只能在客户端计算（SSR 构建时刻无意义），无法避免 effect 中 setState
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDays(runningDays());
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setYear(new Date().getFullYear());
  }, []);

  return (
    <footer className="border-t border-zinc-200 py-6 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-1 px-4">
        <p>
          © {year} {SITE_NAME} · 本站已运行 {days ?? "…"} 天
        </p>
        <p className="text-xs">
          <Link href="/" className="hover:underline">
            RSS
          </Link>
          （V1.1 上线）
        </p>
      </div>
    </footer>
  );
}
