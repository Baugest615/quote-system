/** @type {import('next').NextConfig} */
const nextConfig = {
  // ===== PostCSS 內建配置 =====
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-icons',
      'framer-motion',
      'date-fns'
    ],
    serverComponentsExternalPackages: ['@supabase/supabase-js'],
  },

  // ===== 圖片最佳化配置 =====
  images: {
    domains: ['supabase.com', 'localhost'],
    formats: ['image/webp', 'image/avif'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

  // ===== CORS 配置 =====
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: process.env.NODE_ENV === 'development' 
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
  compress: true,

  // ===== Logging 配置 =====
  logging: {
    fetches: {
      fullUrl: process.env.NODE_ENV === 'development',
    },
  },

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