"use client";

// 发布检查单弹窗（PRD FR-6-09）：分类 ✓/✗、标签 ✓/✗（至少 1 个）、摘要 ✓/✗（非空）。
// 全绿 → 直接发布；有 ✗ → 红色提示，「仍要发布」需再点一次确认（二次确认，PRD 原文）。
// 已发布文章提供「更新发布时间」勾选（FR-6-07 手动更新入口）。
import { useState } from "react";

export interface ChecklistState {
  hasCategory: boolean;
  hasTag: boolean;
  hasExcerpt: boolean;
  /** 文章当前是否已发布（决定是否显示「更新发布时间」勾选） */
  isPublished: boolean;
}

export function PublishChecklist({
  open,
  state,
  onPublished,
  onClose,
  onPublish,
}: {
  open: boolean;
  state: ChecklistState;
  onPublished: () => void;
  onClose: () => void;
  onPublish: (opts: { refreshPublishedAt: boolean }) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [refreshPublishedAt, setRefreshPublishedAt] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const allOk = state.hasCategory && state.hasTag && state.hasExcerpt;

  // 关弹窗时复位中间态（二次确认勾选等）
  function close() {
    setConfirming(false);
    setRefreshPublishedAt(false);
    setError(null);
    onClose();
  }

  async function handlePublish() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onPublish({ refreshPublishedAt });
      setConfirming(false);
      setRefreshPublishedAt(false);
      onPublished();
    } catch (e) {
      setError(e instanceof Error ? e.message : "发布失败，请重试");
    } finally {
      setBusy(false);
    }
  }

  const Row = ({ ok, label }: { ok: boolean; label: string }) => (
    <li className="flex items-center justify-between py-1.5">
      <span className="text-sm">{label}</span>
      <span className={ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}>
        {ok ? "✓" : "✗"}
      </span>
    </li>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={busy ? undefined : close}
    >
      <div
        className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold">发布检查单</h2>
        <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
          <Row ok={state.hasCategory} label="分类" />
          <Row ok={state.hasTag} label="标签（至少 1 个）" />
          <Row ok={state.hasExcerpt} label="摘要（非空）" />
        </ul>

        {!allOk && (
          <p className="mt-3 text-sm text-red-500">有未就绪项，坚持发布需二次确认。</p>
        )}

        {state.isPublished && (
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={refreshPublishedAt}
              onChange={(e) => setRefreshPublishedAt(e.target.checked)}
            />
            更新发布时间为当前时间（FR-6-07）
          </label>
        )}

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={close}
            disabled={busy}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            取消
          </button>
          {!allOk && !confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={busy}
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-600 disabled:opacity-60"
            >
              仍要发布
            </button>
          ) : (
            <button
              type="button"
              onClick={handlePublish}
              disabled={busy}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              {busy
                ? "发布中…"
                : confirming
                  ? "确认发布（二次确认）"
                  : allOk
                    ? "发布"
                    : "发布"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
