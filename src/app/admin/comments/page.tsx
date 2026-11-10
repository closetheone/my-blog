// 评论管理页（PRD FR-3-02）：会话兜底 + 评论列表
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentAdmin } from "@/lib/auth";
import { AdminLogoutButton } from "@/components/admin-logout";
import { CommentList } from "@/components/admin/comment-list";

export const metadata = {
  title: "评论管理",
};

export const instant = false;

export default async function AdminCommentsPage() {
  const s = await getCurrentAdmin();
  if (!s) redirect("/admin/login");

  return (
    <div className="min-h-full">
      <div className="mx-auto flex w-full max-w-4xl items-center justify-end gap-3 px-4 pt-4 text-xs text-zinc-400">
        <Link
          href="/admin/dashboard"
          className="text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          仪表盘
        </Link>
        <Link
          href="/admin"
          className="text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          文章管理
        </Link>
        <Link
          href="/admin/settings"
          className="text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          设置
        </Link>
        <AdminLogoutButton />
      </div>
      <div className="mx-auto w-full max-w-4xl px-4 py-4">
        <h1 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">评论管理</h1>
        <CommentList />
      </div>
    </div>
  );
}
