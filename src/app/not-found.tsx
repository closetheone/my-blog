import Link from "next/link";
import { RandomPostButton } from "@/components/random-post-button";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center px-4 py-24 text-center">
      <h1 className="text-5xl font-bold">404</h1>
      <p className="mt-4 text-zinc-600 dark:text-zinc-400">
        这篇文章可能被删了，或者从来没存在过——就像我的周末一样。
      </p>
      <div className="mt-8 flex gap-4">
        <Link
          href="/"
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500"
        >
          回首页
        </Link>
        <RandomPostButton />
      </div>
    </div>
  );
}
