// 查询当前会话状态（供前端客户端组件使用）
import { getCurrentAdmin } from "@/lib/auth";

export async function GET() {
  const s = await getCurrentAdmin();
  return Response.json({
    authenticated: !!s,
    username: s?.admin.username ?? null,
  });
}
