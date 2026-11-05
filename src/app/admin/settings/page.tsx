// 账户设置页（PRD FR-6-12：管理员改密）
// 同 /admin 页的模式：会话无效/过期 redirect 登录页
import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth";
import { AdminSettings } from "@/components/admin/settings";

export const instant = false;

export const metadata = {
  title: "账户设置",
};

export default async function AdminSettingsPage() {
  // 读取 cookie 查库，天然动态渲染
  const s = await getCurrentAdmin();
  if (!s) redirect("/admin/login");

  return <AdminSettings username={s.admin.username} />;
}
