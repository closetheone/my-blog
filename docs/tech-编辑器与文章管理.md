# 技术方案：浏览器内 Markdown 编辑器与文章管理（V2.0 主线）

> 对应 PRD 需求：FR-6-03（编辑器）、FR-6-04（文章管理）、FR-6-09（发布检查单）、FR-6-11（真实预览）
> 顺带覆盖：FR-6-07（编辑不刷新发布时间）
> 本文档是**实现前技术定稿**，新会话按此文档执行。写完代码后把实现中的偏差回填到本文档。

## 0. 背景与目标

V2.0 前两步已完成：PostgreSQL + Prisma 数据层（文章/分类/标签已入库）与管理员登录（FR-6-01/02，会话=数据库 Session 行）。
本步把 `/admin` 占位仪表盘扩展为可用的写作后台：

- 浏览器内 Markdown 编辑 + 实时预览 + 快捷键，30s 自动存草稿，离开提醒
- 文章管理：按状态（draft/published/hidden）筛选，新建/编辑/删除（二次确认）
- 点「发布」时弹发布检查单（分类 ✓/✗、标签 ✓/✗、摘要 ✓/✗），未就绪坚持发布需二次确认
- 预览必须与读者所见一致（同一套渲染管线）

**明确的非目标（后续步骤做）**：FR-6-05 图片管理、FR-6-06 定时发布、FR-6-08 仪表盘概览、FR-6-10 版本历史、FR-6-12 改密。

**数据库零改动**：`Post` 表已有 `status / excerpt / content / pinned / categoryId / tags / publishedAt`，草稿就是 `status="draft"` 的行，不需要新表、不需要 migration。

## 1. 数据流总览

```
                        ┌─────────────────────── 管理后台（/admin，proxy + 查库双重守卫）───────────────────────┐
                        │                                                                                      │
 文章管理列表 ◄──GET /api/posts?status=──────────────┐                                                          │
 (筛选 tabs/新建/删除)                                │                                                         │
                                                     ▼                                                         │
 编辑器页 ◄──GET /api/posts/:id──────────►  POST/PUT /api/posts  ◄── 手动保存 / 30s 自动保存（仅 dirty 时）      │
 (CodeMirror + 实时预览 + 检查单)          (取全文+分类/标签)           │                                         │
   │                                                        ▼                                                  │
   │ 实时预览(debounce ~500ms)                        Post 表 (status=draft)                                   │
   │                                                        │                                                  │
   └──POST /api/posts/preview {content}                     │ revalidateTag("posts")                            │
          ▼                                                  ▼                                                  │
   render-content.ts（unified 管线 → HTML 字符串）          前台页面缓存失效（stale-while-revalidate）           │
          ▼                                                                                │
   <iframe srcDoc>（前台同套 prose-post 样式 + extractToc 结果）                                  │
                                                                                        ▼
                                                              前台 /、/archive、/posts/[slug] 读到新数据
```

三个核心决策（已与用户确认）：

1. **草稿存数据库**（不存 localStorage）：30s 自动保存 = 普通保存，草稿直接出现在文章列表「草稿」筛选里，刷新/换设备不丢。首次保存时由**服务端**生成 slug。
2. **编辑器用 CodeMirror**（`@uiw/react-md-editor`，内含 CodeMirror 6）；**风险**：该库 peer 可能未声明 React 19，见 §7 风险节。
3. **预览与编辑区实时预览走同一个接口** `POST /api/posts/preview`（编辑区 debounce 调用）：保证「编辑区预览」与「预览按钮」所见永远一致，都是真实管线输出。

## 2. 渲染管线复用（FR-6-11 的核心）

前台文章页（`src/app/(site)/posts/[slug]/page.tsx`）用的是 `MDXRemote` + `src/lib/mdx.ts` 的 `mdxOptions`：

```
remark-parse → remark-gfm(singleTilde:false)
  → remark-rehype → rehype-pretty-code(双主题) → rehype-external-links → rehype-sanitize(白名单) → rehype-slug
```

后台预览**不能**用 RSC（route handler 的响应没法把 RSC payload 塞进 iframe），方案是：

- 新增 `src/lib/render-content.ts`：`unified().use(remarkParse).use(remarkGfm, ...).use(remarkRehype).use(...同样四个 rehype 插件).use(rehypeStringify)`，输入 Markdown 原文，输出 HTML 字符串。
- **插件必须与 `mdx.ts` 完全一致**（同一份 `mdxOptions` 的 remark/rehype 插件数组直接展开复用，不要复制粘贴一份配置——单一事实来源）。`rehypeStringify` 包已在依赖里（`package.json` 有 `rehype-stringify`）。
- 预览接口同时返回 `extractToc(content)`（`src/lib/toc.ts` 已有，纯函数，与服务端/客户端同 slugger）和 `readingMinutes`（`src/lib/articles.ts` 已有），让预览页能渲染出与文章页同构的页头/TOC。

### 预览的呈现：iframe srcDoc

`src/components/admin/preview-frame.tsx` 用 `<iframe srcDoc={...}>`：

- srcDoc 文档结构对齐前台：`<article>` + `prose-post` 容器类 + 页头（标题/日期/分类）+ 渲染出的 HTML + TOC 侧栏（简化版，窄屏可省略）。
- 样式：srcDoc 是独立文档，拿不到主页面 Tailwind。方案：`srcDoc` 内联一段 `<style>`（从 `globals.css` 中 `.prose-post` 相关规则抽取的静态副本，只含排版必需的字体/行高/代码块底色），代码高亮样式由 rehype-pretty-code 自己生成（`keepBackground: true` 是内联的，天然可用）。
- **取舍说明（写进代码注释）**：样式是手工同步的副本，前台排版大改时需同步——预览追求「内容渲染一致」（管线一致已保证），排版像素级一致靠这套内联样式近似；管线不同步才违反 FR-6-11，排版微调同步滞后是可接受的。
- iframe 固定高度（如 `calc(100vh - 180px)`）+ 内部独立滚动。

## 3. 后端

### 3.1 新增 `src/lib/posts.ts`（服务端文章管理逻辑层）

所有 API route 共用，避免每个 route 重复鉴权/校验。函数：

```ts
requireAdmin(req: Request): Promise<session | 401 抛错>
  // 1) Origin 同源校验（照抄 src/app/api/auth/login/route.ts 的 CSRF 模式，写接口必须）
  // 2) getCurrentAdmin()（src/lib/auth.ts，async cookies + 查库）为 null → 抛 401
// 统一在 route 里 try/catch 转 Response.json

generateSlug(title: string): Promise<string>
  // github-slugger（依赖已有）；中文标题 slugger 输出为空串时 fallback 用
  // `post-<时间戳 10 位 base36>`；冲突查库追加 -2、-3…

createPost(input): 校验 → create（status 默认 draft）→ revalidateTag("posts")
updatePost(id, input): 校验 → update（不改 publishedAt！FR-6-07）→ revalidateTag("posts")
publishPost(id, { refreshPublishedAt }): status=published；
  // publishedAt 为空才写入 new Date()；refreshPublishedAt=true 才刷新（FR-6-07 可选手动更新）
  → revalidateTag("posts")
deletePost(id): delete → revalidateTag("posts")
listPosts(status?): 返回给管理端的精简字段（id/slug/title/excerpt/status/category/tags/publishedAt/updatedAt）
```

校验规则（前后端双保险，后端为准）：

| 字段 | 规则 |
|---|---|
| title | 必填，trim 后 1~200 字符 |
| excerpt | 发布时必填（检查单前端先拦），≤200 字符；草稿可空串 |
| content | ≤ 1MB 字符串（防异常请求） |
| categoryId | 必须是已存在的分类 id（查库校验） |
| tagIds | 必须是已存在的标签 id 数组，去重 |
| status | 仅 draft/hidden 可由编辑器直接设置；published **只能**走 publish 接口（走检查单语义），PUT 收到 status=published 一律按 draft 处理并在响应里注明 |

**标签新建**：编辑器允许输入新标签名（`upsertTag(name)`：按 slug 查，无则建；slug 规则照抄 seed.ts：`name.toLowerCase().replace(/\s+/g,"-")`）。分类**只允许从现有列表选**（分类树管理不在本步范围）。

### 3.2 API 路由设计

| 路由 | 方法 | 鉴权 | 说明 |
|---|---|---|---|
| `/api/posts` | GET | 需要 | `?status=draft\|published\|hidden`，缺省全部；按 `publishedAt desc nulls last`，再 `updatedAt desc` |
| `/api/posts` | POST | 需要+Origin | 新建，`{ title, excerpt, content, categoryId, tagIds }`，返回完整 post（含服务端生成的 slug） |
| `/api/posts/[id]` | PUT | 需要+Origin | 更新（含 status draft/hidden 切换），**不碰 publishedAt** |
| `/api/posts/[id]` | DELETE | 需要+Origin | 删除（前端已二次确认，后端不再重复拦） |
| `/api/posts/[id]/publish` | POST | 需要+Origin | `{ refreshPublishedAt?: boolean }` |
| `/api/posts/preview` | POST | 需要 | `{ title?, excerpt?, content, category?, tags? }` → `{ html, toc, readingMinutes }`；不落库 |
| `/api/meta` | GET | 需要 | `{ categories: [{id,name}], tags: [{id,name}] }`（编辑器下拉） |

**Next 16 路由细节**：

- route handler 动态段是 `context: { params: Promise<{id}> }`，需 `await params`（同现有页面写法）。
- 静态段优先级高于动态段：`/api/posts/preview` 命中静态 route，不会撞 `[id]`。
- 写接口（POST/PUT/DELETE）**默认不缓存**（Next 16 文档确认：只有 GET 可 opt-in 缓存），无需特殊处理。
- 会话守卫双保险：`src/proxy.ts` 已拦 `/admin` 页面（token 存在性检查）；API 在 `requireAdmin` 里查库校验（无效/过期 token 在这里被兜住）。**proxy 目前只 matcher 了 `/admin`，不拦 `/api/posts`——安全依赖 `requireAdmin` 查库，这是对的，不要给 API 加 proxy 规则**（proxy 是 Edge，查不了库）。

### 3.3 缓存失效（Next 16 `cacheComponents: true`）

- `src/lib/articles.ts` 的三个读函数（`getAllPosts` / `getPublishedPosts` / `getPostBySlug`）加 `cacheTag("posts")`（`next/cache`，签名 `cacheTag(tag)`，在函数体内调用；`"use cache"` 的 `getPostBySlug` 同样适用）。
- 注意：`articles.ts` 现在是给 RSC 读的纯查询层，加 `cacheTag` 后这些函数在 PPR 静态壳里的数据会按 tag 失效。前台首页/archive 是动态数据（`getPublishedPosts` 未被 `"use cache"` 包裹，首页 page.tsx 需确认——实现时读一下 `src/app/(site)/page.tsx` 和 `archive/page.tsx`，如果它们被缓存组件包裹，tag 才会生效；没有被包裹则天然动态，revalidateTag 只是保险）。
- 所有 mutation（create/update/publish/delete）成功后 `revalidateTag("posts")`（不带 `"max"`，默认 SWR 语义：旧内容先出、后台刷新——个人博客可接受）。
- **禁止**使用 `export const dynamic = "force-dynamic"`（`cacheComponents: true` 下 build 报错，历史踩坑记录）。

## 4. 前端

### 4.1 路由与页面

```
/admin                     文章管理列表（改写现有占位 page.tsx）
/admin/posts/new           新建编辑器
/admin/posts/[id]/edit     编辑编辑器
```

- 两个编辑器页都是 **server component**：`getCurrentAdmin()` 兜底 redirect（proxy 之外的第二道）、查 post 初始数据（new 页给空对象 + `/api/meta` 数据由客户端组件自己取）、渲染 `<PostEditor />` 客户端组件。
- `src/app/admin/layout.tsx` 不动。

### 4.2 组件（`src/components/admin/`）

| 组件 | 职责 |
|---|---|
| `post-list.tsx` | 状态 tabs（全部/草稿/已发布/隐藏，带数量）、列表行（标题/slug/分类/更新时间/状态徽章/操作：编辑、发布、删除）。客户端组件，`useEffect` fetch 列表；删除用 `window.confirm` 二次确认 |
| `post-editor.tsx` | 核心编辑器（"use client"）：元信息表单（标题/摘要/分类下拉/标签可新增）+ CodeMirror + 右侧预览 + 工具栏 + 保存区 |
| `preview-frame.tsx` | iframe srcDoc 封装（§2） |
| `publish-checklist.tsx` | 发布检查单弹窗：分类 ✓/✗、标签 ✓/✗（至少 1 个）、摘要 ✓/✗（非空）；全绿→直接发布；有 ✗→红色提示 +「仍要发布」需再点一次确认（二次确认，PRD 原文）；已发布文章此处提供「更新发布时间」勾选（FR-6-07 手动更新入口） |

### 4.3 `post-editor.tsx` 行为规格

**编辑器库**：`@uiw/react-md-editor`（`MDEditor` 组件，内置 CodeMirror 6 + 自带预览，但**本方案不用它自带的预览**，右侧用 `preview-frame.tsx` 走真实管线；只用它的编辑区，传 `preview="edit"`）。
若 React 19 peer 冲突无法解决（见 §7），降级方案：`@uiw/react-codemirror` + `@codemirror/lang-markdown`，其余设计不变。

**工具栏快捷键**（MDEditor 自带工具栏已覆盖：加粗/斜体/标题/链接/图片/代码/表格/任务列表等）：
- Ctrl/Cmd+B 加粗、Ctrl/Cmd+I 斜体（CodeMirror 自带 keymap 已支持）
- 自定义：Ctrl/Cmd+S 触发手动保存（`e.preventDefault()` 拦住浏览器保存对话框）
- 验收口径：PRD 说「常用格式快捷键」，MDEditor 工具栏 + B/I 组合键达标，不额外做 S 编号之类的

**自动保存**：
- 状态：`content` 变化即 `dirty=true`（含元信息任一字段变化）
- 30s 定时器：`dirty` 为 true 才发 PUT/POST；请求期间标记 `saving`，成功后 `dirty=false` 并显示「已自动保存 HH:mm」
- **竞态**：自动保存与手动保存共享一个 in-flight promise 队列（简单做法：保存函数内部 `await` 上一次未完成的保存，保证顺序，防止旧内容覆盖新内容）
- 新建文章第一次保存是 POST（拿服务端 slug），之后都是 PUT
- 失败处理：网络错误 → 顶部红色条「自动保存失败，内容仍在本页」，`dirty` 保持 true 下轮重试（不做无限重试退避，30s 节律天然重试）

**离开提醒（PRD 明确加粗的需求）**：
- `beforeunload`：`dirty` 为 true 时 `e.preventDefault(); e.returnValue = ""`
- 站内跳转（`<Link>` 离开编辑页）：post-list 的 Link 换成 `onClick` 拦截 + confirm；编辑器页内所有导航出口过同一函数
- 注意：`beforeunload` 只对关闭/刷新标签页生效，SPA 内跳转不触发，两者都要

**实时预览**：
- `content`/元信息变化 → debounce 500ms → `POST /api/posts/preview` → 更新 iframe
- 首屏：直接 POST 一次初始内容
- 渲染失败的兜底：接口非 200 → 预览区显示报错文本而不是白屏

**保存/发布区**（页底固定栏）：
- 左：保存状态提示（未保存/保存中/已保存 HH:mm/失败）
- 右：`保存草稿`（PUT status=draft；hidden 文章显示 `保存为隐藏`）、`预览`（本页实时预览已在右侧，此按钮改为「新标签页打开完整预览」可选，P2 可省——**默认不做新标签页，右侧分栏即预览**，PRD 的「预览按钮」由右侧分栏满足）、`发布`（打开检查单弹窗）
- 已发布文章：编辑保存后仍是 published（PUT 不改 status）；提供 `下线（存为草稿）` 按钮

### 4.4 文章管理列表页（`/admin/page.tsx` 改写）

- 顶部：标题 + 「新建文章」按钮 + 状态 tabs（计数实时）
- 列表列：标题（链接到编辑页）、slug、分类、标签（前 2 个 +n）、状态、更新时间
- 行操作：编辑 / 发布（草稿行，走与编辑器同一 `publish-checklist`？——**列表页发布不弹检查单**：列表页发布是「已编辑完的草稿直接发布」，PRD 检查单挂在编辑器的发布动作上；列表页发布仅 confirm 一次。若实现时发现列表页也应弹检查单，把 `publish-checklist` 抽成可复用组件在列表页复用，成本很低，**实现时按能复用来做**）
- 删除：`confirm("删除后不可恢复，确认删除《title》？")`
- 登录用户信息 + 退出按钮从现有占位页保留下来（缩到页角即可）

## 5. 文件清单

**新增**
```
src/lib/posts.ts                        服务端文章管理逻辑（§3.1）
src/lib/render-content.ts               unified 管线 → HTML（§2）
src/app/api/posts/route.ts              GET 列表 / POST 新建
src/app/api/posts/[id]/route.ts         PUT / DELETE
src/app/api/posts/[id]/publish/route.ts 发布
src/app/api/posts/preview/route.ts      预览渲染
src/app/api/meta/route.ts               分类/标签元数据
src/app/admin/posts/new/page.tsx        新建编辑器页（server component）
src/app/admin/posts/[id]/edit/page.tsx  编辑编辑器页（server component）
src/components/admin/post-list.tsx
src/components/admin/post-editor.tsx
src/components/admin/preview-frame.tsx
src/components/admin/publish-checklist.tsx
```

**修改**
```
src/lib/articles.ts                     读函数加 cacheTag("posts")（先读一遍确认缓存形态，§3.3）
src/app/admin/page.tsx                  占位仪表盘 → 文章管理列表
package.json                            + @uiw/react-md-editor（pnpm 安装）
```

**依赖安装**：`pnpm add @uiw/react-md-editor`（装完 `pnpm why @uiw/react-md-editor` 查 peer；如有 React 19 peer warning 而运行正常可继续；运行报错才切 `@uiw/react-codemirror` 降级方案）。

## 6. 验证清单（不写测试代码，人工验证）

`pnpm dev` + 已 seed 的数据库（管理员 `shenjuan`）：

1. 登录 → `/admin` 显示文章列表，tabs 计数正确（草稿/已发布/隐藏）
2. 新建文章：输入标题/正文/分类/标签（含输入一个**新标签**）→ 30s 后（或 Ctrl+S）列表出现草稿
3. 刷新编辑页：内容恢复（数据库草稿）
4. 有未保存内容时关闭标签页 → 浏览器弹离开确认；已保存状态不弹
5. 编辑区输入 Markdown（表格/代码块/链接/任务列表）→ 右侧预览 500ms 内更新，代码块有语法高亮
6. 发布：清空摘要点发布 → 检查单摘要 ✗ →「仍要发布」弹二次确认；补全摘要 → 全绿一键发布
7. 发布后前台 `/`、`/archive`、`/posts/<slug>` 可见（等 SWR 秒级，强刷必见）
8. 再编辑已发布文章并保存 → 前台日期不变（publishedAt 未刷新）；检查单里勾「更新发布时间」→ 日期变
9. 删除文章 → confirm → 消失，前台对应页 404
10. 未登录直接访问 `/admin`、`/admin/posts/new`、POST `/api/posts` → 分别跳转登录/401
11. 跨域 Origin 打 POST `/api/posts` → 403
12. `pnpm build` 通过（确认没有误用 `force-dynamic`）

## 7. 风险与已知坑

| # | 风险 | 应对 |
|---|---|---|
| 1 | `@uiw/react-md-editor` peer 未声明 React 19 | 先装先跑；报错切 `@uiw/react-codemirror`（§4.3），预览管线不受影响 |
| 2 | MDEditor 自带预览与我们的 iframe 预览视觉割裂 | 强制 `preview="edit"` 只用编辑区；统一右侧 iframe |
| 3 | `cacheComponents: true` 下缓存行为与直觉不符 | 只用 `cacheTag`+`revalidateTag`；禁用 `force-dynamic`；实现时先读 `(site)` 三个页面确认哪些被缓存 |
| 4 | iframe srcDoc 样式与前台漂移 | 代码注释标注同步责任；管线一致是底线，排版靠内联样式 |
| 5 | 自动保存竞态（旧覆盖新） | 保存串行队列（§4.3） |
| 6 | `revalidateTag` SWR 窗口内前台短暂旧数据 | 个人博客可接受，验证时强刷确认 |
| 7 | 中文标题 slug 生成 | github-slugger 对纯中文输出空串，需 fallback（§3.1）；先写个小脚本验证 slugger 行为再定 fallback 格式 |

## 8. 实现顺序建议（单会话内）

1. `pnpm add @uiw/react-md-editor`，先跑通一个最小 MDEditor 页面确认 React 19 可用（风险 1 前置排雷）
2. 后端：`src/lib/posts.ts` + 7 个 API route + `articles.ts` 加 cacheTag；用 curl 验证全部端点（鉴权/Origin/校验/发布）
3. `render-content.ts` + preview route；curl 验证 HTML 输出与前台一致（对照 `rehype-pretty-code` 输出）
4. 前端：`preview-frame` → `post-list` + `/admin` 列表页 → `post-editor`（编辑/自动保存/离开提醒/检查单）
5. 按 §6 清单人工走一遍 → `pnpm build` → 提交

## 9. 会话交接备注

- 工作分支惯例：`feat/xxx` 分支 + PR（见 git log：feat/admin-login 模式）
- 用户偏好：**不写任何测试代码**（明确撤销过）；中文代码注释；每完成一步更新记忆里的进度笔记
- 提交信息结尾：`Co-Authored-By: Claude Code <noreply@anthropic.com>`
- 包管理：只用 `pnpm`
