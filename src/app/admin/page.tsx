// 管理后台首页 = 文章管理列表（PRD FR-6-04）
// proxy 之外的第二道兜底：会话无效/过期 redirect 登录页
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentAdmin } from "@/lib/auth";
import { AdminLogoutButton } from "@/components/admin-logout";
import { PostList } from "@/components/admin/post-list";

export const metadata = {
  title: "文章管理",
};

export default async function AdminPage() {
  // 读取 cookie 查库，天然动态渲染（读最新会话状态）
  const s = await getCurrentAdmin();
  if (!s) redirect("/admin/login");

  return (
    <div className="min-h-full">
      {/* 登录用户信息 + 退出（占位页保留项，缩到页角） */}
      <div className="mx-auto flex w-full max-w-4xl items-center justify-end gap-3 px-4 pt-4 text-xs text-zinc-400">
        <span className="w-32 text-right">
          登录：<span className="font-medium text-zinc-600 dark:text-zinc-300">{s.admin.username}</span>
        </span>
        <Link
          href="/admin/settings"
          className="text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          设置
        </Link>
        <AdminLogoutButton />
      </div>
      <PostList />
    </div>
  );
}
