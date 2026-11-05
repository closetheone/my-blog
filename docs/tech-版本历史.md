# 技术方案：文章版本历史（FR-6-10，P2）

日期：2026-11-05。前置：FR-6-03/04/09/11（编辑器与文章管理，PR #14）、FR-6-12（管理员改密，PR #15）已合并。

## 0. 需求回顾（PRD FR-6-10）

> 每次保存留版本快照，可查看 diff、可回滚。

## 1. 关键设计决策

| 决策点 | 选择 | 理由 |
| --- | --- | --- |
| 快照什么 | 保存前的 `title + excerpt + content`（上一状态） | 「版本历史」价值在正文可找回；分类/标签是枚举型元数据，回滚它们没有意义且易与当前选择不一致 |
| 何时拍快照 | `updatePost`（编辑器每次保存）和 `publishPost`（发布/重新发布，含「更新发布时间」语义变更）里，**落库前**对旧内容拍快照 | 回滚目标是「恢复上一份」，必须存的是写库前的状态 |
| 去重 | 与最近一条快照三元组完全相同则跳过 | 30s 自动保存对无改动内容也会 PUT，不去重会刷出大量重复版本 |
| 回滚语义 | 回滚 = 一次保存：先对当前内容拍快照（可二次反悔），再把快照内容写回 post | 回滚本身不丢信息，可以反悔 |
| 版本上限 | 不限量 | 个人博客量级：快照只在内容变化时产生，30s 自动保存去重后一天几百条 × ~KB 可忽略；引入上限+清理是额外复杂度，YAGNI |
| diff 粒度 | 按行（`diff` 库 `createTwoFilesPatch`） | 前端本地计算，无后端负担；行级 diff 对 Markdown 足够直观 |
| 级联删除 | `Post` 删除时级联删版本（Prisma `onDelete: Cascade`） | 与 PostTag 一致 |
| 时间线排序 | `id desc`（新→旧），当前内容恒为「最新」，不单独存 | 当前内容就是 post 行本身 |

## 2. 改动总览

| 层 | 文件 | 改动 |
| --- | --- | --- |
| Schema | `prisma/schema.prisma` | **新增** `PostVersion` 模型；migration |
| 逻辑 | `src/lib/posts.ts` | `updatePost`/`publishPost` 事务内拍快照；**新增** `listPostVersions(id)`、`rollbackPostVersion(id, versionId)` |
| API | `src/app/api/posts/[id]/versions/route.ts` | **新增** GET 版本列表（requireAdminRead） |
| API | `src/app/api/posts/[id]/versions/[versionId]/rollback/route.ts` | **新增** POST 回滚（requireAdmin，含 Origin CSRF） |
| 组件 | `src/components/admin/post-version-history.tsx` | **新增** 版本历史弹窗：时间线 + 行级 diff + 回滚按钮 |
| 组件 | `src/components/admin/post-editor.tsx` | 底栏加「版本历史」按钮（仅 postId 存在时），接弹窗；回滚成功后同步字段 + 清 dirty |
| 依赖 | `package.json` | **新增** `diff`（自带类型定义，无需 @types） |

不改 seed、不改前台、不改 proxy。

## 3. 后端

### 3.1 Schema（新增模型）

```prisma
// ---------- 文章版本快照（FR-6-10：每次保存前拍快照，可 diff / 可回滚）----------
model PostVersion {
  id        Int      @id @default(autoincrement())
  postId    Int
  post      Post     @relation(fields: [postId], references: [id], onDelete: Cascade)
  title     String
  excerpt   String
  content   String // Markdown 原文
  createdAt DateTime @default(now())

  @@index([postId, id(sort: Desc)])
}
```

`Post` 模型加反向关系 `versions PostVersion[]`。

### 3.2 `src/lib/posts.ts`

**拍快照（私有）**：

```ts
// 内容三字段与最近一条快照完全相同则跳过（自动保存去重）
async function snapshotIfChanged(post: { id: number; title: string; excerpt: string; content: string }) {
  const last = await prisma.postVersion.findFirst({
    where: { postId: post.id },
    orderBy: { id: "desc" },
  });
  if (last && last.title === post.title && last.excerpt === post.excerpt && last.content === post.content) {
    return;
  }
  await prisma.postVersion.create({ data: { postId: post.id, title: post.title, excerpt: post.excerpt, content: post.content } });
}
```

`updatePost` 改造：`findUnique` 拿旧 post → `prisma.$transaction([snapshot, update])` 原子执行（快照失败则整体不落库，不会出现「改了库没有版本」）。`publishPost` 同理（发布动作本身也是状态变更，值得留痕；快照存的是发布前的内容）。

**列表**（时间线，新→旧）：

```ts
export async function listPostVersions(postId: number) {
  const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
  if (!post) throw new HttpError(404, "文章不存在");
  const versions = await prisma.postVersion.findMany({
    where: { postId },
    orderBy: { id: "desc" },
  });
  return versions.map((v) => ({
    id: v.id,
    title: v.title,
    excerpt: v.excerpt,
    content: v.content,
    createdAt: v.createdAt,
    chars: v.content.length, // 前端显示体量用
  }));
}
```

**回滚**（= 一次保存：先快照当前，再写回目标版本内容）：

```ts
export async function rollbackPostVersion(postId: number, versionId: number) {
  const [post, version] = await prisma.$transaction([
    prisma.post.findUnique({ where: { id: postId } }),
    prisma.postVersion.findFirst({ where: { id: versionId, postId } }),
  ]);
  if (!post) throw new HttpError(404, "文章不存在");
  if (!version) throw new HttpError(404, "版本不存在");
  const updated = await prisma.$transaction(async (tx) => {
    // 回滚前对「当前内容」拍快照（内容相同自动跳过），保证回滚可反悔
    if (post.title !== version.title || post.excerpt !== version.excerpt || post.content !== version.content) {
      await tx.postVersion.create({ data: { postId, title: post.title, excerpt: post.excerpt, content: post.content } });
    }
    return tx.post.update({
      where: { id: postId },
      data: { title: version.title, excerpt: version.excerpt, content: version.content },
      include: LIST_INCLUDE,
    });
  });
  revalidateTag("posts", { expire: 0 });
  return { ...toAdminPost(updated), content: updated.content, categoryId: updated.categoryId, tagIds: updated.tags.map((t) => t.tag.id) };
}
```

注意：回滚**不改 status / publishedAt / 分类 / 标签**——语义是「找回文字」，不是「时光倒流」。前端回滚后只同步 title/excerpt/content。

### 3.3 API

- `GET /api/posts/[id]/versions` → `requireAdminRead()`（只读不校验 Origin）→ `{ versions: [...] }`
- `POST /api/posts/[id]/versions/[versionId]/rollback` → `requireAdmin(req)`（Origin CSRF + 会话）→ `{ post }`（复用 `toResponse` 错误模式）

## 4. 前端

### 4.1 `post-version-history.tsx`（新增，"use client"）

弹窗（fixed overlay，样式对齐 `publish-checklist.tsx` 的弹窗模式）：

- 打开即 `GET /api/posts/[id]/versions`；空列表显示「暂无历史版本」（首次保存前必然如此）。
- 时间线：每行 `createdAt`（本地时区 `toLocaleString`）+ 快照 title + 正文字数。当前选中项高亮。
- 选中某版本 → 下方展示 diff：`diff.createTwoFilesPatch("当前", "该版本", 当前content, 版本content)`，按 hunk 渲染，删除行红底、新增行绿底（终端式 diff，代码块样式）。同时展示 title/excerpt 的变更行（有变化才显示）。
- 每个版本行一个「回滚到此版本」按钮：`window.confirm` 二次确认（文案说明会覆盖当前内容、可再反悔）→ POST rollback → 成功后 `onRolledBack(post)` 回调 + 关闭弹窗。
- 顶部按钮：关闭。

当前内容（`fields.content` 等）由 PostEditor 通过 props 传入，diff 全在前端算，不请求后端。

### 4.2 `post-editor.tsx`（小改）

- 底栏「发布」按钮左侧加「版本历史」按钮（`postId != null` 才渲染）。
- 弹窗状态 `historyOpen`。
- `onRolledBack(post)`：
  - `setFields` 同步 title/excerpt/content（**不动** tagIds/categoryId/newTag）
  - `setSaveStatus({ kind: "clean" })` + `dirtyRef.current = false`（DB 已是快照内容，内存与库一致，不制造假 dirty；预览 debounce 会自动重算）
  - 重新 `GET /api/posts/[id]/versions` 由弹窗关闭时自然失效，下次打开重拉

## 5. 验证计划（curl）

1. `prisma migrate dev` + `pnpm build` 通过
2. 登录拿 token → 建文章 → 保存 v1 → 保存 v2（改内容）→ `GET versions` 应返回 1 条（保存 v1 前拍的是创建时的空内容快照……注意：createPost 不拍快照，首个版本是「第一次 PUT 前的状态」= 创建时内容）
3. 无改动重复 PUT → 版本数不增（去重生效）
4. `POST rollback` 回滚到 v1 → post 内容 = v1 内容；`GET versions` 多 1 条（回滚前当前状态被快照）
5. 再回滚回 v2（反悔路径）
6. 删除文章 → versions 表该 post 行清零（级联）
7. 未登录 GET versions → 401；跨域 POST rollback（带 Origin 头）→ 403

## 6. 实现说明

- `updatePost` 中先比较新旧三字段，无变化则跳过快照（避免 30s 自动保存空转时产生重复版本）。`snapshotIfChanged` 内部还有一次与最近版本的对比，双保险。
- `publishPost` 也拍快照：发布前内容 → 发布状态变更，属于有意义的版本节点。
- 回滚时先拍当前快照再写入目标内容，确保「反悔」链完整。
- 前端 diff 用 `diff` 库（MIT，纯函数），`createTwoFilesPatch` 生成 unified diff 后解析为行列表渲染。不引入重量级 diff 可视化库。
- 版本表无上限：个人博客场景下内容变更频率极低（一天最多几十次保存），无需引入分页/清理策略。
- **新增依赖**：`diff`（~30KB min+gzip，MIT），纯函数行级 diff，无其他重依赖。
