// 简易内存滑动窗口限流（PRD FR-6-01：登录接口频率限制）
// 注意：serverless 环境下各实例独立计数，冷启动会重置；
// 对个人博客单管理员场景已足够。

const hits = new Map<string, number[]>();

/**
 * @param key   限流标识（通常用客户端 IP）
 * @param limit 窗口内最大允许次数
 * @param windowMs 窗口大小（毫秒）
 * @returns true = 放行；false = 超限
 */
export function rateLimit(
  key: string,
  limit = 5,
  windowMs = 10 * 60 * 1000 // 默认 10 分钟
): boolean {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    hits.set(key, arr);
    return false;
  }
  arr.push(now);
  hits.set(key, arr);
  // 防止 Map 无限膨胀
  if (hits.size > 1000) {
    const cutoff = now - windowMs;
    for (const [k, v] of hits) {
      if (v.every((t) => t < cutoff)) hits.delete(k);
    }
  }
  return true;
}

/** 从请求头提取客户端 IP（Vercel 会注入 x-forwarded-for） */
export function getClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}
