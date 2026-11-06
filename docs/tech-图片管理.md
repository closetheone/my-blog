# 技术方案：图片管理（FR-6-05）

> 需求（PRD §5.6）：后台上传图片（自动压缩，限制单张 ≤ 5MB、格式白名单）；按文章关联展示，支持复用；上传接口仅登录后可用。

## 1. 关键决策

| 决策点 | 选择 | 理由 |
|---|---|---|
| 存储 | **Vercel Blob**（`@vercel/blob`） | serverless（无常驻进程、无本地磁盘可写持久化），Blob 免费额度 25GB + 自动 CDN；返回的公网 URL 可直接用于 Markdown，天然满足「复用」（同一 URL 多文章引用） |
| 压缩 | **sharp**（API route 内服务端处理） | Next 官方维护的 serverless 友好图像处理库；上传后 resize 长边 ≤ 1920px + JPEG/WebP 质量 80 重编码，博客正文图足够 |
| 数据模型 | 全局图库 `PostImage` + 多对多 `PostImageRelation` | 「支持复用」意味着图不属于单篇文章；关联只是「这篇文章用过它」，可再选给其他文章 |
| 上传方式 | `multipart/form-data`，前端 `<input type=file>` | 不引前端压缩库，压缩统一在服务端（权威校验） |
| 鉴权 | 复用 `requireAdmin`（含 Origin CSRF），与 posts 路由一致 | PRD「仅登录后可用」 |
| 插入方式 | 图片弹窗选中 → 把 `![](url)` **追加到正文末尾** | MDEditor 受控 ref 拿不到光标 selection；追加是最稳的实现，用户可自己移动。已知小限制，记录在案 |

## 2. 数据模型（prisma）

```prisma
model PostImage {
  id        Int                 @id @default(autoincrement())
  url       String              @unique // Vercel Blob 公网 URL
  filename  String              // 原始文件名（展示用）
  mimeType  String
  width     Int                 // 压缩后
  height    Int
  sizeBytes Int
  createdAt DateTime            @default(now())
  relations PostImageRelation[]
}

model PostImageRelation {
  postId  Int
  imageId Int
  post    Post      @relation(fields: [postId], references: [id], onDelete: Cascade)
  image   PostImage @relation(fields: [imageId], references: [id], onDelete: Cascade)
  @@unique([postId, imageId])
}
```

- 删文章 → 关联级联清（图本身保留，图库是全局资产）。
- 删图 → 关联级联清 + `deleteBlob(url)`。

## 3. API

| 路由 | 方法 | 鉴权 | 行为 |
|---|---|---|---|
| `/api/images` | POST | requireAdmin | 校验：≤5MB、白名单 `image/jpeg|png|webp|gif`；sharp 压缩（gif 不压，直接存原图）；`putBlob` 上传（key 加随机前缀）；落库；可选 `postId` 关联 |
| `/api/images` | GET | requireAdminRead | 图库列表（id/文件名/尺寸/字节/缩略图用原 URL）；`?postId=` 时附带标记「本文章已用过」 |
| `/api/images/[id]` | DELETE | requireAdmin | 删关联 + 删 Blob + 删行 |

## 4. 前端

- `src/components/admin/image-picker.tsx`（新）：弹窗 = 上传区（拖拽/点选，显示进度与失败原因）+ 图库网格（缩略图 + 文件名 + 尺寸；当前文章已关联的图高亮角标）；点图 → `onPick(url)` 回调。
- `post-editor.tsx`：正文工具条区加「插入图片」按钮（与既有底栏按钮风格一致）；`onPick` → `fields.content += "\n\n![](url)"` + 置 dirty（走既有 30s 自动保存/手动保存链路）；若文章已有 id，后台补关联（上传时已传 postId，弹窗内旧图选中需补关联 → 复用 POST 不行，加 `POST /api/images/[id]/posts` 关联接口）。
- 新建文章（id=null）：上传不关联；首次保存后关联由前端补传（保存成功拿到 id 时，对「本次会话内上传/选用」的图批量补关联）。

  **简化**：不区分新建/编辑——关联不在上传时做，统一在**保存成功后**由前端把「本次选中过的图 URL 列表」POST 给 `/api/images/associate`（body: `{postId, urls[]}`，幂等 upsert）。避免 id 时序问题。

## 5. 环境变量

- `BLOB_READ_WRITE_TOKEN`：Vercel Dashboard → Project → Settings → Blob Storage 创建（**用户需手动操作**）。本地与生产共用（Blob 免费额度内）。
- 本地 `.env` 加该键；`.env.example` 同步。

## 6. 验证清单

1. 未登录 POST /api/images → 401；跨域 Origin → 403
2. 超 5MB / 非白名单格式 → 400
3. 上传成功：Blob 可访问、落库字段正确（压缩后尺寸/字节）
4. gif 原样上传不压缩
5. 图库列表 + `?postId` 关联标记
6. 编辑器：插入图片 → 预览出现图（走真实管线）→ 保存 → 前台文章页显示图
7. 复用：A 文用过的图，B 文弹窗可再选
8. 删图：Blob 删除、DB 行删除、文章关联清除
9. tsc ✓、pnpm build ✓、新文件 lint ✓

## 7. 遗留/已知限制

- 插入位置是正文末尾（光标位置取不到，MDEditor 受控模式）。
- Blob 单对象无配额告警机制，个人博客量级不处理。
- 图片不做 EXIF 方向修正说明：sharp 默认 `rotate()` 会按 EXIF 摆正，属预期行为。
