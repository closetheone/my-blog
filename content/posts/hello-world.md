---
title: Hello World：博客的第一篇文章
date: 2026-10-28
excerpt: 为什么要在 2026 年自建一个博客，以及这个项目打算怎么走——前端、后端、数据库、部署，一步步来。
category: 折腾记录
tags:
  - 博客
  - Next.js
status: published
pinned: true
---

欢迎来到我的博客。这是第一篇文章，也是整个项目的开工宣言。

## 为什么要自建博客

1. **把学到的东西写下来** —— 写作是最好的检验，讲不清楚就是没懂
2. **完整走一遍全栈流程** —— 前端、后端、数据库、认证、部署运维，一个不缺
3. **拥有一个自己说了算的内容阵地** —— 不受平台算法摆布

> 这个项目按版本推进，每个版本都是一个可上线的完整站点。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 框架 | Next.js + TypeScript |
| 样式 | Tailwind CSS |
| 数据库 | PostgreSQL（V2.0 引入） |
| ORM | Prisma（V2.0 引入） |
| 托管 | Vercel → 自有服务器 |

## 代码高亮测试

一段 TypeScript：

```ts showLineNumbers
interface Post {
  slug: string
  title: string
  tags: string[]
}

function greet(post: Post): string {
  return `欢迎阅读《${post.title}》`
}
```

一段 SQL（V2.0 的预告）：

```sql
SELECT id, title, created_at
FROM posts
WHERE status = 'published'
ORDER BY created_at DESC
LIMIT 10;
```

行内代码像这样：`pnpm dev` 启动开发服务器。

## 外链测试

外部链接在新窗口打开：[Next.js 官方文档](https://nextjs.org/docs)。

---

文章末尾。如果你看到了这里，说明渲染管线一切正常 ✅
