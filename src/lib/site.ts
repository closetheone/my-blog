// 站点常量：站名、简介、开站日期、基础 URL。集中一处，V1.0 用占位值，域名定了再改。

export const SITE_NAME = "My Blog";
export const SITE_DESCRIPTION = "技术为主 + 生活随笔 · 借博客学习全栈开发与部署";
export const SITE_START_DATE = "2026-10-28"; // 页脚「已运行 N 天」的起点
// 站点基础 URL（RSS 绝对链接、sitemap 用）。本地开发用 localhost，生产通过环境变量覆盖。
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
