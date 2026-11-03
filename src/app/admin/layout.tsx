// 管理员后台独立布局：不带前台页眉页脚
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex min-h-full flex-col">
      {children}
    </div>
  );
}
