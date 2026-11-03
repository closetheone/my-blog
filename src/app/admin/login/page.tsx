// 管理员登录页（PRD FR-6-01）
import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth";
import { AdminLoginForm } from "@/components/admin-login";

export const metadata = {
  title: "管理员登录",
};

export default async function AdminLoginPage() {
  // 读取 cookie 查库，天然动态渲染
  const s = await getCurrentAdmin();
  if (s) redirect("/admin");
  return <AdminLoginForm />;
}
