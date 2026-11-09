// 编辑文章页（server component）：查 post 初始数据传给客户端编辑器
import { notFound, redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth";
import { getPostFull } from "@/lib/posts";
import { PostEditor, type EditorInitial } from "@/components/admin/post-editor";

export const instant = false;

export const metadata = {
  title: "编辑文章",
};

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const s = await getCurrentAdmin();
  if (!s) redirect("/admin/login");

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const post = await getPostFull(id);
  if (!post) notFound();

  const initial: EditorInitial = {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    content: post.content,
    status: post.status as EditorInitial["status"],
    publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
    scheduledFor: post.scheduledFor ? post.scheduledFor.toISOString() : null,
    categoryId: post.categoryId,
    tagIds: post.tagIds,
    categoryName: post.category,
    commentsEnabled: post.commentsEnabled,
  };
  return <PostEditor initial={initial} />;
}
