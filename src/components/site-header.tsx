import Link from "next/link";
import { SearchDialog } from "@/components/search-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { getPublishedPosts } from "@/lib/articles";

/** 搜索无结果引导用的热门标签：出现次数 Top 8（PRD FR-5-02） */
function getPopularTags(posts: { tags: string[] }[], limit = 8): string[] {
  const counts = new Map<string, number>();
  for (const post of posts) {
    for (const tag of post.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([tag]) => tag);
}

export async function SiteHeader() {
  const popularTags = getPopularTags(await getPublishedPosts());

  return (
    <header className="sticky top-0 z-10 border-b border-zinc-200 bg-background/80 backdrop-blur dark:border-zinc-800">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-bold hover:opacity-80">
          My Blog
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/" className="hover:opacity-70">
            首页
          </Link>
          <Link href="/archive" className="hidden hover:opacity-70 sm:inline">
            归档
          </Link>
          <Link href="/about" className="hidden hover:opacity-70 sm:inline">
            关于
          </Link>
          <SearchDialog popularTags={popularTags} />
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
