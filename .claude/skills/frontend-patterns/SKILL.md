---
name: frontend-patterns
description: quote-system 前端架構覆蓋規則（暗色模式、shadcn/ui）
---

# quote-system 前端模式

以下為本專案特有的前端規範：

- **深色模式唯一**：`class="dark"`，不建議 Light/Dark toggle
- **主題色**：使用 CSS 變數（`bg-card`、`text-foreground`、`text-muted-foreground`），勿硬編碼色碼
- **語義色彩**：`primary`、`destructive`、`warning`、`success`、`info`
- **UI 元件**：一律使用 shadcn/ui（`src/components/ui/`），不引入其他 UI 庫
- **圖標**：Lucide React
- **載入狀態**：`Skeleton` 元件
- **空狀態**：`EmptyState` 元件
- **錯誤邊界**：`ModuleErrorBoundary` 包裹各頁面模組
- **資料取得**：React Query hooks（`src/hooks/`）
- **表單**：React Hook Form + Zod resolver
- **動畫**：Framer Motion
- **PDF/列印元件**：`src/components/pdf/` 和 `src/app/print/` 故意使用淺色，**勿修改**
