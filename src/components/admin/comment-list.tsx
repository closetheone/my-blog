"use client";

// 评论管理列表（PRD FR-3-02）：文章过滤 + 昵称搜索、置顶 toggle、删除（confirm 二次确认）。
// 列表行：头像、昵称、文章标题、内容摘要、时间、置顶徽章、操作。
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface AdminComment {
  id: number;
  postId: number;
  postTitle: string;
  parentId: number | null;
  nickname: string;
  emailHash: string;
  content: string;
  pinned: boolean;
  createdAt: string;
}

interface PostOption {
  id: number;
  slug: string;
  title: string;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `请求失败（${res.status}）`);
  }
  return res.json() as Promise<T>;
}

const gravatarUrl = (hash: string) =>
  `https://www.gravatar.com/avatar/${hash}?d=identicon&s=80`;

export function CommentList() {
  const [comments, setComments] = useState<AdminComment[]>([]);
  const [postOptions, setPostOptions] = useState<PostOption[]>([]);
  const [postId, setPostId] = useState<string>(""); // "" = 全部
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (postId) params.set("postId", postId);
      if (q.trim()) params.set("q", q.trim());
      const qs = params.toString();
      const data = (await api(`/api/admin/comments${qs ? `?${qs}` : ""}`)) as AdminComment[];
      setComments(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [postId, q]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 同 post-list：切换筛选时先亮 loading 再拉数据
    setLoading(true);
    refresh();
  }, [refresh]);

  // 文章下拉选项
  useEffect(() => {
    api<{ posts: PostOption[] }>("/api/posts")
      .then((d) => setPostOptions(d.posts))
      .catch(() => {});
  }, []);

  async function togglePinned(c: AdminComment) {
    setBusyId(c.id);
    try {
      await api(`/api/admin/comments/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !c.pinned }),
      });
      setComments((cs) => cs.map((x) => (x.id === c.id ? { ...x, pinned: !c.pinned } : x)));
    } catch (e) {
      alert(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(c: AdminComment) {
    if (!confirm(`删除「${c.nickname}」的评论？${c.parentId == null ? "其下的二级回复会一并删除。" : ""}`)) return;
    setBusyId(c.id);
    try {
      const { deleted } = (await api(`/api/admin/comments/${c.id}`, {
        method: "DELETE",
      })) as { deleted: number };
      setComments((cs) => cs.filter((x) => x.id !== c.id));
      if (deleted > 1) refresh(); // 级联删了二级，列表刷新
    } catch (e) {
      alert(e instanceof Error ? e.message : "删除失败");
    } finally {
      setBusyId(null);
    }
  }

  const inputCls =
    "rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

  return (
    <div>
      {/* 过滤栏 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={postId}
          onChange={(e) => setPostId(e.target.value)}
          className={inputCls}
        >
          <option value="">全部文章</option>
          {postOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="按昵称搜索"
          className={inputCls}
        />
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            refresh();
          }}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          查询
        </button>
        <span className="text-xs text-zinc-400">{comments.length} 条</span>
      </div>

      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}
      {loading && <p className="text-sm text-zinc-400">加载中…</p>}
      {!loading && !error && comments.length === 0 && (
        <p className="text-sm text-zinc-400">暂无评论</p>
      )}

      {/* 列表 */}
      {!loading && (
        <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-3 p-4">
              {/* Gravatar 外部域名，next/image 不适用 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={gravatarUrl(c.emailHash)}
                alt={c.nickname}
                loading="lazy"
                referrerPolicy="no-referrer"
                className="h-9 w-9 shrink-0 rounded-full"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.visibility = "hidden";
                }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  {c.pinned && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                      置顶
                    </span>
                  )}
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">
                    {c.nickname}
                  </span>
                  {c.parentId != null && (
                    <span className="text-xs text-zinc-400">（二级回复）</span>
                  )}
                  <span className="text-xs text-zinc-400">
                    {new Date(c.createdAt).toLocaleString("zh-CN", { hour12: false })}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 break-words text-sm text-zinc-600 dark:text-zinc-400">
                  {c.content}
                </p>
                <Link
                  href={`/admin/posts/${c.postId}/edit`}
                  className="mt-1 inline-block text-xs text-zinc-400 hover:text-zinc-600 hover:underline dark:hover:text-zinc-200"
                >
                  文章：{c.postTitle}
                </Link>
              </div>
              <div className="flex shrink-0 flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => togglePinned(c)}
                  disabled={busyId === c.id}
                  className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  {c.pinned ? "取消置顶" : "置顶"}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(c)}
                  disabled={busyId === c.id}
                  className="rounded-lg border border-red-300 px-2.5 py-1 text-xs text-red-600 transition hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
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
