// 全站搜索接口（PRD FR-5-01）：导航栏放大镜 + 全屏搜索层调用的数据源。
// 与 api/random 同一模式：页面是静态渲染的，搜索词在请求时才产生，必须走 route handler。

import { getPublishedPosts } from "@/lib/articles";
import { searchPosts } from "@/lib/search";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";

  // 空词直接返回空列表，由前端展示引导（PRD FR-5-02）
  if (!query) {
    return Response.json({ query, results: [] });
  }

  const posts = await getPublishedPosts();
  const results = searchPosts(posts, query);
  return Response.json({ query, results });
}
