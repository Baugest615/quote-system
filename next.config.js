/** @type {import('next').NextConfig} */

const nextConfig = {
  // ===== 基本配置 =====
  reactStrictMode: true,
  serverExternalPackages: ['@supabase/supabase-js'],

  // ===== 實驗性功能 =====
  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns'],
    ppr: false,
  },

  // ===== 編譯配置 =====
  compiler: {
    removeConsole:
      process.env.NODE_ENV === 'production'
        ? {
          exclude: ['error', 'warn'],
        }
        : false,
  },

  // ===== 圖片優化 =====
  images: {
    formats: ['image/webp', 'image/avif'],
    remotePatterns: [],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

  // ===== 路由配置 =====
  async redirects() {
    return [];
  },

  async rewrites() {
    return [];
  },

  // ===== Headers 配置 =====
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' blob: data: https:",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
            ].join('; '),
          },
        ],
      },
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value:
              process.env.NODE_ENV === 'development'
                ? '*'
                : process.env.NEXT_PUBLIC_APP_URL || '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization',
          },
        ],
      },
    ];
  },

  // ===== 環境變數配置 =====
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },

  // ===== 輸出配置 =====
  output: 'standalone',

  // ===== Webpack 配置 =====
  webpack: (config, { dev, isServer }) => {
    config.module.rules.push({
      test: /\.svg$/,
      use: ['@svgr/webpack'],
    });

    if (!dev && !isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        lodash: 'lodash-es',
      };
    }

    return config;
  },

  // ===== Logging 配置 =====
  logging: {
    fetches: {
      fullUrl: process.env.NODE_ENV === 'development',
    },
  },

  // ===== 開發伺服器配置 =====
  ...(process.env.NODE_ENV === 'development' && {}),

  // ===== 生產環境配置 =====
  ...(process.env.NODE_ENV === 'production' && {
    poweredByHeader: false,
    modularizeImports: {
      'lucide-react': {
        transform: 'lucide-react/dist/esm/icons/{{member}}',
      },
    },
  }),
};

// ===== 開發用 On-demand entries 配置 =====
if (process.env.NODE_ENV === 'development') {
  nextConfig.onDemandEntries = {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
  };
}

module.exports = nextConfig;