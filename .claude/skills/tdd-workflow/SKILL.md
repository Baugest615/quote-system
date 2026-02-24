---
name: tdd-workflow
description: "quote-system TDD 流程 — Jest + Testing Library + Supabase mock"
---

# TDD 工作流程

## 測試環境
- Jest 29 + @testing-library/react 14（jsdom）
- Setup：`jest.setup.ts`（已全域 mock @supabase/supabase-js、sonner）
- 覆蓋率目標：80%+

## 流程
1. 寫測試（應失敗）
2. 實作最小程式碼讓測試通過
3. 重構（測試仍通過）
4. `npm test -- --coverage` 驗證覆蓋率

## Supabase Mock

```typescript
// jest.setup.ts 已 mock，測試中可直接使用：
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({ data: [...], error: null }))
      })),
      insert: jest.fn(() => Promise.resolve({ data: null, error: null })),
      update: jest.fn(() => Promise.resolve({ data: null, error: null })),
    }))
  }))
}))
```

## React Query Hook 測試

```typescript
const createWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

const { result } = renderHook(() => useClients(), { wrapper: createWrapper() })
await waitFor(() => expect(result.current.isSuccess).toBe(true))
```
