"use client";

// 管理员改密表单（PRD FR-6-12）
// 前端预校验只为即时反馈，权威校验在服务端（/api/auth/change-password）
import { useState } from "react";
import Link from "next/link";

export function AdminSettings({ username }: { username: string }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // 即时预校验（与服务端规则一致，文案可不同但结论相同）
  const clientIssues = ((): string[] => {
    const issues: string[] = [];
    if (newPassword.length > 0) {
      if (newPassword.length < 8) issues.push("新密码至少 8 位");
      else if (!/[a-zA-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
        issues.push("新密码需同时包含字母和数字");
      }
    }
    if (newPassword && confirmPassword !== newPassword) {
      issues.push("两次输入的新密码不一致");
    }
    if (
      currentPassword &&
      newPassword &&
      newPassword === currentPassword
    ) {
      issues.push("新密码不能与原密码相同");
    }
    return issues;
  })();

  const canSubmit =
    !loading &&
    currentPassword.length > 0 &&
    newPassword.length > 0 &&
    confirmPassword.length > 0 &&
    clientIssues.length === 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSuccess("密码已更新，其他设备的登录已失效");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        setError(data.error ?? "改密失败，请稍后再试");
      }
    } catch {
      setError("网络异常，请稍后再试");
    } finally {
      setLoading(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100";
  const labelCls =
    "mb-1 block text-sm text-zinc-600 dark:text-zinc-300";

  return (
    <div className="flex min-h-full items-center justify-center px-6 py-12">
      <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
            账户设置
          </h1>
          <Link
            href="/admin"
            className="text-xs text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            返回文章管理
          </Link>
        </div>
        <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
          登录：<span className="font-medium text-zinc-600 dark:text-zinc-300">{username}</span>
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="current-password" className={labelCls}>
              原密码
            </label>
            <input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="new-password" className={labelCls}>
              新密码
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="confirm-password" className={labelCls}>
              确认新密码
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className={inputCls}
            />
          </div>

          {clientIssues.length > 0 && (
            <ul className="space-y-1">
              {clientIssues.map((msg) => (
                <li
                  key={msg}
                  className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                >
                  {msg}
                </li>
              ))}
            </ul>
          )}
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
              {error}
            </p>
          )}
          {success && (
            <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-400">
              {success}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {loading ? "更新中…" : "更新密码"}
          </button>
        </form>
        <p className="mt-4 text-xs text-zinc-400 dark:text-zinc-500">
          更新后其他设备的登录将立即失效，当前会话不受影响。
        </p>
      </div>
    </div>
  );
}
