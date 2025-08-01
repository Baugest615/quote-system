// next.config.js - 簡化版本
/** @type {import('next').NextConfig} */
const nextConfig = {
  // 移除可能導致問題的配置
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  // 移除實驗性功能，回到穩定配置
  // experimental: {
  //   serverComponentsExternalPackages: ['@supabase/supabase-js'],
  // },
  images: {
    domains: [
      'localhost',
    ],
  },
  // 確保環境變數正確傳遞
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
  // 確保正確的輸出模式
  output: undefined,  // 移除 standalone 輸出模式
}

module.exports = nextConfig