// src/app/not-found.tsx
import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary">
      <div className="max-w-md w-full text-center">
        <h1 className="text-6xl font-bold text-foreground mb-4">404</h1>
        <h2 className="text-2xl font-semibold text-foreground/70 mb-4">頁面不存在</h2>
        <p className="text-muted-foreground mb-8">
          抱歉，您要找的頁面不存在。
        </p>
        <div className="space-y-4">
          <Link 
            href="/auth/login" 
            className="block w-full bg-emerald-600 text-white py-2 px-4 rounded-md hover:bg-emerald-700 transition-colors"
          >
            前往登入頁面
          </Link>
          <Link 
            href="/" 
            className="block w-full bg-muted text-foreground py-2 px-4 rounded-md hover:bg-gray-300 transition-colors"
          >
            返回首頁
          </Link>
        </div>
      </div>
    </div>
  )
}