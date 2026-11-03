// 管理后台占位仪表盘（验证登录会话，后续 FR-6-08 仪表盘在此扩展）
import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth";
import { AdminLogoutButton } from "@/components/admin-logout";

export const metadata = {
  title: "管理后台",
};

export default async function AdminPage() {
  // 读取 cookie 查库，天然动态渲染（读最新会话状态）
  const s = await getCurrentAdmin();
  // proxy 之外的兜底：会话无效/过期直接回登录页
  if (!s) redirect("/admin/login");

  return (
    <div className="flex min-h-full items-center justify-center px-6 py-12">
      <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">管理后台</h1>
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-300">
          当前登录：<span className="font-medium">{s.admin.username}</span>
        </p>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          会话到期：{s.expiresAt.toLocaleString("zh-CN", { hour12: false })}
        </p>
        <AdminLogoutButton />
      </div>
    </div>
  );
}
