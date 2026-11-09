"use client";

// 文章页评论区（PRD FR-3-01/06/07）
// - 正序展示，两级层级：一级 + 其下二级缩进；回复二级时自动「@一级作者」
// - 昵称 + 邮箱必填（邮箱不公开，仅拼 Gravatar URL），网址选填
// - 头像：Gravatar d=identicon（无头像时自动几何图）；referrerPolicy 必须 no-referrer
// - 评论纯文本 {text} 插值渲染（React 转义，无 XSS 面）
// 交互：默认折叠「发表评论（N）」，点击展开表单；提交成功直接插入列表不整页刷新

import { useState } from "react";

type ReplyView = {
  id: number;
  nickname: string;
  url: string | null;
  content: string;
  emailHash: string;
  pinned: boolean;
  createdAt: string;
};
type CommentView = ReplyView & { replies: ReplyView[] };

type FormFields = {
  nickname: string;
  email: string;
  content: string;
  url: string;
};
const EMPTY_FORM: FormFields = { nickname: "", email: "", content: "", url: "" };

const gravatarUrl = (hash: string) =>
  `https://www.gravatar.com/avatar/${hash}?d=identicon&s=80`;

// 中文相对时间（>1 天显示日期）；纯展示，时间基准用惰性初始化避免渲染期 Date.now()
function useTimeBase() {
  const [base] = useState(() => Date.now());
  return (iso: string) => {
    const t = new Date(iso).getTime();
    const diff = base - t;
    if (diff < 60 * 1000) return "刚刚";
    if (diff < 3600 * 1000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 24 * 3600 * 1000) return `${Math.floor(diff / 3600000)} 小时前`;
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
}

// @昵称 高亮
function renderContent(text: string) {
  const parts = text.split(/(@[^\s@]+)/g);
  return parts.map((p, i) =>
    p.startsWith("@") ? (
      <span key={i} className="text-blue-600 dark:text-blue-400">
        {p}
      </span>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}

function Avatar({ emailHash, nickname }: { emailHash: string; nickname: string }) {
  const [ok, setOk] = useState(true);
  if (!ok) {
    // Gravatar 加载失败兜底：首字圆块（非灰色占位块，用昵称首字 + 哈希色）
    const hue = (emailHash.charCodeAt(0) + emailHash.charCodeAt(1)) % 360;
    return (
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
        style={{ backgroundColor: `hsl(${hue}, 55%, 55%)` }}
      >
        {nickname.slice(0, 1)}
      </span>
    );
  }
  // Gravatar 是外部域名 + 需要 onError 切本地兜底头像，next/image 不适用
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={gravatarUrl(emailHash)}
      alt={nickname}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setOk(false)}
      className="h-9 w-9 shrink-0 rounded-full"
    />
  );
}

export function CommentSection({
  postId,
  enabled,
  initialCount,
}: {
  postId: number;
  enabled: boolean;
  initialCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<CommentView[] | null>(null);
  const [count, setCount] = useState(initialCount);
  const [form, setForm] = useState<FormFields>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  // 回复状态：parent = 一级评论；atPrefix = 回复二级时自动带上的「@一级作者 」
  const [replyTo, setReplyTo] = useState<{ parent: CommentView; atPrefix: string } | null>(null);
  const fmtTime = useTimeBase();

  function updateForm(patch: Partial<FormFields>) {
    setForm((f) => ({ ...f, ...patch }));
  }

  async function submit(parentId: number | null, atPrefix: string) {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postId,
          parentId,
          nickname: form.nickname,
          email: form.email,
          content: atPrefix ? atPrefix + form.content.trim() : form.content,
          url: form.url || undefined,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | (ReplyView & { replies?: never })
        | { error?: string }
        | null;
      if (!res.ok || !data || !("id" in data)) {
        throw new Error(data && "error" in data ? data.error ?? "提交失败" : "提交失败");
      }
      const created: ReplyView = data;
      if (parentId == null) {
        setComments((cs) => [...(cs ?? []), { ...created, replies: [] }]);
      } else {
        setComments((cs) =>
          (cs ?? []).map((c) =>
            c.id === parentId ? { ...c, replies: [...c.replies, created] } : c
          )
        );
      }
      setCount((n) => n + 1);
      setForm(EMPTY_FORM);
      setReplyTo(null);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  // ---------- 关闭评论态（FR-3-06） ----------
  if (!enabled) {
    return (
      <section className="mt-10 border-t border-zinc-200 pt-6 text-sm text-zinc-500 dark:border-zinc-800">
        本文已关闭评论
      </section>
    );
  }

  // ---------- 折叠态 ----------
  if (!open) {
    return (
      <section className="mt-10 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            fetch(`/api/comments?postId=${postId}`)
              .then((r) => (r.ok ? r.json() : null))
              .then((d) => {
                if (d && Array.isArray(d.comments)) {
                  setComments(d.comments);
                  // 计数含二级回复
                  setCount(
                    d.comments.reduce(
                      (n: number, c: CommentView) => n + 1 + c.replies.length,
                      0
                    )
                  );
                }
              })
              .catch(() => setComments([]));
          }}
          className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-left text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:text-zinc-300 dark:hover:border-zinc-600"
        >
          发表评论（{count}）
        </button>
      </section>
    );
  }

  // ---------- 展开态 ----------
  const list = comments;
  const fieldCls =
    "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100";
  const labelCls = "mb-1 block text-xs text-zinc-500";

  return (
    <section className="mt-10 border-t border-zinc-200 pt-6 dark:border-zinc-800">
      <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-100">
        评论（{count}）
      </h2>

      {/* 列表 */}
      <div className="space-y-5">
        {list == null && <p className="text-sm text-zinc-400">加载中…</p>}
        {list != null && list.length === 0 && (
          <p className="text-sm text-zinc-400">还没有评论，来抢沙发吧</p>
        )}
        {list?.map((c) => (
          <div key={c.id}>
            {/* 一级 */}
            <div className="flex gap-3">
              <Avatar emailHash={c.emailHash} nickname={c.nickname} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  {c.pinned && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                      置顶
                    </span>
                  )}
                  {c.url ? (
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-zinc-800 hover:underline dark:text-zinc-200"
                    >
                      {c.nickname}
                    </a>
                  ) : (
                    <span className="font-medium text-zinc-800 dark:text-zinc-200">
                      {c.nickname}
                    </span>
                  )}
                  <span className="text-xs text-zinc-400">{fmtTime(c.createdAt)}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-zinc-700 dark:text-zinc-300">
                  {renderContent(c.content)}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setReplyTo({ parent: c, atPrefix: "" })
                  }
                  className="mt-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                >
                  回复
                </button>
              </div>
            </div>
            {/* 二级（缩进） */}
            {c.replies.map((r) => (
              <div key={r.id} className="mt-4 flex gap-3 pl-12">
                <Avatar emailHash={r.emailHash} nickname={r.nickname} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    {r.pinned && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                        置顶
                      </span>
                    )}
                    {r.url ? (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-zinc-800 hover:underline dark:text-zinc-200"
                      >
                        {r.nickname}
                      </a>
                    ) : (
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">
                        {r.nickname}
                      </span>
                    )}
                    <span className="text-xs text-zinc-400">{fmtTime(r.createdAt)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-zinc-700 dark:text-zinc-300">
                    {renderContent(r.content)}
                  </p>
                  {/* 回复二级 → 目标是其一级评论，自动 @一级作者（PRD：更深层用 @昵称） */}
                  <button
                    type="button"
                    onClick={() =>
                      setReplyTo({ parent: c, atPrefix: `@${c.nickname} ` })
                    }
                    className="mt-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                  >
                    回复
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* 评论表单 */}
      <div className="mt-6 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <p className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {replyTo ? `回复 ${replyTo.parent.nickname}` : "发表评论"}
        </p>
        {replyTo && (
          <div className="mb-3 flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-500 dark:bg-zinc-800/60">
            <span className="truncate">
              回复给 <span className="font-medium">{replyTo.parent.nickname}</span>
              {replyTo.atPrefix && (
                <span className="ml-1 text-blue-600 dark:text-blue-400">
                  （自动 @{replyTo.parent.nickname}）
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              className="shrink-0 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              取消
            </button>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>昵称 *</label>
            <input
              value={form.nickname}
              onChange={(e) => updateForm({ nickname: e.target.value })}
              maxLength={20}
              placeholder="你的昵称"
              className={fieldCls}
            />
          </div>
          <div>
            <label className={labelCls}>邮箱 *（不公开显示，仅用于头像）</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => updateForm({ email: e.target.value })}
              placeholder="you@example.com"
              className={fieldCls}
            />
          </div>
        </div>
        <div className="mt-3">
          <label className={labelCls}>评论内容 *</label>
          <textarea
            value={form.content}
            onChange={(e) => updateForm({ content: e.target.value })}
            maxLength={1000}
            rows={3}
            placeholder="说点什么…"
            className={fieldCls}
          />
        </div>
        <div className="mt-3">
          <label className={labelCls}>个人网址（选填）</label>
          <input
            value={form.url}
            onChange={(e) => updateForm({ url: e.target.value })}
            maxLength={200}
            placeholder="https://…"
            className={fieldCls}
          />
        </div>
        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
        <div className="mt-3 flex items-center justify-end">
          <button
            type="button"
            onClick={() => submit(replyTo ? replyTo.parent.id : null, replyTo?.atPrefix ?? "")}
            disabled={submitting}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting ? "提交中…" : "提交评论"}
          </button>
        </div>
      </div>
    </section>
  );
}
