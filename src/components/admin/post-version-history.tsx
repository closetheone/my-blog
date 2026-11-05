"use client";

// 文章版本历史弹窗（FR-6-10）：时间线 + 行级 diff + 回滚。
// diff 全在前端用 diff 库计算（createTwoFilesPatch），不请求后端。
// 回滚 = 一次保存（服务端先对当前内容拍快照，可反悔），成功后通过 onRolledBack 同步字段。
import { createTwoFilesPatch } from "diff";
import { useCallback, useEffect, useState } from "react";

export interface VersionItem {
  id: number;
  title: string;
  excerpt: string;
  content: string;
  createdAt: string;
  chars: number;
}

export interface RolledBackPost {
  title: string;
  excerpt: string;
  content: string;
}

interface DiffLine {
  type: "add" | "del" | "ctx";
  text: string;
}

// 把 unified diff 的正文部分解析成行列表（跳过 @@ 行头与文件头）
function parsePatch(patch: string): DiffLine[] {
  const lines: DiffLine[] = [];
  for (const raw of patch.split("\n")) {
    if (raw.startsWith("+++") || raw.startsWith("---") || raw.startsWith("@@")) continue;
    if (raw.startsWith("+")) lines.push({ type: "add", text: raw.slice(1) });
    else if (raw.startsWith("-")) lines.push({ type: "del", text: raw.slice(1) });
    else lines.push({ type: "ctx", text: raw.slice(1) });
  }
  return lines;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `请求失败（${res.status}）`);
  }
  return res.json() as Promise<T>;
}

export function PostVersionHistory({
  open,
  postId,
  currentTitle,
  currentExcerpt,
  currentContent,
  onRolledBack,
  onClose,
}: {
  open: boolean;
  postId: number;
  currentTitle: string;
  currentExcerpt: string;
  currentContent: string;
  onRolledBack: (post: RolledBackPost) => void;
  onClose: () => void;
}) {
  const [versions, setVersions] = useState<VersionItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelectedId(null);
    try {
      const { versions: v } = await api<{ versions: VersionItem[] }>(`/api/posts/${postId}/versions`);
      setVersions(v);
    } catch (e) {
      setError(e instanceof Error ? e.message : "版本列表加载失败");
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 数据加载模式，load 内 setState 是预期行为
      load();
    }
  }, [open, load]);

  if (!open) return null;

  // 派生：未手动选择时默认高亮最新一条
  const selected = versions.find((v) => v.id === selectedId)
    ?? (versions.length > 0 ? versions[0] : null);
  const contentDiff = selected
    ? parsePatch(createTwoFilesPatch("当前内容", `版本 #${selected.id}`, currentContent, selected.content))
    : [];
  const hasContentDiff = contentDiff.some((l) => l.type !== "ctx");
  const titleChanged = selected && selected.title !== currentTitle;
  const excerptChanged = selected && selected.excerpt !== currentExcerpt;

  async function handleRollback() {
    if (!selected) return;
    const ok = window.confirm(
      `回滚到 ${fmtTime(selected.createdAt)} 的版本？\n当前内容会先自动保存为新版本，之后仍可反悔。`
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const { post } = await api<{ post: RolledBackPost }>(
        `/api/posts/${postId}/versions/${selected.id}/rollback`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
      );
      onRolledBack(post);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "回滚失败，请重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border border-zinc-200 bg-white p-6 shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">版本历史</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg px-2 py-1 text-sm text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 disabled:opacity-60 dark:hover:bg-zinc-800"
          >
            关闭 ×
          </button>
        </div>

        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
        {loading && <p className="mt-6 text-center text-sm text-zinc-400">加载中…</p>}

        {!loading && versions.length === 0 && (
          <p className="mt-6 text-center text-sm text-zinc-400">
            暂无历史版本——首次保存前的内容不会产生快照，修改并保存后即可查看。
          </p>
        )}

        {!loading && versions.length > 0 && (
          <div className="mt-4 grid flex-1 grid-cols-1 gap-4 md:grid-cols-[240px_1fr]">
            {/* 左：版本时间线（新→旧） */}
            <div className="max-h-[60vh] space-y-1 overflow-y-auto pr-1">
              <div className="flex items-center justify-between px-2 pb-1">
                <span className="text-xs font-medium text-zinc-500">当前版本</span>
                <span className="truncate text-xs text-zinc-500">{currentTitle || "（未命名）"}</span>
              </div>
              {versions.map((v) => {
                const active = v.id === selectedId;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedId(v.id)}
                    className={`block w-full rounded-lg px-2 py-2 text-left transition ${
                      active
                        ? "bg-blue-50 dark:bg-blue-950/40"
                        : "hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    }`}
                  >
                    <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      {fmtTime(v.createdAt)}
                    </div>
                    <div className="truncate text-xs text-zinc-500">{v.title || "（未命名）"}</div>
                    <div className="text-[11px] text-zinc-400">正文 {v.chars} 字</div>
                  </button>
                );
              })}
            </div>

            {/* 右：diff + 回滚 */}
            <div className="flex min-w-0 flex-col">
              {selected && (
                <>
                  <div className="mb-2 text-xs text-zinc-500">
                    对比「当前版本 → 选中版本」
                  </div>

                  {titleChanged && (
                    <div className="mb-2 rounded-lg border border-zinc-200 p-2 text-xs dark:border-zinc-800">
                      <div className="text-zinc-400">标题</div>
                      <div className="text-red-500 line-through">{selected.title}</div>
                      <div className="text-emerald-600 dark:text-emerald-400">{currentTitle}</div>
                    </div>
                  )}
                  {excerptChanged && (
                    <div className="mb-2 rounded-lg border border-zinc-200 p-2 text-xs dark:border-zinc-800">
                      <div className="text-zinc-400">摘要</div>
                      <div className="text-red-500 line-through">{selected.excerpt}</div>
                      <div className="text-emerald-600 dark:text-emerald-400">{currentExcerpt}</div>
                    </div>
                  )}

                  <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-2 font-mono text-[11px] leading-relaxed dark:border-zinc-800 dark:bg-zinc-950">
                    {!hasContentDiff ? (
                      <p className="text-zinc-400">正文无变化</p>
                    ) : (
                      contentDiff.map((l, i) => (
                        <div
                          key={i}
                          className={
                            l.type === "add"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                              : l.type === "del"
                                ? "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300"
                                : "text-zinc-500"
                          }
                        >
                          <span className="select-none opacity-60">
                            {l.type === "add" ? "+" : l.type === "del" ? "-" : " "}
                          </span>
                          {l.text || " "}
                        </div>
                      ))
                    )}
                  </div>

                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={handleRollback}
                      disabled={busy}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
                    >
                      {busy ? "回滚中…" : "回滚到此版本"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
