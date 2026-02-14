import Sidebar from '@/components/dashboard/Sidebar';
import { Toaster } from 'sonner';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen min-h-dvh bg-background">
      <Sidebar />
      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 overflow-y-auto lg:ml-0">
        {/* 行動裝置留空給漢堡選單的空間 */}
        <div className="lg:hidden h-12" />
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </main>
      <Toaster richColors position="bottom-right" />
    </div>
  );
}