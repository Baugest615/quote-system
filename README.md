# 報價管理系統 (Quotation Management System)

現代化的報價管理系統，支援客戶管理、KOL管理、報價單生成等功能。使用 Next.js 14 (App Router) 和 Supabase 建構的全端應用程式。

## 🚀 專案概述

本系統是一個完整的業務報價管理平台，專為需要管理多種客戶、KOL（意見領袖）合作以及生成專業報價單的企業設計。系統採用現代化的技術架構，提供流暢的使用者體驗和強大的功能支援。

### 主要功能特色

- 🏢 **客戶管理**: 完整的客戶資料管理，包含聯絡資訊、發票資料、銀行資訊
- 👥 **KOL管理**: KOL資料庫管理，包含社群連結、服務類型、價格設定  
- 📋 **報價單管理**: 動態報價單建立、編輯、檢視與PDF匯出
- 🔐 **權限管理**: 基於角色的存取控制（Admin/Member）
- 📊 **報表分析**: 業務統計、營收分析、趨勢圖表
- 📁 **檔案管理**: 支援附件上傳與管理（含浮水印PDF匯出）
- 🎨 **響應式設計**: 支援桌面與行動裝置

## 🏗️ 技術架構

### 前端技術堆疊
- **Next.js 14** (App Router) - React 全端框架
- **TypeScript** - 型別安全與程式碼品質保證
- **Tailwind CSS** - 原子化CSS框架
- **Shadcn/ui** - 現代化UI組件庫
- **React Hook Form** - 高效能表單管理
- **Zod** - TypeScript優先的資料驗證
- **Lucide React** - 現代化圖標庫
- **Framer Motion** - 動畫效果

### 後端與資料庫
- **Supabase** - 開源Firebase替代方案
  - PostgreSQL 資料庫
  - 即時訂閱功能
  - 身份驗證系統
  - 檔案儲存服務
- **Row Level Security (RLS)** - 資料安全保護

### PDF與檔案處理
- **html2pdf.js** - PDF匯出（含浮水印功能）
- **@react-pdf/renderer** - 高品質PDF生成備用方案
- **html2canvas** - HTML轉圖像

### 開發工具
- **ESLint & Prettier** - 程式碼品質與格式化
- **Jest** - 單元測試框架
- **Sonner** - Toast通知系統

## 📁 專案檔案結構

```
quotation-management-system/
├── 📄 配置檔案
│   ├── .gitignore                 # Git忽略檔案設定
│   ├── .eslintrc.json            # ESLint設定
│   ├── components.json           # Shadcn/ui設定
│   ├── declarations.d.ts         # TypeScript聲明檔案
│   ├── middleware.ts             # Next.js中介軟體（權限控制）
│   ├── middleware.ts.backup      # 中介軟體備份檔案
│   ├── next.config.js            # Next.js設定
│   ├── package.json              # 專案依賴與腳本
│   ├── postcss.config.js         # PostCSS設定
│   ├── tailwind.config.js        # Tailwind CSS設定
│   ├── tsconfig.json             # TypeScript設定
│   └── README.md                 # 專案說明文件
│
├── 📁 public/                    # 靜態資源
│   ├── favicon.ico
│   ├── watermark-an.png          # PDF浮水印圖檔
│   └── fonts/
│       └── NotoSansTC-Regular.ttf # 中文字體檔案
│
└── 📁 src/                       # 原始碼目錄
    ├── 📁 app/                   # Next.js App Router頁面
    │   ├── globals.css           # 全域CSS樣式
    │   ├── layout.tsx            # 根佈局元件
    │   ├── page.tsx              # 首頁（重定向邏輯）
    │   │
    │   ├── 📁 auth/              # 身份驗證相關頁面
    │   │   └── login/
    │   │       └── page.tsx      # 登入頁面
    │   │
    │   └── 📁 dashboard/         # 儀表板區域
    │       ├── layout.tsx        # 儀表板佈局
    │       ├── page.tsx          # 儀表板首頁（統計總覽）
    │       │
    │       ├── 📁 clients/       # 客戶管理
    │       │   └── page.tsx      # 客戶列表頁面
    │       │
    │       ├── 📁 kols/          # KOL管理
    │       │   └── page.tsx      # KOL列表頁面
    │       │
    │       ├── 📁 quotes/        # 報價單管理
    │       │   ├── page.tsx      # 報價單列表
    │       │   ├── new/
    │       │   │   └── page.tsx  # 建立新報價單
    │       │   ├── edit/
    │       │   │   └── [id]/
    │       │   │       └── page.tsx # 編輯報價單
    │       │   └── view/
    │       │       └── [id]/
    │       │           └── page.tsx # 檢視報價單（含PDF匯出）
    │       │
    │       ├── 📁 reports/       # 報表分析
    │       │   └── page.tsx      # 報表儀表板（營收統計、趨勢分析）
    │       │
    │       └── 📁 settings/      # 系統設定
    │           └── page.tsx      # 設定頁面
    │
    ├── 📁 components/            # React組件
    │   ├── 📁 ui/                # 基礎UI組件（Shadcn/ui）
    │   │   ├── button.tsx        # 按鈕組件
    │   │   ├── input.tsx         # 輸入框組件
    │   │   ├── modal.tsx         # 對話框組件
    │   │   └── textarea.tsx      # 文字區域組件
    │   │
    │   ├── 📁 dashboard/         # 儀表板組件
    │   │   └── Sidebar.tsx       # 側邊欄導覽
    │   │
    │   ├── 📁 clients/           # 客戶相關組件
    │   │   └── ClientModal.tsx   # 客戶新增/編輯對話框
    │   │
    │   ├── 📁 kols/              # KOL相關組件
    │   │   └── KolModal.tsx      # KOL新增/編輯對話框
    │   │
    │   └── 📁 quotes/            # 報價單相關組件
    │       ├── QuoteForm.tsx     # 報價單表單（核心組件）
    │       └── FileModal.tsx     # 檔案上傳對話框（含安全檔名處理）
    │
    ├── 📁 lib/                   # 工具庫與設定
    │   ├── 📁 supabase/          # Supabase設定
    │   │   ├── client.ts         # 客戶端Supabase實例
    │   │   └── server.ts         # 伺服器端Supabase實例
    │   └── utils.ts              # 通用工具函式（含CSV匯出、格式化）
    │
    └── 📁 types/                 # TypeScript型別定義
        └── database.types.ts     # Supabase資料庫型別（含完整Enums）
```

## 🗄️ 資料庫架構

### 核心資料表

#### `users` (使用者表)
- `id` (UUID, Primary Key)
- `email` (電子郵件)
- `role` (使用者角色: admin/member)
- `created_at`, `updated_at` (時間戳記)

#### `clients` (客戶資料表)
- `id` (UUID, Primary Key)
- `name` (客戶名稱)
- `contact_person` (聯絡人)
- `phone` (電話)
- `address` (地址)
- `tin` (統一編號)
- `invoice_title` (發票抬頭)
- `bank_info` (銀行資訊, JSON)

#### `kol_types` (KOL類型表)
- `id` (UUID, Primary Key)
- `name` (類型名稱，如：YouTuber、網紅、部落客)

#### `service_types` (服務類型表)
- `id` (UUID, Primary Key)
- `name` (服務名稱，如：廣告投放、產品開箱、直播合作)

#### `kols` (KOL資料表)
- `id` (UUID, Primary Key)
- `name` (KOL名稱)
- `real_name` (真實姓名)
- `type_id` (外鍵 → kol_types)
- `social_links` (社群連結, JSON)
- `bank_info` (銀行資訊, JSON)

#### `kol_services` (KOL服務價格表)
- `id` (UUID, Primary Key)
- `kol_id` (外鍵 → kols)
- `service_type_id` (外鍵 → service_types)
- `price` (服務價格)

#### `quotations` (報價單主表)
- `id` (UUID, Primary Key)
- `project_name` (專案名稱)
- `client_id` (外鍵 → clients)
- `client_contact` (客戶聯絡人)
- `payment_method` (付款方式：電匯/ATM轉帳)
- `subtotal_untaxed` (未稅小計)
- `tax` (營業稅)
- `grand_total_taxed` (含稅總計)
- `has_discount` (是否有折扣)
- `discounted_price` (折扣後價格)
- `terms` (合約條款)
- `remarks` (備註)
- `status` (狀態：草稿/待簽約/已簽約/已歸檔)
- `attachments` (附件清單, JSON Array)

#### `quotation_items` (報價單項目表)
- `id` (UUID, Primary Key)
- `quotation_id` (外鍵 → quotations)
- `category` (項目分類)
- `kol_id` (外鍵 → kols)
- `service` (服務內容)
- `quantity` (數量)
- `price` (單價)
- `remark` (備註)

### 枚舉類型 (Enums)
- `payment_method`: "電匯" | "ATM轉帳"
- `quotation_status`: "草稿" | "待簽約" | "已簽約" | "已歸檔"
- `user_role`: "admin" | "member"

### 權限與安全
- 使用 Supabase Row Level Security (RLS)
- Middleware 實作路由層級權限控制
- useAuthGuard Hook 提供頁面級認證保護
- 所有API調用都經過身份驗證

## 🚦 當前專案狀態

### ✅ 已完成核心功能

#### 身份驗證與權限
- ✅ 完整的使用者身份驗證系統
- ✅ 基於角色的權限控制 (Admin/Member)
- ✅ Middleware 路由保護
- ✅ useAuthGuard Hook 頁面級保護

#### 資料管理
- ✅ 客戶資料CRUD操作（含搜尋功能）
- ✅ KOL資料管理與服務價格設定
- ✅ 報價單建立、編輯、檢視功能
- ✅ 動態報價項目管理
- ✅ 自動稅額計算與折扣處理

#### PDF與檔案功能
- ✅ **高品質PDF匯出**（html2pdf.js實作）
  - 動態載入避免SSR錯誤
  - 自動浮水印添加
  - 完整樣式處理
  - 錯誤處理機制
- ✅ **檔案上傳管理**（FileModal組件）
  - 安全檔名處理
  - 5MB檔案大小限制
  - 多格式支援
  - 狀態衝突避免機制

#### 報表與分析
- ✅ **完整報表儀表板**
  - 營收統計與趨勢分析
  - 客戶貢獻度排行
  - KOL績效分析
  - 狀態分布圖表
  - CSV匯出功能

#### 使用者介面
- ✅ 響應式UI設計
- ✅ 現代化組件庫 (Shadcn/ui)
- ✅ Toast通知系統 (Sonner)
- ✅ 載入狀態與錯誤處理

### 📈 系統亮點

1. **技術架構現代化**: Next.js 14 App Router + TypeScript + Supabase
2. **PDF輸出專業級**: 含浮水印的高品質PDF生成
3. **完整權限系統**: 多層級權限控制與路由保護
4. **資料安全性**: RLS + 中介軟體雙重保護
5. **使用者體驗**: 流暢的操作流程與即時回饋

## 🔮 進階優化建議

### 1. 效能增強
- **全域狀態管理**: 
  - 引入 Zustand 減少重複API調用
  - 客戶、KOL資料本地快取
  - 背景資料同步機制
- **載入優化**:
  - 報價單列表虛擬捲動
  - 圖片延遲載入
  - 組件程式碼分割

### 2. 功能擴展
- **進階報表視覺化**:
  - Chart.js/Recharts 整合
  - 互動式圖表儀表板
  - 自訂報表範本
- **通知與自動化**:
  - Email自動發送
  - 到期提醒系統
  - Webhook整合
- **範本與工作流程**:
  - 報價單範本管理
  - 審批工作流程
  - 批次操作功能

### 3. 使用者體驗
- **進階互動**:
  - 拖拽排序功能
  - 鍵盤快捷鍵
  - 批次選擇操作
- **搜尋與篩選**:
  - 全文搜尋功能
  - 進階篩選條件
  - 儲存搜尋結果

### 4. 技術架構
- **程式碼品質**:
  - 單元測試覆蓋率提升
  - E2E測試實作
  - 錯誤邊界組件
- **API抽象化**:
  - 統一資料存取層
  - 自訂Hooks重構
  - 快取策略優化

### 5. 安全性強化
- **稽核與監控**:
  - 操作日誌記錄
  - 異常行為偵測
  - 效能監控儀表板
- **資料保護**:
  - 敏感資料加密
  - 備份與復原機制
  - GDPR合規功能

## 🛠️ 開發指南

### 環境需求
- Node.js 18.x+
- npm 8.0.0+
- Supabase 帳號

### 安裝與啟動
```bash
# 複製專案
git clone https://github.com/Baugest615/quote-system.git
cd quotation-management-system

# 安裝依賴
npm install

# 設定環境變數
cp .env.example .env.local
# 編輯 .env.local 設定 Supabase 連線資訊

# 啟動開發伺服器
npm run dev

# 開啟瀏覽器 http://localhost:3000
```

### 可用指令
```bash
npm run dev          # 開發模式
npm run build        # 建置生產版本
npm run start        # 啟動生產伺服器
npm run lint         # ESLint 檢查
npm run lint:fix     # 自動修復 ESLint 問題
npm run type-check   # TypeScript 型別檢查
npm run test         # 執行測試
npm run format       # Prettier 格式化
npm run analyze      # Bundle 分析
npm run clean        # 清理建置檔案
```

## 📋 使用流程

### 基本操作流程
1. **系統登入** → 身份驗證 → 進入儀表板
2. **資料建立** → 新增客戶 → 建立KOL檔案
3. **報價製作** → 選擇客戶 → 新增項目 → 設定價格
4. **文件處理** → 檢視預覽 → 上傳附件 → 匯出PDF
5. **狀態追蹤** → 更新進度 → 分析報表

### 權限說明
- **Admin**: 完整系統存取、用戶管理、系統設定
- **Member**: 基本報價單操作、客戶檢視、個人資料管理

### PDF匯出特色
- 自動添加公司浮水印
- 保持網頁排版一致性
- 支援中文字體渲染
- 檔案大小優化

## 🤝 貢獻指南

本專案歡迎貢獻！請遵循以下流程：

1. Fork 本專案
2. 建立功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交變更 (`git commit -m 'Add amazing feature'`)
4. 推送分支 (`git push origin feature/amazing-feature`)
5. 建立 Pull Request

### 編碼規範
- 使用 TypeScript 嚴格模式
- 遵循 ESLint 規則
- 使用 Prettier 格式化
- 變數和函式使用英文命名
- 註解使用繁體中文
- 提交訊息使用英文

## 📄 授權

本專案採用 MIT 授權條款 - 詳見 [LICENSE](LICENSE) 檔案

---

**最後更新**: 2025年8月2日  
**專案版本**: v1.0.0  
**技術支援**: 完整功能實作，建議進行進階優化

*本README反映專案當前完整功能狀態*