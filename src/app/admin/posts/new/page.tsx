// 新建文章页（server component）
// proxy 之外的第二道兜底：会话无效/过期 redirect 登录页
import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth";
import { PostEditor, type EditorInitial } from "@/components/admin/post-editor";

export const instant = false;

export const metadata = {
  title: "新建文章",
};

export default async function NewPostPage() {
  const s = await getCurrentAdmin();
  if (!s) redirect("/admin/login");

  // new 页给空对象；分类/标签下拉由客户端组件自己取 /api/meta
  const initial: EditorInitial = {
    id: null,
    slug: "",
    title: "",
    excerpt: "",
    content: "",
    status: "draft",
    publishedAt: null,
    scheduledFor: null,
    categoryId: null,
    tagIds: [],
    categoryName: null,
  };
  return <PostEditor initial={initial} />;
}
