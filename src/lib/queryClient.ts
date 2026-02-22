import { QueryClient } from '@tanstack/react-query'

// 按資料特性分級的快取時間
export const staleTimes = {
  /** 靜態設定（費率表、代扣設定）：1 小時 */
  static: 60 * 60 * 1000,
  /** 字典表（KOL 類型、服務類型）：30 分鐘 */
  dictionary: 30 * 60 * 1000,
  /** 列表資料（客戶、KOL、報價單）：5 分鐘（預設） */
  standard: 5 * 60 * 1000,
  /** 即時性資料（請款狀態、待處理項目）：1 分鐘 */
  realtime: 60 * 1000,
} as const

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // 預設 5 分鐘快取
        staleTime: staleTimes.standard,
        // 10 分鐘後從快取移除
        gcTime: 10 * 60 * 1000,
        // 視窗聚焦時不重新取得
        refetchOnWindowFocus: false,
        // 重連時重新取得
        refetchOnReconnect: true,
        // 失敗重試 1 次
        retry: 1,
      },
    },
  })
}
