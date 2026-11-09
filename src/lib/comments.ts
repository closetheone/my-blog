// 评论核心逻辑层（FR-3-01/02/06）
// 公开接口：读评论（listComments）、发评论（createComment）
// 管理接口：listAdminComments / setCommentPinned / deleteComment
//
// 设计（docs/tech-评论.md）：
// - 两级层级：parentId 只允许指向一级评论，更深层前端用「@昵称」表示
// - 评论纯文本，落库前 trim；渲染由前端 {text} 插值（React 转义），无 XSS 面
// - 反垃圾：Origin 校验（csrf.ts）+ 1 条/分钟/IP 限流 + 敏感词过滤
// - 邮箱不落库：只存 md5(小写去空格邮箱) 的 emailHash，前端用它拼 Gravatar URL

import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/posts";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { containsSensitive } from "@/lib/sensitive-words";

// ---------- 校验 ----------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateCommentInput(body: {
  postId?: unknown;
  parentId?: unknown;
  nickname?: unknown;
  email?: unknown;
  content?: unknown;
  url?: unknown;
}) {
  const postId = Number(body.postId);
  if (!Number.isInteger(postId) || postId < 1) throw new HttpError(400, "请提供有效文章");

  const nickname = typeof body.nickname === "string" ? body.nickname.trim() : "";
  if (nickname.length < 1 || nickname.length > 20) {
    throw new HttpError(400, "昵称必填，且不超过 20 字");
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email)) {
    throw new HttpError(400, "请填写有效邮箱（不公开显示）");
  }

  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (content.length < 1 || content.length > 1000) {
    throw new HttpError(400, "评论内容必填，且不超过 1000 字");
  }
  if (containsSensitive(nickname + content)) {
    throw new HttpError(400, "评论包含不合适的词语，请修改后提交");
  }

  let url: string | null = null;
  if (body.url != null && typeof body.url === "string" && body.url.trim() !== "") {
    url = body.url.trim();
    if (url.length > 200) throw new HttpError(400, "网址过长");
    try {
      const u = new URL(url);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        throw new Error("bad protocol");
      }
    } catch {
      throw new HttpError(400, "网址格式无效（需 http/https 开头）");
    }
  }

  let parentId: number | null = null;
  if (body.parentId != null) {
    parentId = Number(body.parentId);
    if (!Number.isInteger(parentId) || parentId < 1) {
      throw new HttpError(400, "请提供有效回复目标");
    }
  }

  return { postId, nickname, email, content, url, parentId };
}

function emailHash(email: string): string {
  // Gravatar 规则：小写 + 去首尾空白后 md5（内部空白保留）
  return crypto.createHash("md5").update(email.trim().toLowerCase(), "utf8").digest("hex");
}

// ---------- 前台读（FR-3-01：正序展示）----------

export interface CommentView {
  id: number;
  nickname: string;
  url: string | null;
  content: string;
  emailHash: string; // 前端拼 Gravatar：https://www.gravatar.com/avatar/{emailHash}?d=identicon&s=80
  pinned: boolean;
  createdAt: string; // ISO
  replies: CommentView[];
}

export async function listComments(postId: number): Promise<{
  enabled: boolean;
  comments: CommentView[];
}> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { status: true, commentsEnabled: true },
  });
  if (!post || post.status !== "published") {
    return { enabled: false, comments: [] };
  }

  const all = await prisma.comment.findMany({
    where: { postId },
    orderBy: [{ pinned: "desc" }, { createdAt: "asc" }],
  });

  const view = (c: (typeof all)[number]): CommentView => ({
    id: c.id,
    nickname: c.nickname,
    url: c.url,
    content: c.content,
    emailHash: c.emailHash,
    pinned: c.pinned,
    createdAt: c.createdAt.toISOString(),
    replies: [],
  });

  const tops = all.filter((c) => c.parentId === null).map(view);
  const byId = new Map(tops.map((c) => [c.id, c]));
  for (const c of all) {
    if (c.parentId == null) continue;
    const parent = byId.get(c.parentId);
    if (parent) parent.replies.push(view(c));
  }
  return { enabled: post.commentsEnabled, comments: tops };
}

// ---------- 前台写（FR-3-01）----------

export async function createComment(req: Request, body: {
  postId?: unknown;
  parentId?: unknown;
  nickname?: unknown;
  email?: unknown;
  content?: unknown;
  url?: unknown;
}): Promise<CommentView> {
  const input = validateCommentInput(body);

  const ip = getClientIp(req);
  if (!rateLimit(`comment:${ip}`, 1, 60 * 1000)) {
    throw new HttpError(429, "评论太频繁了，请 1 分钟后再试");
  }

  const post = await prisma.post.findUnique({
    where: { id: input.postId },
    select: { status: true, commentsEnabled: true },
  });
  if (!post || post.status !== "published") {
    throw new HttpError(404, "文章不存在");
  }
  if (!post.commentsEnabled) {
    throw new HttpError(403, "本文已关闭评论");
  }

  let parentId: number | null = null;
  if (input.parentId != null) {
    // 两级约束：parentId 必须指向本文的一级评论。
    // 回复「二级评论」时前端把 parentId 指向其一级评论，并自动在内容里追加
    // 「@一级评论作者」（PRD：更深层用 @昵称 表示），服务端不再感知层级。
    const parent = await prisma.comment.findUnique({ where: { id: input.parentId } });
    if (!parent || parent.postId !== input.postId || parent.parentId != null) {
      throw new HttpError(400, "只能回复一级评论");
    }
    parentId = parent.id;
  }

  const comment = await prisma.comment.create({
    data: {
      postId: input.postId,
      parentId,
      nickname: input.nickname,
      emailHash: emailHash(input.email),
      url: input.url,
      content: input.content,
    },
  });
  await prisma.post.update({
    where: { id: input.postId },
    data: { commentsCount: { increment: 1 } },
  });

  return {
    id: comment.id,
    nickname: comment.nickname,
    url: comment.url,
    content: comment.content,
    emailHash: comment.emailHash,
    pinned: comment.pinned,
    createdAt: comment.createdAt.toISOString(),
    replies: [],
  };
}

// ---------- 管理端（FR-3-02：删除/置顶）----------

export async function listAdminComments(opts: {
  postId?: number;
  q?: string;
} = {}): Promise<Array<{
  id: number;
  postId: number;
  postTitle: string;
  parentId: number | null;
  nickname: string;
  emailHash: string;
  content: string;
  pinned: boolean;
  createdAt: string;
}>> {
  const where: { postId?: number; nickname?: { contains: string } } = {};
  if (opts.postId) where.postId = opts.postId;
  if (opts.q) where.nickname = { contains: opts.q };
  const all = await prisma.comment.findMany({
    where,
    include: { post: { select: { title: true } } },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
  });
  return all.map((c) => ({
    id: c.id,
    postId: c.postId,
    postTitle: c.post.title,
    parentId: c.parentId,
    nickname: c.nickname,
    emailHash: c.emailHash,
    content: c.content,
    pinned: c.pinned,
    createdAt: c.createdAt.toISOString(),
  }));
}

export async function setCommentPinned(id: number, pinned: boolean) {
  const c = await prisma.comment.findUnique({ where: { id } });
  if (!c) throw new HttpError(404, "评论不存在");
  return prisma.comment.update({ where: { id }, data: { pinned } });
}

export async function deleteComment(id: number) {
  const c = await prisma.comment.findUnique({ where: { id } });
  if (!c) throw new HttpError(404, "评论不存在");
  // 一级被删 → 二级级联删；按实际删除行数减计数
  const { count } = await prisma.comment.deleteMany({
    where: c.parentId == null ? { OR: [{ id }, { parentId: id }] } : { id },
  });
  await prisma.post.update({
    where: { id: c.postId },
    data: { commentsCount: { decrement: count } },
  });
  return { deleted: count };
}

// ---------- 单篇评论开关（FR-3-06）----------

export async function setCommentsEnabled(postId: number, enabled: boolean) {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw new HttpError(404, "文章不存在");
  return prisma.post.update({
    where: { id: postId },
    data: { commentsEnabled: enabled },
  });
}
