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
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },

  // 忽略路徑
  testPathIgnorePatterns: ['/node_modules/', '/.next/'],
}
