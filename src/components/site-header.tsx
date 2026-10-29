import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader() {
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
          <Link href="/about" className="hidden hover:opacity-70 sm:inline">
            关于
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
