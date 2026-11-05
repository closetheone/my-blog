// 服务端文章管理逻辑层（FR-6-03/04/09/11）
// 所有 /api/posts* 路由共用：统一鉴权（requireAdmin）、slug 生成、字段校验、
// 落库 + 缓存失效（revalidateTag("posts", { expire: 0 })）。避免每个 route 重复鉴权/校验。
// 数据库零改动：草稿就是 status="draft" 的 Post 行。

import "server-only";
import { revalidateTag } from "next/cache";
import GithubSlugger from "github-slugger";
import { prisma } from "./prisma";
import { getCurrentAdmin } from "./auth";
import type { Prisma } from "@prisma/client";

// ---------- 错误类型（route 里 try/catch 统一转 Response） ----------

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

// ---------- 鉴权 ----------

// 写接口（POST/PUT/DELETE）鉴权：
// 1) Origin 同源校验（CSRF，照抄 login route 的模式）
// 2) getCurrentAdmin() 查库校验（无效/过期 token 在这里被兜住；
//    proxy 只拦 /admin 页面，API 不经过 proxy，安全完全依赖这里）
export async function requireAdmin(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && new URL(req.url).origin !== origin) {
    throw new HttpError(403, "CSRF 校验失败");
  }
  const session = await getCurrentAdmin();
  if (!session) {
    throw new HttpError(401, "未登录或会话已过期");
  }
  return session;
}

// 读/预览接口鉴权：不校验 Origin（无副作用，CSRF 攻击面无意义）
export async function requireAdminRead() {
  const session = await getCurrentAdmin();
  if (!session) {
    throw new HttpError(401, "未登录或会话已过期");
  }
  return session;
}

// ---------- slug 生成 ----------

// github-slugger 保留 CJK 字符（实测：中文标题会输出中文 slug），
// 纯符号等标题可能输出空串 → fallback post-<10 位 base36 时间戳>
export function slugifyTitle(title: string): string {
  const slug = new GithubSlugger().slug(title);
  return slug || `post-${Date.now().toString(36)}`;
}

// 冲突时追加 -2、-3…
async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  for (let i = 2; ; i++) {
    const exists = await prisma.post.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!exists) return slug;
    slug = `${base}-${i}`;
  }
}

// ---------- 校验 ----------

const MAX_CONTENT_BYTES = 1024 * 1024; // content ≤ 1MB（防异常请求）

export interface PostInput {
  title?: unknown;
  excerpt?: unknown;
  content?: unknown;
  categoryId?: unknown;
  tagIds?: unknown;
  status?: unknown;
}

// 前后端双保险，后端为准。返回规范化字段（不含 status 处理，status 单独看）。
async function validateInput(
  body: PostInput,
  opts: { requireExcerpt: boolean }
): Promise<{
  title: string;
  excerpt: string;
  content: string;
  categoryId: number;
  tagIds: number[];
}> {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (title.length < 1 || title.length > 200) {
    throw new HttpError(400, "标题必填，且不超过 200 字");
  }

  const excerpt = typeof body.excerpt === "string" ? body.excerpt : "";
  if (excerpt.length > 200) {
    throw new HttpError(400, "摘要不超过 200 字");
  }
  if (opts.requireExcerpt && excerpt.trim() === "") {
    throw new HttpError(400, "发布前摘要不能为空");
  }

  const content = typeof body.content === "string" ? body.content : "";
  if (Buffer.byteLength(content, "utf8") > MAX_CONTENT_BYTES) {
    throw new HttpError(400, "正文超出 1MB 限制");
  }

  // 分类必须是已存在的 id（分类只允许从现有列表选）
  const categoryId = Number(body.categoryId);
  if (!Number.isInteger(categoryId) || categoryId < 1) {
    throw new HttpError(400, "请选择有效分类");
  }
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { id: true },
  });
  if (!category) {
    throw new HttpError(400, "请选择有效分类");
  }

  // 标签必须是已存在的 id 数组，去重
  const rawTagIds = Array.isArray(body.tagIds) ? body.tagIds : [];
  const tagIds = [...new Set(rawTagIds.map((t) => Number(t)))].filter(
    (n) => Number.isInteger(n) && n > 0
  );
  if (tagIds.length > 0) {
    const found = await prisma.tag.findMany({
      where: { id: { in: tagIds } },
      select: { id: true },
    });
    if (found.length !== tagIds.length) {
      throw new HttpError(400, "包含不存在的标签");
    }
  }

  return { title, excerpt, content, categoryId, tagIds };
}

// 校验 status：仅 draft/hidden 可由编辑器直接设置；
// published 只能走 publish 接口（检查单语义），PUT 收到一律按 draft 处理
function normalizeStatus(status: unknown): "draft" | "hidden" {
  return status === "hidden" ? "hidden" : "draft";
}

// ---------- 标签新建（编辑器允许输入新标签名，分类不允许） ----------

export async function upsertTag(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return null;
  // slug 规则照抄 seed.ts：小写 + 空白转连字符
  const slug = trimmed.toLowerCase().replace(/\s+/g, "-");
  const existing = await prisma.tag.findUnique({ where: { slug } });
  if (existing) return existing;
  return prisma.tag.create({ data: { name: trimmed, slug } });
}

// ---------- 版本快照（FR-6-10） ----------

// 写库前对「当前（旧）内容」拍快照。
// 与最近一条快照 title/excerpt/content 完全相同则跳过——
// 30s 自动保存对无改动内容也会 PUT，不去重会刷出大量重复版本。
async function snapshotIfChanged(
  tx: { postVersion: typeof prisma.postVersion },
  post: { id: number; title: string; excerpt: string; content: string }
) {
  const last = await tx.postVersion.findFirst({
    where: { postId: post.id },
    orderBy: { id: "desc" },
  });
  if (
    last &&
    last.title === post.title &&
    last.excerpt === post.excerpt &&
    last.content === post.content
  ) {
    return;
  }
  await tx.postVersion.create({
    data: {
      postId: post.id,
      title: post.title,
      excerpt: post.excerpt,
      content: post.content,
    },
  });
}

// ---------- CRUD ----------

const LIST_INCLUDE = {
  category: { select: { name: true } },
  tags: {
    include: { tag: { select: { id: true, name: true } } },
    orderBy: { tag: { id: "asc" } },
  },
} satisfies Prisma.PostInclude;

type ListPost = Prisma.PostGetPayload<{ include: typeof LIST_INCLUDE }>;

function toAdminPost(p: ListPost) {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    status: p.status,
    pinned: p.pinned,
    category: p.category?.name ?? null,
    tags: p.tags.map((t) => t.tag.name),
    publishedAt: p.publishedAt,
    updatedAt: p.updatedAt,
  };
}

/** 管理端列表（精简字段），status 缺省全部；publishedAt desc nulls last, updatedAt desc */
export async function listPosts(status?: "draft" | "published" | "hidden") {
  const records = await prisma.post.findMany({
    where: status ? { status } : undefined,
    include: LIST_INCLUDE,
    orderBy: [
      { publishedAt: { sort: "desc", nulls: "last" } },
      { updatedAt: "desc" },
    ],
  });
  return records.map(toAdminPost);
}

/** 取单篇全文（编辑页初始数据），含 content */
export async function getPostFull(id: number) {
  const record = await prisma.post.findFirst({
    where: { id },
    include: LIST_INCLUDE,
  });
  if (!record) return null;
  return {
    ...toAdminPost(record),
    content: record.content,
    categoryId: record.categoryId,
    tagIds: record.tags.map((t) => t.tag.id),
  };
}

/** 新建：status 默认 draft，slug 服务端生成 */
export async function createPost(body: PostInput) {
  const input = await validateInput(body, { requireExcerpt: false });
  const slug = await uniqueSlug(slugifyTitle(input.title));
  const post = await prisma.post.create({
    data: {
      slug,
      title: input.title,
      excerpt: input.excerpt,
      content: input.content,
      categoryId: input.categoryId,
      status: "draft",
      tags: { create: input.tagIds.map((tagId) => ({ tagId })) },
    },
    include: LIST_INCLUDE,
  });
  revalidateTag("posts", { expire: 0 });
  return { ...toAdminPost(post), content: post.content, categoryId: post.categoryId, tagIds: post.tags.map((t) => t.tag.id) };
}

/** 更新：不改 publishedAt（FR-6-07）；status 仅 draft/hidden；
 *  落库前对旧内容拍版本快照（FR-6-10），事务内原子执行 */
export async function updatePost(id: number, body: PostInput) {
  const post = await prisma.post.findUnique({ where: { id } });
  if (!post) throw new HttpError(404, "文章不存在");
  // slug 不在本次编辑范围（改标题不改 slug，避免前台链接失效）
  const input = await validateInput(body, { requireExcerpt: false });
  const status = normalizeStatus(body.status);
  const contentChanged =
    input.title !== post.title ||
    input.excerpt !== post.excerpt ||
    input.content !== post.content;
  const updated = await prisma.$transaction(async (tx) => {
    // 内容三字段有变化才拍快照（无改动保存不产生重复版本）
    if (contentChanged) {
      await snapshotIfChanged(tx, post);
    }
    return tx.post.update({
      where: { id },
      data: {
        title: input.title,
        excerpt: input.excerpt,
        content: input.content,
        categoryId: input.categoryId,
        status,
        tags: { deleteMany: {}, create: input.tagIds.map((tagId) => ({ tagId })) },
      },
      include: LIST_INCLUDE,
    });
  });
  revalidateTag("posts", { expire: 0 });
  return { ...toAdminPost(updated), content: updated.content, categoryId: updated.categoryId, tagIds: updated.tags.map((t) => t.tag.id) };
}

/** 发布：publishedAt 为空才写入；refreshPublishedAt=true 才刷新（FR-6-07 手动更新入口）。
 *  发布前对当前内容拍快照（FR-6-10） */
export async function publishPost(id: number, opts: { refreshPublishedAt?: boolean } = {}) {
  const post = await prisma.post.findUnique({ where: { id } });
  if (!post) throw new HttpError(404, "文章不存在");
  const data: Prisma.PostUpdateInput = { status: "published" };
  if (!post.publishedAt || opts.refreshPublishedAt) {
    data.publishedAt = new Date();
  }
  const updated = await prisma.$transaction(async (tx) => {
    await snapshotIfChanged(tx, post);
    return tx.post.update({
      where: { id },
      data,
      include: LIST_INCLUDE,
    });
  });
  revalidateTag("posts", { expire: 0 });
  return toAdminPost(updated);
}

/** 下线：published → draft（不清 publishedAt，下次发布日期不变） */
export async function unpublishPost(id: number) {
  const post = await prisma.post.findUnique({ where: { id } });
  if (!post) throw new HttpError(404, "文章不存在");
  const updated = await prisma.post.update({
    where: { id },
    data: { status: "draft" },
    include: LIST_INCLUDE,
  });
  revalidateTag("posts", { expire: 0 });
  return toAdminPost(updated);
}

/** 删除（前端已二次确认）。PostVersion 靠 Prisma onDelete: Cascade 级联清理 */
export async function deletePost(id: number) {
  const post = await prisma.post.findUnique({ where: { id } });
  if (!post) throw new HttpError(404, "文章不存在");
  await prisma.post.delete({ where: { id } });
  revalidateTag("posts", { expire: 0 });
}

// ---------- 版本历史（FR-6-10） ----------

export interface PostVersionItem {
  id: number;
  title: string;
  excerpt: string;
  content: string;
  createdAt: Date;
  chars: number;
}

/** 版本时间线（新→旧）；post 不存在 → 404 */
export async function listPostVersions(postId: number): Promise<PostVersionItem[]> {
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
    chars: v.content.length,
  }));
}

/** 回滚到指定版本 = 一次保存：先把当前内容拍快照（可二次反悔），再写回目标版本内容。
 *  不改 status / publishedAt / 分类 / 标签——语义是「找回文字」，不是「时光倒流」 */
export async function rollbackPostVersion(postId: number, versionId: number) {
  const [post, version] = await prisma.$transaction([
    prisma.post.findUnique({ where: { id: postId } }),
    prisma.postVersion.findFirst({ where: { id: versionId, postId } }),
  ]);
  if (!post) throw new HttpError(404, "文章不存在");
  if (!version) throw new HttpError(404, "版本不存在");
  const updated = await prisma.$transaction(async (tx) => {
    if (
      post.title !== version.title ||
      post.excerpt !== version.excerpt ||
      post.content !== version.content
    ) {
      await tx.postVersion.create({
        data: {
          postId,
          title: post.title,
          excerpt: post.excerpt,
          content: post.content,
        },
      });
    }
    return tx.post.update({
      where: { id: postId },
      data: {
        title: version.title,
        excerpt: version.excerpt,
        content: version.content,
      },
      include: LIST_INCLUDE,
    });
  });
  revalidateTag("posts", { expire: 0 });
  return { ...toAdminPost(updated), content: updated.content, categoryId: updated.categoryId, tagIds: updated.tags.map((t) => t.tag.id) };
}
