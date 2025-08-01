# 報價管理系統 (Quote Management System)

這是一個使用 Next.js 和 Supabase 建立的現代化報價管理系統，旨在簡化客戶、KOL (意見領袖) 及報價單的建立與管理流程。

## 專案架構解說

本專案採用當前主流的前後端分離架構：

* **前端 (Frontend)**: 使用 **Next.js (App Router)** 進行開發。React 作為核心 UI 函式庫，透過元件化 (Component-based) 的方式建構使用者介面。所有頁面、元件和邏輯都使用 **TypeScript** 編寫，以確保程式碼的型別安全與可維護性。
* **後端 (Backend)**: 完全由 **Supabase** 提供支援。這包括：
    * **PostgreSQL 資料庫**: 儲存所有核心業務資料（客戶、KOL、報價單等）。
    * **身份驗證 (Authentication)**: 處理使用者登入、登出和會話管理。
    * **儲存 (Storage)**: 用於存放使用者上傳的附件檔案。
* **樣式與 UI**: 使用 **Tailwind CSS** 進行原子化的樣式設計，並搭配 **Headless UI** 和自訂的 UI 元件庫 (`src/components/ui`) 來建立互動介面，如彈窗 (Modal)。
* **表單處理**: 透過 **React Hook Form** 和 **Zod** 進行高效且安全的表單狀態管理與資料驗證。

整體流程是：前端 Next.js 頁面透過 Supabase 的 JavaScript 客戶端 (`@supabase/supabase-js`) 與後端進行安全的資料交換，並將獲取的資料渲染成使用者介面。

## 系統檔案結構

```
quote-system/
├── .gitignore
├── next.config.js
├── package-lock.json
├── package.json
├── postcss.config.js
├── README.md
├── tailwind.config.js
├── tsconfig.json
├── next-env.d.ts
│
├── public/
│   ├── favicon.ico
│   └── fonts/
│       └── NotoSansTC-Regular.ttf
│
└── src/
    ├── app/
    │   ├── auth/
    │   │   └── login/
    │   │       └── page.tsx
    │   ├── dashboard/
    │   │   ├── clients/
    │   │   │   └── page.tsx
    │   │   ├── kols/
    │   │   │   └── page.tsx
    │   │   ├── quotes/
    │   │   │   ├── new/
    │   │   │   │   └── page.tsx
    │   │   │   ├── edit/
    │   │   │   │   └── [id]/
    │   │   │   │       └── page.tsx
    │   │   │   └── view/
    │   │   │       └── [id]/
    │   │   │           └── page.tsx
    │   │   └── settings/
    │   │       └── page.tsx
    │   ├── globals.css
    │   ├── layout.tsx
    │   └── page.tsx
    │
    ├── components/
    │   ├── clients/
    │   │   └── ClientModal.tsx
    │   ├── dashboard/
    │   │   └── Sidebar.tsx
    │   ├── kols/
    │   │   └── KolModal.tsx
    │   ├── quotes/
    │   │   ├── FileModal.tsx
    │   │   └── QuoteForm.tsx
    │   └── ui/
    │       ├── button.tsx
    │       ├── input.tsx
    │       ├── modal.tsx
    │       └── textarea.tsx
    │
    ├── lib/
    │   ├── supabase/
    │   │   ├── client.ts
    │   │   └── server.ts
    │   └── utils.ts
    │
    └── types/
        └── database.types.ts
```

## 待解決問題

目前專案在核心功能上已大致完成，但仍存在以下兩個主要問題需要解決：

1.  **PDF 匯出排版問題**
    * **現狀**: 目前使用 `jsPDF` 搭配 `jspdf-autotable` 產生 PDF。雖然已解決中文字體和檔案大小問題，但輸出的版面（特別是條款、備註、簽核欄位）與網頁上的預覽樣式存在差異。
    * **目標**: 需要進一步調整 `jsPDF` 的繪製邏輯，手動計算座標與換行，以完美複製網頁上的視覺呈現。

2.  **檔案上傳穩定性問題**
    * **現狀**: 在特定操作下（例如上傳成功後立即關閉視窗），`FileModal` 元件與後方列表頁面的狀態更新會發生衝突，偶爾導致頁面崩潰或沒有回應。
    * **目標**: 需要重構 `FileModal` 的狀態管理和與父元件的通訊方式，確保在任何操作順序下都能保持穩定。

## 後續功能開發與優化建議

1.  **儀表板總覽頁優化**:
    * 目前總覽頁的統計數字是即時計算的，未來可考慮建立數據快照或報表功能，以分析不同時間區間的業務表現（如月增長率、季度客戶數等）。
    * 增加圖表視覺化，例如每月簽約金額的長條圖。

2.  **使用者權限細化**:
    * 目前的權限系統較為簡單。可參考 `src/types/database.types.ts` 中的 `role` 欄位，實作更細緻的權限管理。
    * 例如，`member` 角色只能新增/編輯「草稿」狀態的報價單，而 `admin` 才能變更狀態為「已簽約」或刪除報價單。

3.  **全域狀態管理**:
    * 目前許多頁面（如報價單、KOL管理）都會重複抓取客戶、KOL類型等資料。
    * 可以引入輕量級的狀態管理工具（專案已安裝 **Zustand**），在使用者登入後將這些不常變動的資料存放在全域狀態中，減少對 Supabase 的重複請求，提升頁面載入速度。

4.  **程式碼重構與抽象化**:
    * 將重複的 Supabase 操作（如新增、刪除、更新各類別）抽象化成可重用的函式或自訂 Hooks (Custom Hooks)，簡化頁面元件的邏輯。
    * 例如，可以建立一個 `useDataTable('clients')` 的 Hook 來統一處理客戶資料的讀取、搜尋和分頁。

5.  **測試**:
    * 為核心的表單提交、金額計算等邏輯撰寫單元測試 (Unit Tests)。
    * 為使用者主要操作流程（如建立一張完整的報價單）撰寫端到端測試 (End-to-End Tests)，確保功能穩定。