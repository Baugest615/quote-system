// src/app/layout.tsx - 修復版本
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: '報價管理系統',
  description: '現代化的報價管理系統，支援客戶管理、KOL管理、報價單生成等功能',
  // 暫時註解掉 favicon 以避免 404 錯誤
  // icons: {
  //   icon: '/favicon.ico',
  // },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-TW">
      <body className={inter.className}>
        {children}
      </body>
    </html>
  )
}