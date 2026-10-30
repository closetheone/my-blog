import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import { getPostBySlug, getPublishedPosts, readingMinutes } from "@/lib/articles";
import { mdxOptions } from "@/lib/mdx";
import { SITE_NAME } from "@/lib/site";
import { CodeBlock } from "@/components/code-block";
import { LightboxImage } from "@/components/lightbox-image";
import { ReadingProgress } from "@/components/reading-progress";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const posts = await getPublishedPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.excerpt,
  };
}

export default async function PostPage({ params }: Props) {
  "use cache";
  const { slug } = await params;
  const post = await getPostBySlug(slug);

  if (!post || post.status !== "published") notFound();

  return (
    <>
      {/* 阅读进度条（PRD M9：顶部 2px 细条，随滚动前进） */}
      <ReadingProgress />
      <article className="mx-auto max-w-3xl px-4 py-10">
        <header className="mb-8 border-b border-zinc-200 pb-8 dark:border-zinc-800">
          <h1 className="text-3xl font-bold leading-tight">{post.title}</h1>
          <p className="mt-3 text-sm text-zinc-500">
            {post.date} · 约 {readingMinutes(post.content)} 分钟 · {post.category}
          </p>
        </header>

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

        <footer className="mx-auto mt-12 max-w-[700px] border-t border-zinc-200 pt-6 text-sm text-zinc-500 dark:border-zinc-800">
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
    </>
  );
}
