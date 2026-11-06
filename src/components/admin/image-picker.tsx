"use client";

// 图片选择弹窗（PRD FR-6-05）：上传（≤5MB、jpeg/png/webp/gif，服务端压缩）
// + 图库网格（当前文章已关联的图带角标，点击即插入；支持跨文章复用）。
// 选中回调只给 URL——插入正文与关联均由 post-editor 处理（关联在保存后补传）。
import { useEffect, useRef, useState } from "react";
import type { ImageListItem } from "@/lib/images";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function ImagePicker({
  open,
  postId,
  onPick,
  onClose,
}: {
  open: boolean;
  postId: number | null; // null = 新建未保存（列表不标记关联）
  onPick: (url: string) => void;
  onClose: () => void;
}) {
  // null = 加载中（避免在 effect 里同步 setState 触发级联渲染）
  const [images, setImages] = useState<ImageListItem[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(postId ? `/api/images?postId=${postId}` : "/api/images");
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `请求失败（${res.status}）`);
        }
        const list = (await res.json()) as ImageListItem[];
        if (!cancelled) setImages(list);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "加载图库失败");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, postId]);

  if (!open) return null;

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 同一文件可重复选
    if (!file) return;
    // 前端预检仅为即时反馈，权威校验在服务端
    if (!ALLOWED.includes(file.type)) {
      setError("仅支持 JPEG / PNG / WebP / GIF");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("图片超过 5MB 限制");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/images", { method: "POST", body: form });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `上传失败（${res.status}）`);
      }
      // 重新拉取（重开弹窗 effect 会触发，这里手动刷新：临时改 open 状态太绕，直接 fetch）
      const res2 = await fetch(postId ? `/api/images?postId=${postId}` : "/api/images");
      if (res2.ok) setImages(await res2.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={uploading ? undefined : onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl border border-zinc-200 bg-white p-6 shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">插入图片</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 transition hover:text-zinc-600 dark:hover:text-zinc-200"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <input ref={fileRef} type="file" accept={ALLOWED.join(",")} className="hidden" onChange={handleUpload} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {uploading ? "上传中…" : "上传图片"}
          </button>
          <span className="text-xs text-zinc-400">≤5MB · JPEG / PNG / WebP / GIF（自动压缩）</span>
        </div>

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
          {images === null ? (
            <p className="py-8 text-center text-sm text-zinc-400">加载中…</p>
          ) : images.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-400">图库还是空的，先上传一张吧</p>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {images.map((img) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => {
                    onPick(img.url);
                    onClose();
                  }}
                  className="group relative overflow-hidden rounded-lg border border-zinc-200 transition hover:border-blue-500 dark:border-zinc-700 dark:hover:border-blue-400"
                  title={`${img.filename}（${img.width}×${img.height}，${fmtBytes(img.sizeBytes)}）`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={img.filename} className="aspect-square w-full object-cover" />
                  {img.usedByThisPost && (
                    <span className="absolute left-1 top-1 rounded bg-blue-600/90 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      已用
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <p className="mt-4 text-xs text-zinc-400">点击图片插入到正文末尾</p>
      </div>
    </div>
  );
}
