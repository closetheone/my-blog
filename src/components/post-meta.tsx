"use client";

// 文章页点赞 + 浏览量（PRD FR-3-03 / FR-3-05）
// - PV：挂载时 POST /api/pv（IP+文章 1h 窗口去重，服务端判定）
// - 点赞：localStorage 本地去重 + 服务端内存 Set 校验（PRD：不追求强一致）
// 初始计数来自文章页静态数据，之后只随交互更新，不做轮询。

import { useEffect, useState } from "react";

const LIKE_KEY = (postId: number) => `liked_${postId}`;

export function PostMeta({
  postId,
  initialLikes,
  initialPv,
}: {
  postId: number;
  initialLikes: number;
  initialPv: number;
}) {
  const [pvCount, setPvCount] = useState<number | null>(null);
  const [likesCount, setLikesCount] = useState(initialLikes);
  const [liked, setLiked] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  // 客户端挂载标记：localStorage 只能在客户端读，SSR/prerender 时用静态值
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 同 theme-toggle：挂载后置位，让下方 effect 仅在客户端跑
    setMounted(true);
  }, []);

  useEffect(() => {
    // 点赞本地去重（PRD FR-3-03）：mounted 后才读 localStorage
    setLiked(localStorage.getItem(LIKE_KEY(postId)) === "1");
  }, [mounted, postId]);

  useEffect(() => {
    if (!mounted) return;
    let alive = true;
    // PV 上报：只在挂载时一次
    fetch("/api/pv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => {
        if (alive && d && typeof d.pvCount === "number") setPvCount(d.pvCount);
      })
      .catch(() => {
        /* 网络失败静默 */
      });
    return () => {
      alive = false;
    };
  }, [mounted, postId]);

  async function handleLike() {
    if (liked || likeBusy) return;
    setLikeBusy(true);
    try {
      const res = await fetch("/api/like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId }),
      });
      if (res.ok) {
        const d = (await res.json()) as { likesCount: number };
        setLikesCount(d.likesCount);
        setLiked(true);
        localStorage.setItem(LIKE_KEY(postId), "1");
      }
    } finally {
      setLikeBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-500">
      <button
        type="button"
        onClick={handleLike}
        disabled={liked || likeBusy}
        className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 transition-colors ${
          liked
            ? "border-blue-300 bg-blue-50 text-blue-600 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-400"
            : "border-zinc-300 text-zinc-600 hover:border-zinc-400 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-100"
        } disabled:opacity-70`}
      >
        {liked ? "✓ 已点赞" : "👍 点赞"}
        <span>{likesCount}</span>
      </button>
      <span>👀 {pvCount ?? initialPv} 次浏览</span>
    </div>
  );
}
