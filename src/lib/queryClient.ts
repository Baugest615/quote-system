import { QueryClient } from '@tanstack/react-query'

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // 預設 5 分鐘快取
        staleTime: 5 * 60 * 1000,
        // 10 分鐘後從快取移除
        gcTime: 10 * 60 * 1000,
        // 視窗聚焦時重新取得
        refetchOnWindowFocus: false,
        // 重連時重新取得
        refetchOnReconnect: true,
        // 失敗重試 1 次
        retry: 1,
      },
    },
  })
}
