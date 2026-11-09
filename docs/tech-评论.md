# 技术方案：评论 / 点赞 / 浏览量（V2.1 第一批，FR-3-01~07）

> 需求（PRD §5.3）：文章底部评论区（正序、两级层级、昵称+邮箱、邮箱永不公开）；后台删除/置顶 + 反垃圾（1 条/分钟/IP + 敏感词 + XSS）；点赞公开计数（本地去重+服务端校验）；PV 按 IP+文章窗口去重；单篇评论开关（默认开）；Gravatar 头像（无头像时随机几何图）。
>
> 本方案覆盖 FR-3-01~03、05~07。留言板 FR-3-04 和邮件通知 FR-3-08 缓期至 V3.x，数据模型为其留了口子（Comment.postId 允许 null 即可承载留言）。仪表盘 FR-6-08 依赖本文的计数数据，做完本文后单独做。

## 1. 关键决策

| 决策点 | 选择 | 理由 |
|---|---|---|
| 评论存储 | **Postgres 新表 `Comment`**（Prisma） | 自建评论（D-02），需要后台管理/置顶，必须落库 |
| 层级 | **两级：`parentId` 只允许指向一级评论** | PRD：超过两级用「@昵称」表示；数据上直接约束，不做无限树 |
| 评论正文 | **纯文本，不支持 Markdown/HTML** | 个人博客评论以短评为主；纯文本从根上消除 XSS 面（`escape` 后渲染），比「白名单清洗 HTML」更稳。敏感词 + 限流 + 纯文本 = 三层反垃圾 |
| @提及 | 提交时检测 `@昵称`：若被回复的评论是二级，自动追加 `@一级评论作者` 到正文末尾 | 满足「更深层用 @昵称 表示」，不需要额外的 mention 数据表 |
| 头像 | **Gravatar `d=identicon`**：`https://www.gravatar.com/avatar/{md5(邮箱)}?d=identicon&s=80` | 一条 URL 同时满足 FR-3-07 两态：有 Gravatar 头像返回头像，没有返回 identicon（按邮箱哈希生成的随机几何头像）；邮箱哈希后传输，符合「邮箱永不公开显示」。零依赖、无需代理 |
| 反垃圾 | 复用 `src/lib/rate-limit.ts`（1 条/分钟/IP）+ 敏感词表（`src/lib/sensitive-words.ts`，维护一个可扩展的中文词表）+ 纯文本渲染 | PRD FR-3-02 原文三件套；限流沿用登录接口的现成实现 |
| CSRF | 写接口校验 `Origin`/`Referer` 必须等于本站 host（复用 images 路由的做法） | 评论是公开写接口，CSRF 是 V2.1 学习点之一 |
| 评论读取 | **前端 `useEffect` 拉取**（client-side fetch），不走服务端组件 | 文章页在 `cacheComponents` 下是静态化的（`"use cache"` + `cacheTag`），评论/点赞/PV 都要实时；客户端拉取完全不碰缓存体系，也避免每次新评论都 revalidate 全文页 |
| 计数落点 | **Post 表加 3 个反规范计数** `commentsCount` / `likesCount` / `pvCount`（+ `commentsEnabled`） | 首页/列表页静态渲染时直接读计数，不用每次聚合；博客量级下 `count + 1` 的并发丢失可忽略（PRD「不追求强一致」） |
| 点赞去重 | localStorage（`liked_{postId}`）+ 服务端内存 Set（IP+postId） | PRD 原话：本地去重 + 服务端校验，不追求强一致。服务端 Set 跨实例不共享，接受（serverless 限制已记录在 rate-limit.ts 注释里，同一性质） |
| PV 去重 | **`ViewEvent` 表**：(ip, postId, createdAt)；窗口 1 小时内同 IP 同文不重复计数 | 不能用内存（多实例/冷启动全丢）；DB 表最可靠，量级极小（每文每天几十条），暂不做清理任务，遗留项记录 |
| 计数刷新 | 评论/点赞/PV 的计数变更**不 revalidate 页面**；文章页顶部的「N 条评论 / N 次浏览」由客户端组件从同一 API 拉取 | 静态页零失效开销，数字对读者是「大致实时」即可 |

## 2. 数据模型（prisma）

```prisma
// Post 增加字段
model Post {
  // ... 现有字段
  commentsEnabled Boolean @default(true) // FR-3-06 单篇评论开关，默认开
  commentsCount   Int     @default(0)
  likesCount      Int     @default(0)
  pvCount         Int     @default(0)
  comments        Comment[]
}

// ---------- 评论（FR-3-01）----------
model Comment {
  id          Int      @id @default(autoincrement())
  postId      Int
  post        Post     @relation(fields: [postId], references: [id], onDelete: Cascade)
  parentId    Int? // 只允许指向一级评论；null = 一级
  parent      Comment? @relation("CommentTree", fields: [parentId], references: [id], onDelete: Cascade)
  replies     Comment[] @relation("CommentTree")
  nickname    String // 1~20 字
  emailHash   String // md5(小写去空格邮箱)，仅存哈希用于统计同作者（可选），不落邮箱明文
  url         String? // 个人网址，选填；渲染时 target=_blank rel=noopener
  content     String // 纯文本
  pinned      Boolean  @default(false) // 置顶（FR-3-02）
  createdAt   DateTime @default(now())

  @@index([postId, createdAt])
  @@index([parentId])
}

// ---------- 浏览事件（FR-3-05 PV 去重）----------
model ViewEvent {
  id        Int      @id @default(autoincrement())
  postId    Int
  ip        String
  createdAt DateTime @default(now())

  @@index([postId, ip, createdAt])
}
```

- 邮箱**不落库**：Gravatar 只用请求里传来的邮箱算 md5 当头像 URL（存 `avatarUrl` 也行，但每次请求现算更简单，邮箱改了就换头像，符合直觉）；`emailHash` 字段如果只做统计可以用，若嫌多余可删——**方案里先保留 `emailHash`**，仪表盘「评论总数」用不上它，但「同一访客识别」留口。
- 删文章 → 评论级联删。
- `ViewEvent` 不建到 Post 的 relation（纯事件表，删文章时手动 `deleteMany` 或不管，遗留项）。

## 3. API

| 路由 | 方法 | 鉴权 | 行为 |
|---|---|---|---|
| `/api/comments` | GET | 公开 | `?postId=` → 该文章全部评论（正序，二级挂在一级下返回 `replies`）；`?slug=` 兼容 |
| `/api/comments` | POST | 公开 + Origin 校验 + 限流 | 校验：昵称 1~20 字必填、邮箱格式必填（不显示不落库）、内容 1~1000 字、url 选填（≤200 字，必须 http/https）；限流 1 条/分钟/IP；敏感词命中 → 400「包含不合适的词语」；`postId` 必须存在且 `commentsEnabled=true`（否则 403「本文已关闭评论」）；二级回复校验 `parentId` 必须是本文的一级评论，否则 400；落库 + `commentsCount += 1`；返回新评论 |
| `/api/like` | POST | 公开 + Origin 校验 | body `{postId}`；localStorage 已有则前端不调；服务端内存 Set 判重 → 409；`likesCount += 1` 返回最新数 |
| `/api/pv` | POST | 公开 + Origin 校验 | body `{postId}`；查 `ViewEvent` 同 IP 同文 1 小时内有记录 → 不计数；无则插入 + `pvCount += 1`；返回 `pvCount` |
| `/api/posts/[id]/comments-setting` | PATCH | requireAdmin | `{enabled: boolean}` 开/关评论（FR-3-06） |
| `/api/admin/comments` | GET | requireAdmin | 全部评论列表（join 文章标题，`?postId=` 过滤），供后台管理页 |
| `/api/admin/comments/[id]` | PATCH | requireAdmin | `{pinned: boolean}` 置顶/取消置顶（FR-3-02） |
| `/api/admin/comments/[id]` | DELETE | requireAdmin | 删评论 + `commentsCount -= 1`（若被删的是被引用的二级评论，其下无更深层，无需处理引用悬空——一级被删时二级级联删，计数减实际删除行数） |

所有公开写接口统一：
1. `Origin`/`Referer` 与 `req.headers.get("host")` 一致（复用 images 的 Origin 校验函数，抽到 `src/lib/csrf.ts`）。
2. 限流用 `getClientIp(req)`。

## 4. 前端

### 4.1 文章页评论区（`src/app/(site)/posts/[slug]/`）

- 正文之后新增 `<CommentSection slug={slug} postId={post.id} enabled={post.commentsEnabled} initialCount={post.commentsCount} />`（client component）：
  - `useEffect` 拉 `/api/comments?postId=`，正序渲染；一级 + 其下二级缩进。
  - 空态：「还没有评论，来抢沙发吧」；关闭态：「本文已关闭评论」（FR-3-06）。
  - 每条评论：Gravatar `<img loading="lazy" src=... referrerPolicy="no-referrer">`（Gravatar 会拒带本站 referer 的请求，**必须 no-referrer**）、昵称、时间（`Intl.DateTimeFormat` 中文相对时间，>1 天显示日期）、内容（`{text}` 纯文本插值，React 自动转义）、@昵称 高亮（split 后 `<span>` 着色）。
  - 评论表单（PRD FR-3-01：读完正文出现、不打断阅读）：评论区默认折叠为一行「发表评论（N）」，点击展开表单；昵称+邮箱+内容，url 选填，「有人回复我时邮件通知」勾选框**本批先不做**（FR-3-08 缓期，UI 不加，避免半成品 UI）。
  - 「回复」按钮：一级评论 → 弹二级回复框；二级评论 → 回复框提交时自动带 `@一级作者`。
  - 提交成功：直接把返回的评论插入列表 + 计数 +1，不整页刷新。
- 点赞 + PV 合并进同一个轻量组件 `<PostMeta postId />`（评论数 / 浏览数 / 点赞按钮一行）：挂载时 POST `/api/pv`，点赞状态读 localStorage，点击 POST `/api/like`。

### 4.2 后台

- **`/admin/comments`** 新页面（侧边栏加「评论」入口）：
  - 表格：头像、昵称、文章标题、内容摘要、时间、置顶状态、操作（置顶 toggle / 删除）。
  - 顶部：文章下拉过滤 + 昵称搜索（服务端 `?q=`，模糊 like）。
  - 删除二次确认（`confirm()`，与现有 admin 风格一致）。
- **文章编辑页**（`/admin/posts/[id]`）加「允许评论」开关（FR-3-06），放在发布设置区，PATCH `/api/posts/[id]/comments-setting`。

## 5. 敏感词表（`src/lib/sensitive-words.ts`）

```ts
// 初始表：广告导流 + 明显辱骂，后续在文件里追加即可
export const SENSITIVE_WORDS = [
  "加微信", "加v", "加V", "wx:", "WX:", "q群", "QQ群", "代购", "兼职刷单",
  // 辱骂词若干（实现时补齐，约 20~30 个高频词）
];
export function containsSensitive(text: string): boolean {
  const t = text.toLowerCase();
  return SENSITIVE_WORDS.some((w) => t.includes(w.toLowerCase()));
}
```

contains 匹配、忽略大小写。命中即拒（400），不做替换——替换会放行脏内容。

## 6. 环境变量

无新增（Gravatar 是公共服务，无 key）。

## 7. 验证清单

- [ ] 一级评论提交成功、正序展示、头像（有 Gravatar / 无 Gravatar 两种邮箱各测一个）
- [ ] 二级回复挂在一级下；回复二级 → 自动 `@一级作者`，不再出现第三层
- [ ] 1 分钟内同 IP 第二条评论 → 429；敏感词 → 400；关评论的文章 → 403
- [ ] 邮箱不出现在前端任何响应/渲染里（network 面板 + 页面源码）
- [ ] 跨域 POST（构造 curl 带别的 Origin）→ 403
- [ ] 点赞：同浏览器第二次点无效（localStorage）；点赞数前台公开可见
- [ ] PV：同 IP 刷新 1 小时内不重复计；换 IP（改 header 模拟）计数 +1
- [ ] 后台：置顶后该评论排最前、删除级联正确减计数、评论开关关闭后前台显示「已关闭」
- [ ] 删文章后评论不残留（级联）
- [ ] tsc / build / lint 0 新增错误

## 8. 遗留/已知限制

- PV/点赞的服务端去重是进程内（Set/Map），serverless 多实例不共享——博客量级可接受，与 rate-limit.ts 同一性质，已记录。
- `ViewEvent` 只增不删，暂无清理任务（量级：几百条/月，Prisma Postgres 无压力）；V3.x 自托管后可加 cron 清理。
- 敏感词表是静态文件，无后台管理界面；后续需要再开小需求。
- 评论列表无分页（个人博客单篇评论量 <100，不做）。
- Gravatar 在大陆访问可能不稳定；若体验差，V3.x 换自有 VPS 代理或换 jsGravatar 镜像（不在本批范围）。
- 邮件通知（FR-3-08）缓期 V3.x，本批 UI 不含勾选框。
