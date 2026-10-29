// 防主题闪烁（FOUC）：必须在 <body> 渲染前内联执行的最小脚本。
// 放在 globals.css 同目录，由根布局 <script dangerouslySetInnerHTML> 引用。

export const themeInitScript = `
(function () {
  try {
    var saved = localStorage.getItem("theme");
    var dark =
      saved === "dark" ||
      ((!saved || saved === "system") &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (dark) document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`;
