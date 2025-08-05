import Sidebar from '@/components/dashboard/Sidebar';
import { Toaster } from 'sonner'; // 步驟 1: 引入 Toaster 元件

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen bg-gray-100 font-sans">
      <Sidebar />
      <main className="flex-1 p-6 sm:p-8 overflow-y-auto">
        {children}
      </main>
      {/* 步驟 2: 在主佈局中加入 Toaster，richColors 提供了預設的成功/失敗顏色 */}
      <Toaster richColors position="bottom-right" />
    </div>
  );
}