/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jsdom',

  // 路徑別名：對應 tsconfig.json 的 @/* → src/*
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  // 初始化檔案
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],

  // 使用 ts-jest 轉換 TypeScript
  // tsconfig.json 用 "jsx": "preserve"（Next.js SWC 處理），
  // 但 Jest 需要 "react-jsx" 才能直接轉換 .tsx 中的 JSX
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react-jsx' } }],
  },

  // 忽略路徑（e2e/ 由 Playwright 獨立執行，不納入 Jest）
  testPathIgnorePatterns: ['/node_modules/', '/.next/', '/e2e/'],
}
