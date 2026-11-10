// 仪表盘（PRD FR-6-08：文章总数、评论总数、近 7 天浏览量、最新评论列表）
// 服务端渲染读库，无交互组件；同 /admin 页的会话兜底模式
import Link from "next/link";
import { getCurrentAdmin } from "@/lib/auth";
import { AdminLogoutButton } from "@/components/admin-logout";
import { redirect } from "next/navigation";
import { getDashboardStats } from "@/lib/dashboard";

export const metadata = {
  title: "仪表盘",
};

export const instant = false;

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-sm text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{value}</div>
    </div>
  );
}

export default async function AdminDashboardPage() {
  const s = await getCurrentAdmin();
  if (!s) redirect("/admin/login");
  const stats = await getDashboardStats();

  return (
    <div className="min-h-full">
      <div className="mx-auto flex w-full max-w-4xl items-center justify-end gap-3 px-4 pt-4 text-xs text-zinc-400">
        <span className="w-32 text-right">
          登录：<span className="font-medium text-zinc-600 dark:text-zinc-300">{s.admin.username}</span>
        </span>
        <Link
          href="/admin"
          className="text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          文章管理
        </Link>
        <Link
          href="/admin/comments"
          className="text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          评论
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
        <h1 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">仪表盘</h1>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="文章总数" value={stats.postTotal} />
          <StatCard label="已发布" value={stats.postCounts["published"] ?? 0} />
          <StatCard label="评论总数" value={stats.commentTotal} />
          <StatCard label="近 7 天浏览量" value={stats.views7d} />
        </div>

        <h2 className="mb-2 mt-8 text-sm font-semibold text-zinc-700 dark:text-zinc-300">最新评论</h2>
        {stats.latestComments.length === 0 ? (
          <p className="text-sm text-zinc-400">暂无评论</p>
        ) : (
          <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {stats.latestComments.map((c) => (
              <li key={c.id} className="px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  {c.pinned && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                      置顶
                    </span>
                  )}
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">{c.nickname}</span>
                  <span className="text-xs text-zinc-400">
                    {new Date(c.createdAt).toLocaleString("zh-CN", { hour12: false })}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 break-words text-sm text-zinc-600 dark:text-zinc-400">
                  {c.content}
                </p>
                <Link
                  href={`/admin/posts/${c.postSlug}/edit`}
                  className="mt-1 inline-block text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                >
                  《{c.postTitle}》
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
