// /api/cron/publish-scheduled —— Vercel Cron 定时发布调度（FR-6-06）
// 每 5 分钟由 Vercel Cron 触发，扫描到期的定时草稿并自动发布
import { processScheduledPosts } from "@/lib/posts";

export async function POST(req: Request) {
  // 校验 Vercel Cron 密钥
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const published = await processScheduledPosts();
    return Response.json({ published });
  } catch (e) {
    console.error("[api/cron/publish-scheduled]", e);
    return Response.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
