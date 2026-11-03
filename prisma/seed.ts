/**
 * 一次性数据迁移脚本：将 content/posts/*.md 导入 PostgreSQL
 * 用法：npx tsx prisma/seed.ts
 * 管理员引导：设置 ADMIN_USERNAME / ADMIN_PASSWORD 环境变量后首次运行创建（幂等）
 */
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CONTENT_DIR = path.join(process.cwd(), "content", "posts");

// PRD 初始分类（FR-2-01）
const INITIAL_CATEGORIES: { name: string; slug: string; parent?: string }[] = [
  { name: "技术", slug: "tech" },
  { name: "前端", slug: "frontend", parent: "tech" },
  { name: "后端", slug: "backend", parent: "tech" },
  { name: "工具与效率", slug: "tools", parent: "tech" },
  { name: "生活随笔", slug: "life" },
  { name: "读书笔记", slug: "reading" },
  { name: "折腾记录", slug: "tinker" },
];

async function seed() {
  console.log("🌱 开始种子数据…");

  // 0. 创建管理员（幂等，FR-6-01）
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (username && password) {
    const existing = await prisma.admin.findUnique({ where: { username } });
    if (!existing) {
      await prisma.admin.create({
        data: { username, password: await hash(password) },
      });
      console.log(`  ✅ 已创建管理员 ${username}`);
    } else {
      console.log("  ⏭️  管理员已存在，跳过（如需重置密码请手动更新）");
    }
  } else {
    console.warn("  ⚠️  未设置 ADMIN_USERNAME / ADMIN_PASSWORD，跳过管理员创建");
  }

  // 1. 创建分类（幂等）
  const catMap = new Map<string, number>();
  for (const cat of INITIAL_CATEGORIES) {
    const existing = await prisma.category.findUnique({ where: { slug: cat.slug } });
    if (existing) {
      catMap.set(cat.slug, existing.id);
      continue;
    }
    const parentId = cat.parent ? catMap.get(cat.parent) ?? null : null;
    const created = await prisma.category.create({
      data: { name: cat.name, slug: cat.slug, parentId },
    });
    catMap.set(cat.slug, created.id);
  }
  console.log(`  ✅ ${catMap.size} 个分类就绪`);

  // 2. 创建标签（幂等）
  const tagMap = new Map<string, number>();
  const allTags = new Set<string>();

  const files = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith(".md"));
  for (const file of files) {
    const raw = fs.readFileSync(path.join(CONTENT_DIR, file), "utf-8");
    const { data } = matter(raw);
    if (Array.isArray(data.tags)) {
      (data.tags as string[]).forEach((t) => allTags.add(t));
    }
  }
  for (const tag of allTags) {
    const slug = tag.toLowerCase().replace(/\s+/g, "-");
    const existing = await prisma.tag.findUnique({ where: { slug } });
    if (existing) {
      tagMap.set(tag, existing.id);
    } else {
      const created = await prisma.tag.create({ data: { name: tag, slug } });
      tagMap.set(tag, created.id);
    }
  }
  console.log(`  ✅ ${tagMap.size} 个标签就绪`);

  // 3. 导入文章
  let imported = 0;
  for (const file of files) {
    const slug = file.replace(/\.md$/, "");
    const raw = fs.readFileSync(path.join(CONTENT_DIR, file), "utf-8");
    const { data, content } = matter(raw);

    // 按中文分类名匹配 slug
    const nameToSlug = new Map(INITIAL_CATEGORIES.map((c) => [c.name, c.slug]));
    const categorySlug = nameToSlug.get(data.category as string);
    const categoryId = categorySlug ? catMap.get(categorySlug) : undefined;
    if (!categoryId) {
      console.warn(`  ⚠️  ${file}: 未找到分类 "${data.category}"，跳过`);
      continue;
    }

    const existing = await prisma.post.findUnique({ where: { slug } });
    if (existing) {
      console.log(`  ⏭️  ${file} 已存在，跳过`);
      continue;
    }

    const tagIds = Array.isArray(data.tags)
      ? (data.tags as string[]).map((t) => tagMap.get(t)).filter(Boolean)
      : [];

    const dateStr =
      data.date instanceof Date
        ? data.date.toISOString().slice(0, 10)
        : String(data.date ?? "");

    await prisma.post.create({
      data: {
        slug,
        title: data.title as string,
        excerpt: (data.excerpt as string) ?? "",
        content: content.trim(),
        status: (data.status as string) ?? "published",
        pinned: data.pinned === true,
        categoryId,
        publishedAt: new Date(dateStr),
        tags: {
          create: tagIds.map((id) => ({ tagId: id as number })),
        },
      },
    });
    imported++;
  }
  console.log(`  ✅ 导入 ${imported} 篇文章`);

  const total = await prisma.post.count();
  console.log(`🎉 完成！数据库共 ${total} 篇文章`);
}

seed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
