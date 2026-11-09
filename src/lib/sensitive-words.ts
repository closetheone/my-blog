// 敏感词过滤（PRD FR-3-02 反垃圾三件套之一）
// 策略：命中即拒（400），不做替换——替换会放行脏内容。
// 词表 = 广告导流 + 高频辱骂，后续直接往数组里追加即可。

export const SENSITIVE_WORDS: string[] = [
  // 广告导流
  "加微信", "加v", "加w", "vx:", "wx:", "威信", "薇信",
  "qq群", "加qq", "加薇", "代购", "兼职刷单", "刷单", "兼职日结",
  "私聊我", "看我主页", "点击链接领取",
  // 高频辱骂（个人博客量级，宁严勿松）
  "傻逼", "煞笔", "沙比", "傻x", "智障", "脑残", "弱智",
  "妈的", "他妈", "踏马", "妈卖", "操你", "日你", "滚蛋",
  "废物", "垃圾人", "去死", "贱人", "狗东西",
];

/** 命中任一敏感词即返回 true（忽略大小写） */
export function containsSensitive(text: string): boolean {
  const t = text.toLowerCase();
  return SENSITIVE_WORDS.some((w) => t.includes(w.toLowerCase()));
}
