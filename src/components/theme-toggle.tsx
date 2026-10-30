"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "theme";

function applyTheme(theme: Theme) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = theme === "dark" || (theme === "system" && prefersDark);
  document.documentElement.classList.toggle("dark", dark);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // 必须在挂载后读取 localStorage：渲染时读取会导致服务端/客户端水合不一致
    // eslint-disable-next-line react-hooks/set-state-in-effect
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    const saved = (localStorage.getItem(STORAGE_KEY) as Theme) ?? "system";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(saved);
  }, []);

  // 系统主题变化时，若用户未手动选择则跟随
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if ((localStorage.getItem(STORAGE_KEY) as Theme) === "system") applyTheme("system");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  function cycle() {
    const next: Theme = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
    setTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  }

  const icon = theme === "system" ? "🖥️" : theme === "light" ? "☀️" : "🌙";

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label="切换明暗模式"
      title="切换明暗模式"
      className="rounded-lg px-2 py-1 text-base leading-none hover:bg-zinc-100 dark:hover:bg-zinc-800"
    >
      {mounted ? icon : "🖥️"}
    </button>
  );
}
