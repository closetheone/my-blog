"use client";

// 文章管理列表（PRD FR-6-04）：状态 tabs（全部/草稿/已发布/隐藏，带数量）、
// 列表行（标题/slug/分类/标签/状态徽章/操作：编辑、发布、删除）。
// 删除用 window.confirm 二次确认；离开编辑页的拦截不在这里（各页自己处理）。
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type PostStatus = "draft" | "published" | "hidden";

interface AdminPost {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  status: PostStatus;
  pinned: boolean;
  category: string | null;
  tags: string[];
  publishedAt: string | null;
  scheduledFor: string | null;
  updatedAt: string;
}

const TABS: { key: PostStatus | "all"; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "draft", label: "草稿" },
  { key: "published", label: "已发布" },
  { key: "hidden", label: "隐藏" },
];

const STATUS_BADGE: Record<PostStatus, { label: string; cls: string }> = {
  draft: { label: "草稿", cls: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400" },
  published: { label: "已发布", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" },
  hidden: { label: "隐藏", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400" },
};

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `请求失败（${res.status}）`);
  }
  return res.json();
}

export function PostList() {
  const [tab, setTab] = useState<PostStatus | "all">("all");
  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [counts, setCounts] = useState<Record<PostStatus, number>>({ draft: 0, published: 0, hidden: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const qs = tab === "all" ? "" : `?status=${tab}`;
      const data = (await api(`/api/posts${qs}`)) as { posts: AdminPost[] };
      setPosts(data.posts);
      // tabs 计数用全量取一次即可
      const all = (await api("/api/posts")) as { posts: AdminPost[] };
      setCounts({
        draft: all.posts.filter((p) => p.status === "draft").length,
        published: all.posts.filter((p) => p.status === "published").length,
        hidden: all.posts.filter((p) => p.status === "hidden").length,
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  async function handlePublish(p: AdminPost) {
    if (!confirm(`发布《${p.title}》？`)) return;
    setBusyId(p.id);
    try {
      await api(`/api/posts/${p.id}/publish`, { method: "POST", body: "{}" });
      refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "发布失败");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(p: AdminPost) {
    if (!confirm(`删除后不可恢复，确认删除《${p.title}》？`)) return;
    setBusyId(p.id);
    try {
      await api(`/api/posts/${p.id}`, { method: "DELETE" });
      refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "删除失败");
    } finally {
      setBusyId(null);
    }
  }

  async function handleCancelSchedule(p: AdminPost) {
    if (!confirm(`取消《${p.title}》的定时发布？`)) return;
    setBusyId(p.id);
    try {
      await api(`/api/posts/${p.id}/schedule`, { method: "DELETE" });
      refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "取消定时失败");
    } finally {
      setBusyId(null);
    }
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleString("zh-CN", { hour12: false });
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">文章管理</h1>
        <Link
          href="/admin/posts/new"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
        >
          新建文章
        </Link>
      </div>

      {/* 状态 tabs */}
      <div className="mb-4 flex gap-2">
        {TABS.map((t) => {
          const count = t.key === "all" ? counts.draft + counts.published + counts.hidden : counts[t.key];
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${
                tab === t.key
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
              }`}
            >
              {t.label}（{count}）
            </button>
          );
        })}
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
          {error}
        </p>
      )}
      {loading ? (
        <p className="py-10 text-center text-sm text-zinc-400">加载中…</p>
      ) : posts.length === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-400">该状态下暂无文章</p>
      ) : (
        <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
          {posts.map((p) => (
            <li key={p.id} className="flex items-center gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/admin/posts/${p.id}/edit`}
                    className="truncate text-sm font-medium hover:underline"
                  >
                    {p.title}
                  </Link>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[p.status].cls}`}
                  >
                    {STATUS_BADGE[p.status].label}
                  </span>
                  {p.scheduledFor && (
                    <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-950 dark:text-blue-400">
                      定时 {new Date(p.scheduledFor).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })}
                    </span>
                  )}
                </div>
                <p className="mt-1 truncate text-xs text-zinc-500">
                  /{p.slug}
                  {p.category && ` · ${p.category}`}
                  {p.tags.length > 0 &&
                    ` · ${p.tags.slice(0, 2).map((t) => `#${t}`).join(" ")}${p.tags.length > 2 ? ` +${p.tags.length - 2}` : ""}`}
                  {" · 更新于 "}
                  {fmtDate(p.updatedAt)}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Link
                  href={`/admin/posts/${p.id}/edit`}
                  className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  编辑
                </Link>
                {p.status !== "published" && (
                  <button
                    type="button"
                    onClick={() => handlePublish(p)}
                    disabled={busyId === p.id}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs text-white transition hover:bg-emerald-700 disabled:opacity-60"
                  >
                    发布
                  </button>
                )}
                {p.scheduledFor && p.status !== "published" && (
                  <button
                    type="button"
                    onClick={() => handleCancelSchedule(p)}
                    disabled={busyId === p.id}
                    className="rounded-lg border border-blue-300 px-3 py-1.5 text-xs text-blue-600 transition hover:bg-blue-50 disabled:opacity-60 dark:border-blue-900 dark:text-blue-400 dark:hover:bg-blue-950"
                  >
                    取消定时
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleDelete(p)}
                  disabled={busyId === p.id}
                  className="rounded-lg border border-red-300 px-3 py-1.5 text-xs text-red-600 transition hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                >
                  删除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
