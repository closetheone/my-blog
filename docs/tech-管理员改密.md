# 技术方案：管理员改密（FR-6-12，P1）

日期：2026-11-05。前置：FR-6-01/02（登录/登出，PR #12）、FR-6-03/04/09/11（编辑器，PR #14）已合并。

## 0. 需求回顾（PRD FR-6-12）

> 已登录状态下修改自己的密码；需验证原密码；新密码强度校验；改密成功后其他会话失效、当前会话延续或重新登录（**实现选择其一并在实现说明中注明**）。

**本方案选择：其他会话全部失效，当前会话延续（不要求重新登录）。**
理由：UX 更顺——改密是低频高危操作，"改完立即被登出"会让人怀疑改密是否真的生效；当前会话延续后用户可继续操作验证。安全上等价：新密码哈希落库后，所有旧 token 只有当前这一个还有效，攻击面最小化目标不变。

## 1. 改动总览

| 层 | 文件 | 改动 |
| --- | --- | --- |
| 页面 | `src/app/admin/settings/page.tsx` | **新增** 账户设置页（server component，getCurrentAdmin 兜底 redirect） |
| 组件 | `src/components/admin/settings.tsx` | **新增** 改密表单（client） |
| API | `src/app/api/auth/change-password/route.ts` | **新增** POST 改密接口 |
| 逻辑 | `src/lib/auth.ts` | **新增** `invalidateAllSessionsExcept(adminId, exceptToken)`；**新增** `validateNewPassword(plain)` 强度校验 |
| 布局 | `src/app/admin/layout.tsx` | 顶栏（或页脚）加「设置」入口链接 |
| 组件 | `src/components/admin-logout.tsx` 所在页 | `/admin` 页角已有登录信息区，设置入口放那里更自然（见 §4.3，二选一在实现时定） |

不改 schema、不改 seed、无 migration。

## 2. 后端

### 2.1 `src/lib/auth.ts` 新增

```ts
/** 新密码强度校验（FR-6-12）：≥8 位，且包含字母 + 数字。
 *  不限制大小写混合/特殊符号——个人博客单管理员，规则过严会劝退自己。
 *  返回 { ok, error? }，错误文案直接展示给用户。 */
export function validateNewPassword(plain: string): { ok: true } | { ok: false; error: string }
// 规则：长度 ≥ 8；/^[^a-z]*[a-z]/ 或大写也算字母；/\d/ 必含数字
// 错误文案：「密码至少 8 位」「密码需同时包含字母和数字」

/** 使某管理员除 exceptToken 外的所有会话失效（FR-6-12） */
export async function invalidateAllSessionsExcept(
  adminId: number,
  exceptToken: string
): Promise<number> {
  const { count } = await prisma.session.deleteMany({
    where: { adminId, id: { not: exceptToken } },
  });
  return count;
}
```

### 2.2 `POST /api/auth/change-password`

请求体：`{ currentPassword, newPassword }`。步骤：

1. **Origin 同源校验**（同 login 的 CSRF 最小防护，不引 CSRF token）。
2. **限流**：复用 `rateLimit(ip)`。注意登录限流的窗口语义（滑动窗口防暴力破解）对改密同样适用——连续输错原密码会受限。
3. **身份**：`getCurrentAdmin()`，无会话 → 401。改密接口不接受任何账号参数，永远只改「当前会话对应的管理员」。
4. **验证原密码**：`verifyPassword(currentPassword, admin.password)`，失败 → 401「原密码错误」。
5. **强度校验**：`validateNewPassword(newPassword)`，失败 → 400（文案透传）。
6. **防重复设置**：`verifyPassword(newPassword, admin.password)` 为 true → 400「新密码不能与原密码相同」（顺带的低成本防护，避免"改密"操作被用来确认当前密码）。
7. **落库**：`hashPassword(newPassword)` → `prisma.admin.update({ where: { id: admin.id }, data: { password: newHash } })`。
8. **会话处理**：`invalidateAllSessionsExcept(admin.id, 当前token)`。**不刷新当前 Cookie**（token 不变，行还在，expiresAt 不变——PRD 允许"延续"）。
9. 返回 `{ ok: true }`。

错误响应体一律 `{ error: string }`，与现有接口一致。**任何分支都不得泄露「当前密码是什么」**（原密码错误就是 401 一句文案）。

事务性：步骤 7-8 两步写库。若 7 成功 8 失败（进程被杀），后果是旧会话短暂存活（直到过期），密码已经换新——方向是安全的（不是"密码没改但会话失效"那种锁死）。个人博客量级不包 `prisma.$transaction`，但在代码注释里写明这个取舍。

### 2.3 与 proxy/middleware 的关系

无需改 `src/proxy.ts`：`/admin/settings` 与 `/api/auth/*` 都在现有拦截范围内（登录守卫覆盖整个 /admin）。

## 3. 前端

### 3.1 `/admin/settings` 页面（server component）

```tsx
// 模式同 /admin/page.tsx：getCurrentAdmin() → 无会话 redirect("/admin/login")
// 渲染 <AdminSettings />，并保留与 /admin 页角一致的登录信息区
```

### 3.2 `admin/settings.tsx`（client，风格对齐 `admin-login.tsx`）

- 三个密码框：当前密码（`autoComplete="current-password"`）、新密码、确认新密码（`autoComplete="new-password"`）。
- 前端预校验（只为了即时反馈，**权威校验在服务端**）：
  - 新密码 ≥8 位且含字母+数字 → 不满足时按钮禁用 + 提示文案；
  - 确认框与新风不一致 → 提示「两次输入不一致」；
  - 新密码 == 当前密码 → 提示。
- 提交中 `loading` 防重复提交；成功 → 顶部绿色提示「密码已更新，其他设备需重新登录」，并清空三个输入框；失败 → 红色 error 条（同登录页样式）。
- 成功后**留在本页**（当前会话延续，无需跳转）。

### 3.3 入口

`/admin` 页角登录信息区（已有「登录：xxx」+ 退出按钮）追加「设置」文字链接 → `/admin/settings`。改动最小、位置最自然。登录页不动。

## 4. 文件清单

```
A  src/app/admin/settings/page.tsx
A  src/app/admin/settings/（目录）
A  src/components/admin/settings.tsx
A  src/app/api/auth/change-password/route.ts
M  src/lib/auth.ts          （+validateNewPassword +invalidateAllSessionsExcept）
M  src/app/admin/page.tsx   （页角加「设置」链接）
```

## 5. 验证清单（不写测试代码，人工验证）

本地账号 `admin` / `admin123456`（.env），改密前先确认：

1. 未登录访问 `/admin/settings` → 307 到登录页。
2. 原密码错 → 401「原密码错误」，密码未变（再次用原密码登录成功）。
3. 新密码弱（<8 位 / 无数字）→ 400 对应文案。
4. 新密码 == 原密码 → 400「新密码不能与原密码相同」。
5. 改密成功 → `{ ok: true }`，页面提示成功，输入框清空。
6. **其他会话失效**：改密前开第二个浏览器窗口登录，改密后第二个窗口刷新 → 被 redirect 到登录页；当前窗口刷新 → 仍登录。
7. **当前会话延续**：改密后直接用新密码登一次新会话，验证新密码已生效。
8. 改密后连续 5+ 次输错原密码 → 触发 429。
9. `pnpm build` 通过、tsc 通过。
10. 生产部署后在 Vercel 用真实账号走一遍 1/5/6（本地 .env 弱密码只用于本地）。

## 6. 风险与已知坑

- **Next 16**：`cookies()` async（本路由内全部 await）；不引入 force-dynamic（不可用）。
- **限流是进程内存**（已知遗留，serverless 多实例各自计数）——改密复用同一实现，接受同样限制。
- 改密后**当前会话 expiresAt 不刷新**（不续期）。2 小时到点照旧过期，符合预期，不算 bug。
- `invalidateAllSessionsExcept` 传 `exceptToken` 来自当前 cookie——已先经 `getCurrentAdmin()` 验证有效，不存在"当前 token 已过期但仍清掉其他会话"的分支问题（过期时 getCurrentAdmin 返回 null，第 3 步就 401 了）。

## 7. 实现顺序

1. `src/lib/auth.ts` 两个函数 → 2. API route → 3. settings 页面 + 组件 → 4. `/admin` 页角入口 → 5. `pnpm build` + tsc → 6. 本地起库按 §5 清单人工验证 → 7. 提交 PR。
