"use client";

// 编辑器（PRD FR-6-03/09/11）：元信息表单 + MDEditor（仅编辑区，preview="edit"）
// + 右侧真实管线预览（PreviewFrame）+ 30s 自动保存 + 离开提醒 + 发布检查单。
// 草稿存数据库：新建首次保存 POST（服务端生成 slug），之后 PUT。
// 不用 MDEditor 自带预览——预览必须走 /api/posts/preview（与前台同一管线，FR-6-11）。
import MDEditor from "@uiw/react-md-editor";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PreviewFrame, type PreviewFrameData } from "./preview-frame";
import { PublishChecklist, type ChecklistState } from "./publish-checklist";
import { PostVersionHistory, type RolledBackPost } from "./post-version-history";

export interface EditorInitial {
  id: number | null; // null = 新建（首次保存后拿到 id）
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  status: "draft" | "published" | "hidden";
  publishedAt: string | null;
  scheduledFor: string | null;
  categoryId: number | null;
  tagIds: number[];
  /** 标题/日期展示用（新建时为空） */
  categoryName: string | null;
}

interface Meta {
  categories: { id: number; name: string }[];
  tags: { id: number; name: string }[];
}

interface PostFields {
  title: string;
  excerpt: string;
  content: string;
  categoryId: number; // 0 = 未选
  tagIds: number[];
  newTag: string; // 待提交的新标签名
}

type SaveStatus =
  | { kind: "clean" }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  | { kind: "error"; message: string };

function fmtTime(d: Date) {
  return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `请求失败（${res.status}）`);
  }
  return res.json() as Promise<T>;
}

export function PostEditor({ initial }: { initial: EditorInitial }) {
  const router = useRouter();
  const [meta, setMeta] = useState<Meta>({ categories: [], tags: [] });
  const [fields, setFields] = useState<PostFields>({
    title: initial.title,
    excerpt: initial.excerpt,
    content: initial.content,
    categoryId: initial.categoryId ?? 0,
    tagIds: initial.tagIds,
    newTag: "",
  });
  const [postId, setPostId] = useState<number | null>(initial.id);
  const [status, setStatus] = useState(initial.status);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({
    kind: initial.id ? "clean" : "dirty", // 新建页初始内容视为未保存
  });
  const [preview, setPreview] = useState<PreviewFrameData | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleTime, setScheduleTime] = useState("");
  const [scheduledFor, setScheduledFor] = useState<string | null>(initial.scheduledFor);
  const [busy, setBusy] = useState(false);

  const dirtyRef = useRef(saveStatus.kind === "dirty");
  const idRef = useRef(postId);
  const fieldsRef = useRef(fields);
  const savingRef = useRef<Promise<void>>(Promise.resolve());

  // 保持 ref 最新，避免 30s 定时器闭包拿到旧值
  useEffect(() => {
    fieldsRef.current = fields;
    idRef.current = postId;
  });

  // ---------- 元数据（分类/标签下拉） ----------
  useEffect(() => {
    api<Meta>("/api/meta")
      .then(setMeta)
      .catch((e) =>
        setPreviewError(e instanceof Error ? e.message : "元数据加载失败")
      );
  }, []);

  // ---------- 脏标记 ----------
  function markDirty() {
    dirtyRef.current = true;
    setSaveStatus((s) => (s.kind === "saving" ? s : { kind: "dirty" }));
  }

  function updateField<K extends keyof PostFields>(key: K, value: PostFields[K]) {
    setFields((f) => ({ ...f, [key]: value }));
    markDirty();
  }

  // ---------- 保存（手动/自动共用；串行队列防旧内容覆盖新内容） ----------
  const doSave = useCallback(async () => {
    const f = fieldsRef.current;
    const id = idRef.current;
    try {
      // 新标签先提交，拿到真实 id
      let tagIds = f.tagIds;
      if (f.newTag.trim()) {
        const { tag } = (await api<{ tag: { id: number; name: string } }>(
          "/api/meta",
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: f.newTag.trim() }) }
        )) as { tag: { id: number; name: string } };
        if (!tagIds.includes(tag.id)) tagIds = [...tagIds, tag.id];
        setMeta((m) =>
          m.tags.some((t) => t.id === tag.id)
            ? m
            : { ...m, tags: [...m.tags, { id: tag.id, name: tag.name }] }
        );
      }
      const body = {
        title: f.title,
        excerpt: f.excerpt,
        content: f.content,
        categoryId: f.categoryId,
        tagIds,
      };
      let savedId: number;
      if (id == null) {
        const { post } = (await api<{ post: { id: number } }>("/api/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })) as { post: { id: number } };
        savedId = post.id;
        setPostId(savedId);
        setFields((cur) => ({ ...cur, tagIds, newTag: "" }));
      } else {
        await api(`/api/posts/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        savedId = id;
        // 已发布/隐藏文章保存后状态不变（PUT 不改 status）
        // 保存成功：已提交的新标签并入 tagIds，输入框清空，标签 chip 立即可见
        setFields((cur) => ({ ...cur, tagIds, newTag: "" }));
      }
      dirtyRef.current = false;
      setSaveStatus({ kind: "saved", at: fmtTime(new Date()) });
    } catch (e) {
      // 失败：dirty 保持 true，下轮 30s 自动重试；内容不丢（仍在页面里）
      setSaveStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "保存失败",
      });
    }
  }, []);

  // 串行队列：新保存等上一次完成，保证顺序、防旧覆盖新
  const enqueueSave = useCallback(() => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    setSaveStatus({ kind: "saving" });
    const next = savingRef.current.then(() => doSave());
    savingRef.current = next.catch(() => {});
    return next;
  }, [doSave]);

  // ---------- 30s 自动保存（仅 dirty 时） ----------
  useEffect(() => {
    const timer = setInterval(() => {
      if (dirtyRef.current) enqueueSave();
    }, 30000);
    return () => clearInterval(timer);
  }, [enqueueSave]);

  // ---------- Ctrl/Cmd+S 手动保存 ----------
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault(); // 拦住浏览器「保存页面」对话框
        enqueueSave();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enqueueSave]);

  // ---------- 离开提醒 ----------
  // beforeunload：只对关闭/刷新标签页生效
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // 站内导航拦截（beforeunload 不覆盖 SPA 跳转）
  function confirmLeave() {
    return !dirtyRef.current || window.confirm("有未保存的修改，确定离开？");
  }

  function safeGo(href: string) {
    if (confirmLeave()) router.push(href);
  }

  // ---------- 实时预览（debounce 500ms，与「预览按钮」同一接口） ----------
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const data = (await api<{ html: string; toc: PreviewFrameData["toc"]; readingMinutes: number }>(
          "/api/posts/preview",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: fields.title,
              excerpt: fields.excerpt,
              content: fields.content,
            }),
          }
        )) as { html: string; toc: PreviewFrameData["toc"]; readingMinutes: number };
        setPreview({
          html: data.html,
          toc: data.toc,
          readingMinutes: data.readingMinutes,
          title: fields.title || "（未命名文章）",
          excerpt: fields.excerpt,
          date: initial.publishedAt
            ? initial.publishedAt.slice(0, 10)
            : new Date().toISOString().slice(0, 10),
          category: meta.categories.find((c) => c.id === fields.categoryId)?.name ?? "",
          tags: fields.tagIds.map((id) => meta.tags.find((t) => t.id === id)?.name ?? ""),
        });
        setPreviewError(null);
      } catch (e) {
        // 渲染失败兜底：预览区显示报错文本而不是白屏
        setPreviewError(e instanceof Error ? e.message : "预览渲染失败");
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [fields.title, fields.excerpt, fields.content, fields.categoryId, fields.tagIds, meta, initial.publishedAt]);

  // ---------- 发布检查单 ----------
  const checklistState: ChecklistState = {
    hasCategory: fields.categoryId > 0,
    hasTag: fields.tagIds.length > 0 || fields.newTag.trim().length > 0,
    hasExcerpt: fields.excerpt.trim().length > 0,
    isPublished: status === "published",
  };

  async function handlePublish(opts: { refreshPublishedAt: boolean }) {
    if (idRef.current == null) throw new Error("请先保存文章再发布");
    await enqueueSave();
    const id = idRef.current;
    if (id == null) throw new Error("请先保存文章再发布");
    await api(`/api/posts/${id}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshPublishedAt: opts.refreshPublishedAt }),
    });
    setStatus("published");
  }

  async function handleUnpublish() {
    if (idRef.current == null) return;
    setBusy(true);
    try {
      await api(`/api/posts/${idRef.current}`, { method: "POST" });
      setStatus("draft");
    } catch (e) {
      alert(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  // ---------- 定时发布（FR-6-06） ----------
  async function handleSchedule() {
    if (idRef.current == null) {
      alert("请先保存文章再设置定时发布");
      return;
    }
    if (!scheduleTime) {
      alert("请选择定时发布时间");
      return;
    }
    // datetime-local 值无时区，按浏览器本地时区转成 UTC ISO，避免服务器按 UTC 解析差 8 小时
    const scheduleIso = new Date(scheduleTime).toISOString();
    setBusy(true);
    try {
      const { post } = (await api<{ post: { scheduledFor: string } }>(
        `/api/posts/${idRef.current}/schedule`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scheduledFor: scheduleIso }) }
      )) as { post: { scheduledFor: string } };
      setScheduledFor(post.scheduledFor);
      setScheduleOpen(false);
      setScheduleTime("");
    } catch (e) {
      alert(e instanceof Error ? e.message : "设置定时发布失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleCancelSchedule() {
    if (idRef.current == null) return;
    if (!confirm("取消定时发布？")) return;
    setBusy(true);
    try {
      const { post } = (await api<{ post: { scheduledFor: null } }>(
        `/api/posts/${idRef.current}/schedule`,
        { method: "DELETE" }
      )) as { post: { scheduledFor: null } };
      setScheduledFor(post.scheduledFor);
    } catch (e) {
      alert(e instanceof Error ? e.message : "取消定时失败");
    } finally {
      setBusy(false);
    }
  }

  // ---------- 版本历史（FR-6-10） ----------
  // 回滚成功后：DB 已是目标版本内容，内存同步三字段、清 dirty（不制造假脏标记）。
  // 预览 debounce 随 content 变化自动重算；分类/标签/状态不动（回滚只找回文字）
  function handleRolledBack(post: RolledBackPost) {
    setFields((cur) => ({ ...cur, title: post.title, excerpt: post.excerpt, content: post.content }));
    dirtyRef.current = false;
    setSaveStatus({ kind: "saved", at: fmtTime(new Date()) });
  }

  // ---------- 保存状态文案 ----------
  const statusText = (() => {
    switch (saveStatus.kind) {
      case "dirty":
        return "有未保存修改";
      case "saving":
        return "保存中…";
      case "saved":
        return `已保存 ${saveStatus.at}`;
      case "error":
        return `保存失败：${saveStatus.message}（内容仍在本页，30 秒后自动重试）`;
      default:
        return "无修改";
    }
  })();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      {/* 顶部导航出口（站内跳转走 confirmLeave 拦截） */}
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => safeGo("/admin")}
          className="text-sm text-zinc-500 hover:underline"
        >
          ← 返回文章列表
        </button>
        <span className="text-xs text-zinc-400">
          {postId != null ? `/${initial.slug}` : "新文章（保存后生成 slug）"}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 左：编辑区 */}
        <div className="min-w-0 space-y-4">
          <input
            value={fields.title}
            onChange={(e) => updateField("title", e.target.value)}
            placeholder="文章标题"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-lg font-semibold focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
          />
          <textarea
            value={fields.excerpt}
            onChange={(e) => updateField("excerpt", e.target.value)}
            placeholder="摘要（发布前必填，≤200 字）"
            rows={2}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
          />

          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-2 text-sm">
              分类
              <select
                value={fields.categoryId}
                onChange={(e) => updateField("categoryId", Number(e.target.value))}
                className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                <option value={0}>未选择</option>
                {meta.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-center gap-1">
              {fields.tagIds.map((id) => {
                const name = meta.tags.find((t) => t.id === id)?.name ?? `#${id}`;
                return (
                  <button
                    key={id}
                    type="button"
                    title="移除标签"
                    onClick={() =>
                      updateField("tagIds", fields.tagIds.filter((t) => t !== id))
                    }
                    className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-600 transition hover:bg-zinc-200 hover:text-red-600 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                  >
                    #{name} ×
                  </button>
                );
              })}
            </div>

            <input
              value={fields.newTag}
              onChange={(e) => updateField("newTag", e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && fields.newTag.trim()) {
                  e.preventDefault();
                  enqueueSave(); // 新标签随下次保存提交
                }
              }}
              placeholder="输入新标签，回车随保存提交"
              className="rounded-lg border border-dashed border-zinc-300 bg-transparent px-2.5 py-1 text-xs focus:border-blue-500 focus:outline-none dark:border-zinc-700"
            />
          </div>

          <div data-color-mode="light">
            <MDEditor
              value={fields.content}
              onChange={(v) => updateField("content", v ?? "")}
              preview="edit"
              height={560}
              visibleDragbar={false}
              textareaProps={{ placeholder: "开始写 Markdown…" }}
            />
          </div>
        </div>

        {/* 右：真实管线预览（同一接口，所见即读者所见） */}
        <div className="min-w-0">
          <div className="h-[calc(100vh-180px)] overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <PreviewFrame data={preview} error={previewError} />
          </div>
        </div>
      </div>

      {/* 页底固定保存栏 */}
      <div className="fixed inset-x-0 bottom-0 border-t border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <span
            className={`text-sm ${
              saveStatus.kind === "error"
                ? "text-red-500"
                : saveStatus.kind === "saving"
                  ? "text-blue-500"
                  : "text-zinc-500"
            }`}
          >
            {statusText}
          </span>
          <div className="flex gap-2">
            {postId != null && (
              <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                版本历史
              </button>
            )}
            {postId != null && status !== "published" && (
              <button
                type="button"
                onClick={() => setScheduleOpen((v) => !v)}
                className="rounded-lg border border-blue-300 px-4 py-2 text-sm text-blue-600 transition hover:bg-blue-50 dark:border-blue-900 dark:text-blue-400 dark:hover:bg-blue-950"
              >
                {scheduledFor ? "修改定时" : "定时发布"}
              </button>
            )}
            <button
              type="button"
              onClick={() => enqueueSave()}
              disabled={saveStatus.kind === "saving"}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {saveStatus.kind === "saving" ? "保存中…" : status === "hidden" ? "保存为隐藏" : "保存草稿"}
            </button>
            {status === "published" && (
              <button
                type="button"
                onClick={handleUnpublish}
                disabled={busy}
                className="rounded-lg border border-amber-300 px-4 py-2 text-sm text-amber-600 transition hover:bg-amber-50 disabled:opacity-60 dark:border-amber-900 dark:text-amber-400 dark:hover:bg-amber-950"
              >
                下线（存为草稿）
              </button>
            )}
            <button
              type="button"
              onClick={() => setChecklistOpen(true)}
              disabled={busy}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              {status === "published" ? "重新发布" : "发布"}
            </button>
          </div>
        </div>
      </div>
      {/* 给固定栏留出空间 */}
      <div className="h-16" />

      {/* 定时发布弹窗 */}
      {scheduleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setScheduleOpen(false)}>
          <div className="w-80 rounded-xl bg-white p-5 shadow-lg dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-100">定时发布</h3>
            {scheduledFor && (
              <p className="mb-2 text-sm text-zinc-500 dark:text-zinc-400">
                当前定时：{new Date(scheduledFor).toLocaleString("zh-CN", { hour12: false })}
              </p>
            )}
            <input
              type="datetime-local"
              value={scheduleTime}
              onChange={(e) => setScheduleTime(e.target.value)}
              min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
              className="mb-4 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
            <div className="flex justify-end gap-2">
              {scheduledFor && (
                <button
                  type="button"
                  onClick={handleCancelSchedule}
                  disabled={busy}
                  className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-600 transition hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                >
                  取消定时
                </button>
              )}
              <button
                type="button"
                onClick={() => setScheduleOpen(false)}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                关闭
              </button>
              <button
                type="button"
                onClick={handleSchedule}
                disabled={busy || !scheduleTime}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
              >
                {busy ? "设置中…" : "确认"}
              </button>
            </div>
          </div>
        </div>
      )}

      <PublishChecklist
        open={checklistOpen}
        state={checklistState}
        onPublished={() => setChecklistOpen(false)}
        onClose={() => setChecklistOpen(false)}
        onPublish={handlePublish}
      />

      {postId != null && (
        <PostVersionHistory
          open={historyOpen}
          postId={postId}
          currentTitle={fields.title}
          currentExcerpt={fields.excerpt}
          currentContent={fields.content}
          onRolledBack={handleRolledBack}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </div>
  );
}
