# My Blog

以个人博客为载体的全栈开发学习项目：前端 → 后端 → 数据库 → 认证 → 部署运维，按版本渐进推进。

产品需求见 [docs/PRD.md](docs/PRD.md)（版本规划在 §8）。

## 技术栈

| 层 | 选型 | 引入版本 |
| --- | --- | --- |
| 框架 | Next.js (App Router) + TypeScript | V1.0 |
| 样式 | Tailwind CSS v4 | V1.0 |
| 内容 | Markdown 文件（gray-matter + next-mdx-remote + shiki） | V1.0 |
| 数据库 | PostgreSQL + Prisma | V2.0 |
| 托管 | Vercel → 自有服务器（Docker + Nginx） | V1.0 / V3.0 |

## 开发

```bash
pnpm install   # 安装依赖
pnpm dev       # 开发服务器 http://localhost:3000
pnpm build     # 生产构建
pnpm lint      # ESLint
```

## 写文章

在 `content/posts/` 下新建 `slug.md`，front-matter 格式：

```yaml
---
title: 文章标题（必填）
date: 2026-10-28（必填）
excerpt: 摘要（必填）
category: 折腾记录（必填）
tags: [博客, Next.js]（选填）
status: published（draft / published / hidden，默认 published）
pinned: true（选填，置顶，最多 3 篇）
---
```

正文为 Markdown，代码块支持 `ts`、`sql` 等语言高亮与 `showLineNumbers`、`{1,3-4}` 行高亮指令。

## 版本规划

- **V1.0**（当前）：文字流首页 + 文章详情 + 暗色模式 + SEO 基础，Markdown 文件管理内容
- V1.1：搜索、归档、RSS、TOC、置顶、上一篇/下一篇、404 随机文章
- V2.0：PostgreSQL + Prisma、管理员登录、后台管理
- V2.1：评论、点赞、浏览量、仪表盘
- V3.0：VPS 自托管（Docker + Nginx + HTTPS + CI/CD + 备份）
