import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import { getPostBySlug, getPublishedPosts, readingMinutes } from "@/lib/articles";
import { mdxOptions } from "@/lib/mdx";
import { extractToc } from "@/lib/toc";
import { SITE_NAME } from "@/lib/site";
import { CodeBlock } from "@/components/code-block";
import { LightboxImage } from "@/components/lightbox-image";
import { TableOfContents } from "@/components/table-of-contents";
import { CopyLinkButton } from "@/components/copy-link-button";
import { PostMeta } from "@/components/post-meta";
import { CommentSection } from "@/components/comment-section";

// 博客文章页依赖 params 读取 slug，不需要 instant navigation 优化
export const instant = false;

interface Props {
  params: Promise<{ slug: string }>;
}

// Next 16（cacheComponents）下 params 的 slug 是 URL 编码后的原样字符串，
// 需手动解码（中文 slug 不解码会查库 miss → 404；纯 ASCII slug 编码不变所以无感）
async function decodeSlug(params: Promise<{ slug: string }>) {
  const { slug } = await params;
  try {
    return { slug: decodeURIComponent(slug) };
  } catch {
    return { slug };
  }
}

export async function generateStaticParams() {
  const posts = await getPublishedPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await decodeSlug(params);
  const post = await getPostBySlug(slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.excerpt,
  };
}

export default async function PostPage({ params }: Props) {
  "use cache";
  const { slug } = await decodeSlug(params);
  const post = await getPostBySlug(slug);

  if (!post || post.status !== "published") notFound();

  // 上一篇/下一篇（FR-1-04）：仅在已发布文章中按日期排序找相邻两篇
  const posts = await getPublishedPosts();
  const index = posts.findIndex((p) => p.slug === slug);
  const prev = index > 0 ? posts[index - 1] : undefined; // 更新的一篇
  const next = index >= 0 && index < posts.length - 1 ? posts[index + 1] : undefined; // 更早的一篇

  const toc = extractToc(post.content);

  return (
    <div className="mx-auto flex max-w-5xl gap-10 px-4 py-10">
      <article className="min-w-0 flex-1">
        <header className="mb-8 border-b border-zinc-200 pb-8 dark:border-zinc-800">
          <h1 className="text-3xl font-bold leading-tight">{post.title}</h1>
          <p className="mt-3 text-sm text-zinc-500">
            {post.date} · 约 {readingMinutes(post.content)} 分钟 · {post.category}
          </p>
        </header>

        {/* TOC 在宽屏时用右侧栏（lg 以下折叠为顶部展开式，PRD FR-1-06） */}
        {toc.length > 0 && (
          <div className="lg:hidden">
            <details className="mb-6 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <summary className="cursor-pointer select-none text-sm font-semibold">
                目录
              </summary>
              <div className="mt-3">
                <TableOfContents items={toc} />
              </div>
            </details>
          </div>
        )}

        {/* M9：正文窄栏约 700px（max-w-3xl 容器内再限宽），16-17px/1.8 行高 */}
        <div className="prose-post mx-auto max-w-[700px]">
          <MDXRemote
            source={post.content}
            options={{
              mdxOptions,
              parseFrontmatter: false,
            }}
            components={{ pre: CodeBlock, img: LightboxImage }}
          />
        </div>

        {/* 上一篇/下一篇（FR-1-04） */}
        {(prev || next) && (
          <nav
            aria-label="相邻文章"
            className="mx-auto mt-10 grid max-w-[700px] grid-cols-1 gap-3 sm:grid-cols-2"
          >
            {prev ? (
              <Link
                href={`/posts/${prev.slug}`}
                className="rounded-xl border border-zinc-200 p-4 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
              >
                <span className="text-xs text-zinc-500">← 上一篇（更新）</span>
                <span className="mt-1 block truncate text-sm font-medium">
                  {prev.title}
                </span>
              </Link>
            ) : (
              <span aria-hidden />
            )}
            {next && (
              <Link
                href={`/posts/${next.slug}`}
                className="rounded-xl border border-zinc-200 p-4 text-right transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
              >
                <span className="text-xs text-zinc-500">下一篇（更早）→</span>
                <span className="mt-1 block truncate text-sm font-medium">
                  {next.title}
                </span>
              </Link>
            )}
          </nav>
        )}

        {/* 点赞 + 浏览量（FR-3-03/05）：client-side，初始值用静态计数 */}
        <div className="mx-auto mt-8 max-w-[700px]">

        </div>

        {/* 评论区（FR-3-01/06/07）：读完正文出现，不打断阅读 */}
        <div className="mx-auto max-w-[700px]">
          <CommentSection
            postId={post.id}
            enabled={post.commentsEnabled ?? true}
            initialCount={post.commentsCount ?? 0}
          />
        </div>

        <footer className="mx-auto mt-12 max-w-[700px] border-t border-zinc-200 pt-6 text-sm text-zinc-500 dark:border-zinc-800">
          <div className="mb-4">
            <CopyLinkButton />
          </div>
          <p>
            本文采用{" "}
            <a
              href="https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:opacity-70"
            >
              CC BY-NC-SA 4.0
            </a>{" "}
            协议发布 · {SITE_NAME}
          </p>
        </footer>
      </article>

      {/* 桌面端右侧 TOC（PRD FR-1-06）：sticky 跟随滚动；窄栏正文靠 flex-1 限宽 */}
      {toc.length > 0 && (
        <aside className="sticky top-24 hidden h-fit w-52 shrink-0 lg:block">
          <TableOfContents items={toc} />
        </aside>
      )}
    </div>
  );
}
