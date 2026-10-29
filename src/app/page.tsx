import Link from "next/link";
import { getPublishedPosts } from "@/lib/articles";

export const metadata = {
  title: "首页",
};

export default async function HomePage() {
  "use cache";
  const posts = await getPublishedPosts();
  const pinned = posts.filter((p) => p.pinned).slice(0, 3);
  const rest = posts.filter((p) => !p.pinned);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      {/* 博主一句话简介 + 社交链接（PRD FR-1-01） */}
      <section className="mb-10">
        <h1 className="text-2xl font-bold">你好，我是 shenjuan 👋</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          正在借这个博客走完「前端 → 后端 → 数据库 → 部署」的全程。写技术，也写生活。
        </p>
      </section>

      {posts.length === 0 ? (
        /* 空状态（PRD M9：不留空白） */
        <p className="rounded-xl border border-dashed border-zinc-300 p-10 text-center text-zinc-500 dark:border-zinc-700">
          空空如也，不如从第一篇写起？
        </p>
      ) : (
        <>
          {/* 置顶文章 */}
          {pinned.length > 0 && (
            <section className="mb-10">
              <h2 className="mb-4 text-sm font-semibold text-zinc-500">📌 置顶</h2>
              <ul className="space-y-4">
                {pinned.map((post) => (
                  <PostItem key={post.slug} post={post} isPinned />
                ))}
              </ul>
            </section>
          )}

          {/* 文字流文章列表 */}
          <section>
            {pinned.length > 0 && (
              <h2 className="mb-4 text-sm font-semibold text-zinc-500">全部文章</h2>
            )}
            <ul className="space-y-4">
              {rest.map((post) => (
                <PostItem key={post.slug} post={post} />
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function PostItem({
  post,
  isPinned = false,
}: {
  post: Awaited<ReturnType<typeof getPublishedPosts>>[number];
  isPinned?: boolean;
}) {
  return (
    <li className="rounded-xl border border-zinc-200 p-5 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600">
      <Link href={`/posts/${post.slug}`} className="block">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-semibold text-foreground">
            {isPinned && <span title="置顶">📌 </span>}
            {post.title}
          </h3>
          <time className="shrink-0 text-sm text-zinc-500">{post.date}</time>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          {post.excerpt}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
            {post.category}
          </span>
          {post.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-600 dark:bg-blue-950 dark:text-blue-400"
            >
              {tag}
            </span>
          ))}
        </div>
      </Link>
    </li>
  );
}
