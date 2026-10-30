"use client";

import { useCallback, useEffect, useState, type ImgHTMLAttributes } from "react";

/**
 * 文章内图片：点击放大（灯箱，PRD FR-1-08 / US-19），懒加载（FR-1-08）。
 * 通过 MDX components 映射接入，替代默认的 img 渲染。
 */
export function LightboxImage(props: ImgHTMLAttributes<HTMLImageElement>) {
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  // Esc 关闭 + 打开时锁定滚动
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, close]);

  return (
    <>
      {/* 文章内图片用原生 img：src 为 Markdown 中的任意 URL，next/image 需要域名白名单（next.config） */}
      <img
        {...props}
        alt={props.alt ?? ""}
        loading="lazy"
        decoding="async"
        // eslint-disable-next-line @next/next/no-img-element -- 理由同上
        className="cursor-zoom-in"
        onClick={() => setOpen(true)}
      />
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={props.alt ?? "图片放大查看"}
          className="lightbox-overlay"
          onClick={close}
        >
          {/* 点击图片本身不关闭 */}
          <img
            src={props.src}
            alt={props.alt ?? ""}
            className="lightbox-img"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            className="lightbox-close"
            aria-label="关闭"
            onClick={close}
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}
