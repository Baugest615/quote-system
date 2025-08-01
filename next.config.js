// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // 在生產構建過程中忽略 TypeScript 錯誤（不推薦）
    ignoreBuildErrors: false,
  },
  eslint: {
    // 在生產構建過程中忽略 ESLint 錯誤（不推薦）
    ignoreDuringBuilds: false,
  },
  experimental: {
    // 啟用 App Router 的 SSR 優化
    serverComponentsExternalPackages: ['@supabase/supabase-js'],
  },
  images: {
    domains: [
      'localhost',
      // 如果您使用 Supabase Storage 儲存圖片，請加入您的 Supabase 專案 URL
      'https://qyadnxivvwetuipjkndc.supabase.co'
    ],
  },
  // 支援 Supabase 的環境變數
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
}

module.exports = nextConfig