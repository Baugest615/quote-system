'use client'

import { useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient } from '@/lib/queryClient'

export function Providers({ children }: { children: React.ReactNode }) {
  // 確保每個 session 使用同一個 QueryClient 實例
  const [queryClient] = useState(() => makeQueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
