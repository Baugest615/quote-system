/** @type {import('next').NextConfig} */

const nextConfig = {
  // ===== 基本配置 =====
  reactStrictMode: true,

  // ===== 實驗性功能 =====
  experimental: {
    // ✅ 正確位置：將 serverComponentsExternalPackages 移到這裡
    serverComponentsExternalPackages: ['@supabase/supabase-js'],
    // 優化包導入
    optimizePackageImports: ['lucide-react', 'date-fns'],
    // 部分預渲染
    ppr: false,
  },

  // ===== 編譯配置 =====
  compiler: {
    // 移除 console.log（僅在生產環境）
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },

  // ===== 圖片優化 =====
  images: {
    // 支援的圖片格式
    formats: ['image/webp', 'image/avif'],
    // 外部圖片域名
    remotePatterns: [
      // 如果需要載入外部圖片，可以在這裡添加
    ],
    // 圖片尺寸配置
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    // ✅ 移除 quality 屬性，Next.js 14 不再支援
  },

  // ===== 路由配置 =====
  async redirects() {
    return []
  },

  async rewrites() {
    return []
  },

  // ===== Headers 配置 =====
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // 安全性 Headers
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          // CSP（內容安全政策）- 簡化版本
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' blob: data: https:",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
            ].join('; ')
          }
        ],
      },
      // API 路由的 CORS 設定
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: process.env.NODE_ENV === 'development' ? '*' : process.env.NEXT_PUBLIC_APP_URL || '*'
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS'
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization'
          },
        ],
      },
    ]
  },

  // ===== 環境變數配置 =====
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },

  // ===== 輸出配置 =====
  output: 'standalone', // 用於 Docker 部署

  // ===== Webpack 配置 =====
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    // 處理 .svg 檔案
    config.module.rules.push({
      test: /\.svg$/,
      use: ['@svgr/webpack']
    })

    // 優化打包大小
    if (!dev && !isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        // 減少 lodash 的打包大小
        'lodash': 'lodash-es',
      }
    }

    return config
  },

  // ===== TypeScript 配置 =====
  typescript: {
    ignoreBuildErrors: false,
  },

  // ===== ESLint 配置 =====
  eslint: {
    ignoreDuringBuilds: false,
    dirs: ['src'],
  },

  // ===== 效能優化 =====
  compress: true, // 啟用 gzip 壓縮

  // ===== 開發伺服器配置 =====
  ...(process.env.NODE_ENV === 'development' && {
    devIndicators: {
      buildActivity: true,
      buildActivityPosition: 'bottom-right',
    },
  }),

  // ===== 生產環境配置 =====
  ...(process.env.NODE_ENV === 'production' && {
    poweredByHeader: false, // 移除 X-Powered-By header
    
    // 最佳化配置
    modularizeImports: {
      'lucide-react': {
        transform: 'lucide-react/dist/esm/icons/{{member}}',
      },
    },
  }),

  // ===== Logging 配置 =====
  logging: {
    fetches: {
      fullUrl: process.env.NODE_ENV === 'development',
    },
  },
}

// 根據環境變數決定是否啟用某些功能
if (process.env.NODE_ENV === 'development') {
  nextConfig.onDemandEntries = {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
  }
}

module.exports = nextConfig