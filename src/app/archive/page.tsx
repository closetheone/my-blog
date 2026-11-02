import type { Metadata } from "next";
import Link from "next/link";
import { getPublishedPosts } from "@/lib/articles";

export const metadata: Metadata = {
  title: "归档",
  description: "按年份分组的全部已发布文章",
};

export default async function ArchivePage() {
  "use cache";
  const posts = await getPublishedPosts();

  // 按年份分组（posts 已按日期倒序，分组后保持组内倒序）
  const byYear = new Map<string, typeof posts>();
  for (const post of posts) {
    const year = post.date.slice(0, 4);
    const list = byYear.get(year) ?? [];
    list.push(post);
    byYear.set(year, list);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-8 text-2xl font-bold">归档</h1>

      {posts.length === 0 ? (
        /* 空状态（PRD M9：不留空白） */
        <p className="rounded-xl border border-dashed border-zinc-300 p-10 text-center text-zinc-500 dark:border-zinc-700">
          空空如也，不如从第一篇写起？
        </p>
      ) : (
        <div className="space-y-4">
          {[...byYear.entries()].map(([year, yearPosts]) => (
            /* 年份可折叠（PRD FR-2-03）：默认展开 */
            <details key={year} open className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <summary className="cursor-pointer select-none text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                {year}
                <span className="ml-2 font-normal text-zinc-400">
                  {yearPosts.length} 篇
                </span>
              </summary>
              <ul className="mt-3 space-y-2">
                {yearPosts.map((post) => (
                  <li key={post.slug} className="flex items-baseline gap-3 text-sm">
                    <time className="shrink-0 tabular-nums text-zinc-500">
                      {post.date.slice(5)}
                    </time>
                    <Link
                      href={`/posts/${post.slug}`}
                      className="truncate hover:underline"
                    >
                      {post.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
