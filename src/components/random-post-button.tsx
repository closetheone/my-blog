"use client";

// 404 页「随机看一篇」按钮（PRD FR-4-03）：
// 请求 /api/random 拿到随机 slug 后跳转。

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RandomPostButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleRandom() {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/random");
      if (!res.ok) {
        router.push("/"); // 还没有文章时回首页
        return;
      }
      const { slug } = (await res.json()) as { slug: string | null };
      if (slug) router.push(`/posts/${slug}`);
      else router.push("/");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleRandom}
      disabled={loading}
      className="rounded-lg bg-foreground px-4 py-2 text-sm text-background transition-opacity hover:opacity-80 disabled:opacity-50"
    >
      {loading ? "找一篇…" : "随机看一篇"}
    </button>
  );
}
