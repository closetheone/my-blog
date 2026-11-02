// 随机文章接口（PRD FR-4-03：404 页「随机看一篇」）。
// not-found 页是构建时静态渲染的，随机性必须放在请求时产生，
// 所以走 route handler 而不在页面里 Math.random()。
// route handler 默认每次请求都执行（cacheComponents 下不加 "use cache" 即不缓存），
// 无需任何缓存指令。

import { getPublishedPosts } from "@/lib/articles";

export async function GET() {
  const posts = await getPublishedPosts();
  if (posts.length === 0) {
    return Response.json({ slug: null }, { status: 404 });
  }
  const post = posts[Math.floor(Math.random() * posts.length)];
  return Response.json({ slug: post.slug });
}
