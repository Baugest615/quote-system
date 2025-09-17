# 報價管理系統 (Quotation Management System)

[![Next.js](https://img.shields.io/badge/Next.js-15.4.5-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9.2-blue)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Latest-green)](https://supabase.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4.17-38B2AC)](https://tailwindcss.com/)

現代化的企業級報價管理系統，支援客戶管理、KOL管理、報價單生成、請款流程等完整業務功能。使用 Next.js 15 (App Router) 和 Supabase 建構的全端應用程式。

🚀 專案概述
本系統是一個完整的業務報價管理平台，專為需要管理多種客戶、KOL（意見領袖）合作以及生成專業報價單的企業設計。系統採用現代化的技術架構，提供流暢的使用者體驗和強大的功能支援。

🌟 主要功能特色

🏢 客戶管理: 完整的客戶資料管理，包含聯絡資訊、發票資料、銀行資訊
👥 KOL管理: KOL資料庫管理，包含社群連結、服務類型、價格設定
📋 報價單管理: 動態報價單建立、編輯、檢視與PDF匯出
💰 請款流程管理: 完整的請款申請、審核、確認流程
🔐 權限管理: 基於角色的存取控制（Admin/Editor/Member）
📊 報表分析: 業務統計、營收分析、趨勢圖表
📁 檔案管理: 支援附件上傳與管理（含浮水印PDF匯出）
🎨 響應式設計: 支援桌面與行動裝置

🏗️ 技術架構
前端技術堆疊

Next.js 15.4.5 (App Router) - React 全端框架
TypeScript 5.9.2 - 型別安全與程式碼品質保證
Tailwind CSS 3.4.17 - 原子化CSS框架
Shadcn/ui - 現代化UI組件庫
React Hook Form - 高效能表單管理
Zod - TypeScript優先的資料驗證
Lucide React 0.303.0 - 現代化圖標庫
Framer Motion 10.16.16 - 動畫效果庫

後端與資料庫

Supabase 2.39.0 - 開源Firebase替代方案

PostgreSQL 資料庫
即時訂閱功能
身份驗證系統
檔案儲存服務


Row Level Security (RLS) - 資料安全保護

PDF與檔案處理

jsPDF 3.0.1 - 高品質PDF生成
jsPDF-AutoTable 5.0.2 - PDF表格生成
html2canvas 1.4.1 - HTML轉圖像（含浮水印功能）
pdf-lib 1.17.1 - 進階PDF操作

開發工具

ESLint 8.56.0 & Prettier 3.1.1 - 程式碼品質與格式化
Jest 29.7.0 - 單元測試框架
Sonner 2.0.6 - Toast通知系統

📁 完整專案檔案結構
quotation-management-system/
├── 📄 配置檔案
│   ├── .gitignore                 # Git忽略檔案設定
│   ├── .eslintrc.json            # ESLint設定
│   ├── components.json           # Shadcn/ui設定
│   ├── declarations.d.ts         # TypeScript聲明檔案
│   ├── middleware.ts             # Next.js中介軟體（權限控制）
│   ├── middleware.ts.backup      # 中介軟體備份檔案
│   ├── next.config.js            # Next.js設定
│   ├── next-env.d.ts            # Next.js TypeScript定義
│   ├── package.json              # 專案依賴與腳本
│   ├── package-lock.json         # 依賴版本鎖定檔案
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
    │       ├── 📁 pending-payments/    # 🆕 待請款管理
    │       │   └── page.tsx            # 待請款項目管理頁面
    │       │
    │       ├── 📁 payment-requests/    # 🆕 請款申請
    │       │   └── page.tsx            # 請款申請審核頁面
    │       │
    │       ├── 📁 confirmed-payments/  # 🆕 已確認請款清單
    │       │   └── page.tsx            # 已確認請款清單管理
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
    │   │   ├── label.tsx         # 標籤組件
    │   │   ├── modal.tsx         # 對話框組件
    │   │   ├── textarea.tsx      # 文字區域組件
    │   │   └── ...               # 其他UI組件
    │   │
    │   ├── 📁 dashboard/         # 儀表板組件
    │   │   └── Sidebar.tsx       # 側邊欄導覽（含請款功能選單）
    │   │
    │   ├── 📁 clients/           # 客戶相關組件
    │   │   └── ClientModal.tsx   # 客戶新增/編輯對話框
    │   │
    │   ├── 📁 kols/              # KOL相關組件
    │   │   └── KolModal.tsx      # KOL新增/編輯對話框
    │   │
    │   ├── 📁 quotes/            # 報價單相關組件
    │   │   └── FileModal.tsx     # 報價單檔案管理對話框
    │   │
    │   ├── 📁 pending-payments/  # 🆕 待請款組件
    │   │   └── PendingPaymentFileModal.tsx # 請款檔案管理對話框
    │   │
    │   ├── 📁 pdf/               # PDF相關組件
    │   │   └── SealStampManager.tsx # 印章/浮水印管理器
    │   │
    │   └── 📁 settings/          # 設定相關組件
    │       └── SettingsCard.tsx  # 設定卡片組件
    │
    ├── 📁 lib/                   # 工具函式庫
    │   ├── 📁 supabase/          # Supabase相關
    │   │   └── client.ts         # Supabase客戶端設定
    │   │
    │   ├── 📁 pdf/               # PDF生成相關
    │   │   └── enhanced-pdf-generator.ts # 增強型PDF生成器
    │   │
    │   └── utils.ts              # 通用工具函式
    │
    └── 📁 types/                 # TypeScript類型定義
        ├── database.types.ts     # 資料庫類型定義
        └── custom.types.ts       # 自訂類型定義
🗄️ 資料庫架構
主要資料表
users (使用者資料表)

id (UUID, Primary Key)
email (電子郵件，唯一)
role ('Admin' | 'Editor' | 'Member')
created_at (建立時間)
updated_at (更新時間)

clients (客戶資料表)

id (UUID, Primary Key)
name (客戶名稱)
title (客戶抬頭)
unified_number (統一編號)
contact_person (聯絡人)
phone (電話)
address (地址)
bank_info (銀行資訊，JSON)

kols (KOL資料表)

id (UUID, Primary Key)
name (KOL名稱/藝名)
real_name (真實姓名)
type_id (外鍵 → kol_types)
social_links (社群連結，JSON)
bank_info (銀行資訊，JSON)

quotations (報價單資料表)

id (UUID, Primary Key)
client_id (外鍵 → clients)
project_name (專案名稱)
status ('草稿' | '待簽約' | '已簽約' | '已歸檔')
subtotal (小計)
discount (折扣)
tax (稅額)
grand_total_taxed (含稅總額)
attachments (附件，JSON陣列)
remark (備註)

quotation_items (報價單項目資料表)

id (UUID, Primary Key)
quotation_id (外鍵 → quotations)
kol_id (外鍵 → kols)
service (服務內容)
quantity (數量)
price (單價)
category_id (外鍵 → quote_categories)

🆕 payment_requests (請款申請資料表)

id (UUID, Primary Key)
quotation_item_id (外鍵 → quotation_items)
request_date (申請日期)
verification_status ('pending' | 'approved' | 'rejected' | 'confirmed')
merge_type ('company' | 'account' | null)
merge_group_id (合併群組ID)
is_merge_leader (是否為合併領導項目)
merge_color (合併顏色標識)
attachment_file_path (附件檔案路徑)
invoice_number (發票號碼)
approved_by (審核者)
rejection_reason (駁回原因)

🆕 payment_confirmations (請款確認主表)

id (UUID, Primary Key)
confirmation_date (確認日期)
total_amount (總金額)
total_items (項目總數)
created_by (建立者)

🆕 payment_confirmation_items (請款確認項目關聯表)

id (UUID, Primary Key)
payment_confirmation_id (外鍵 → payment_confirmations)
payment_request_id (外鍵 → payment_requests)
amount_at_confirmation (確認時金額)
kol_name_at_confirmation (確認時KOL名稱)
project_name_at_confirmation (確認時專案名稱)
service_at_confirmation (確認時服務內容)

輔助資料表

kol_types - KOL類型
service_types - 服務類型
quote_categories - 報價單類別
kol_services - KOL服務價格關聯表

🚦 當前專案狀態
✅ 已完成核心功能
身份驗證與權限

✅ 完整的使用者身份驗證系統
✅ 基於角色的權限控制 (Admin/Editor/Member)
✅ Middleware 路由保護
✅ useAuthGuard Hook 頁面級保護

資料管理

✅ 客戶資料CRUD操作（含搜尋功能）
✅ KOL資料管理與服務價格設定
✅ 報價單建立、編輯、檢視功能
✅ 動態報價項目管理
✅ 自動稅額計算與折扣處理

🆕 請款管理系統

✅ 待請款管理 (pending-payments)

已簽約項目的請款前準備
支援合併請款功能（按公司/帳戶）
附件上傳與發票號碼管理
智能檔名處理與安全性檢查


✅ 請款申請審核 (payment-requests)

申請項目的審核與確認
批次操作與狀態管理
退回與駁回機制
完整的稽核追蹤


✅ 已確認請款清單 (confirmed-payments)

確認項目的彙總與管理
按帳戶分組顯示
清單退回與重新處理
CSV匯出功能



PDF與檔案功能

✅ 高品質PDF匯出（jsPDF實作）

動態載入避免SSR錯誤
自動浮水印添加
完整樣式處理
錯誤處理機制


✅ 檔案上傳管理（FileModal組件）

安全檔名處理（中文轉英文）
5MB檔案大小限制
多格式支援
狀態衝突避免機制



報表與分析

✅ 完整報表儀表板

營收統計與趨勢分析
客戶貢獻度排行
KOL績效分析
狀態分布圖表
CSV匯出功能



使用者介面

✅ 響應式UI設計
✅ 現代化組件庫 (Shadcn/ui)
✅ Toast通知系統 (Sonner)
✅ 載入狀態與錯誤處理
✅ 進階搜尋與篩選
✅ 排序與分頁功能

📈 系統亮點

完整請款工作流程: 從待請款 → 申請審核 → 確認清單的完整流程
智能合併功能: 支援按公司或帳戶合併請款，提高效率
PDF輸出專業級: 含浮水印的高品質PDF生成
完整權限系統: 多層級權限控制與路由保護
資料安全性: RLS + 中介軟體雙重保護
使用者體驗: 流暢的操作流程與即時回饋
技術架構現代化: Next.js 15 App Router + TypeScript + Supabase

🛠️ 開發指南
環境需求

Node.js 18.x 或更高版本
npm 8.0.0 或更高版本
Supabase 帳號與專案設定

安裝與啟動
bash# 複製專案
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
可用指令
bashnpm run dev            # 開發模式
npm run build          # 建置生產版本
npm run start          # 啟動生產伺服器
npm run lint           # ESLint 檢查
npm run lint:fix       # 自動修復 ESLint 問題
npm run type-check     # TypeScript 型別檢查
npm run test           # 執行測試
npm run test:watch     # 監視模式執行測試
npm run test:coverage  # 執行測試覆蓋率
npm run format         # Prettier 格式化
npm run format:check   # 檢查格式化
npm run analyze        # Bundle 分析
npm run clean          # 清理建置檔案
npm run db:types       # 生成資料庫型別定義
📋 使用流程
基本操作流程

系統登入 → 身份驗證 → 進入儀表板
資料建立 → 新增客戶 → 建立KOL檔案
報價製作 → 選擇客戶 → 新增項目 → 設定價格
合約簽訂 → 更新狀態為「已簽約」
請款流程 → 待請款管理 → 申請審核 → 確認付款
文件處理 → 檢視預覽 → 上傳附件 → 匯出PDF
報表分析 → 檢視統計 → 匯出數據

🆕 請款流程詳解

待請款準備：

系統自動顯示「已簽約」狀態的報價項目
上傳相關附件或填入發票號碼
選擇合併方式（按公司或帳戶）
提交請款申請


申請審核：

管理員審核提交的請款申請
可批次通過或個別處理
駁回時需填寫駁回原因
確認後生成請款清單


清單管理：

檢視已確認的請款清單
按帳戶分組顯示項目
可匯出為CSV格式
支援清單退回重新處理



🤝 貢獻指南
本專案歡迎貢獻！請遵循以下流程：

Fork 本專案
建立功能分支 (git checkout -b feature/amazing-feature)
提交變更 (git commit -m 'Add amazing feature')
推送分支 (git push origin feature/amazing-feature)
建立 Pull Request

編碼規範

使用 TypeScript 嚴格模式
遵循 ESLint 規則
使用 Prettier 格式化
變數和函式使用英文命名
註解使用繁體中文
提交訊息使用英文

📊 專案統計

專案版本: v1.2.1
程式碼行數: ~20,000+ lines
組件數量: 60+ components
API端點: 35+ endpoints
資料表: 15+ tables
功能模組: 10+ modules

🚀 部署建議
生產環境部署

建議使用 Vercel 或 Netlify
設定正確的環境變數
啟用 Supabase RLS 政策
配置 CDN 加速靜態資源

效能監控

建議整合 Sentry 錯誤追蹤
使用 Google Analytics 分析使用者行為
設定 Uptime 監控服務

🔮 進階優化建議
1. 效能增強

全域狀態管理:

引入 Zustand 或 Redux Toolkit
實作客戶、KOL資料本地快取
背景資料同步機制
減少重複API請求


載入優化:

實作報價單列表虛擬捲動
圖片延遲載入 (Lazy Loading)
組件程式碼分割 (Code Splitting)
React Query 實作資料快取



2. 功能擴展

進階報表視覺化:

整合 Chart.js 或 Recharts
互動式圖表儀表板
自訂報表範本系統
即時資料更新與推播


通知與自動化:

Email自動發送系統 (SendGrid/Resend)
到期提醒通知
Webhook整合第三方服務
批次處理排程任務


範本與工作流程:

報價單範本管理
可自訂的審批流程
批次操作功能增強
歷史版本控制



3. 使用者體驗優化

進階互動功能:

拖拽排序功能 (react-beautiful-dnd)
鍵盤快捷鍵支援
批次選擇操作
即時協作功能 (使用 Supabase Realtime)


搜尋與篩選增強:

全文搜尋功能 (使用 PostgreSQL Full Text Search)
進階篩選條件組合
搜尋結果高亮顯示
儲存常用搜尋條件



4. 技術架構升級

程式碼品質提升:

單元測試覆蓋率提升至80%+
E2E測試實作 (Playwright/Cypress)
錯誤邊界組件 (Error Boundaries)
效能監控儀表板 (Sentry)


API抽象化:

統一資料存取層 (Repository Pattern)
自訂Hooks重構
快取策略優化
GraphQL整合考量



5. 安全性強化

稽核與監控:

完整操作日誌記錄
異常行為偵測
即時安全監控
效能瓶頸分析


資料保護:

敏感資料加密
自動備份與復原機制
GDPR合規功能
資料匿名化選項



💡 快速提示
檔案上傳注意事項

中文檔名會自動轉換為英文，但保留原始檔名顯示
單一檔案大小限制：5MB
待請款項目最多可上傳 5 個檔案
支援格式：PDF, Word, Excel, 圖片等

請款合併規則

按公司合併：同一客戶的所有項目合併為一筆
按帳戶合併：同一KOL的所有項目合併為一筆
合併後的項目會以不同顏色標示
合併領導項目負責管理附件和發票

PDF匯出特色

自動添加公司浮水印
保持網頁排版一致性
支援中文字體渲染
檔案大小優化
動態載入避免SSR問題

📄 授權
本專案採用 MIT 授權條款 - 詳見 LICENSE 檔案
📞 技術支援
如有技術問題，請透過以下方式聯繫：

建立 GitHub Issue
發送郵件至專案維護者


最後更新: 2025年9月
專案版本: v1.2.1
技術狀態: ✅ 生產就緒，功能完整
下一版本規劃: 效能優化、進階報表、自動化流程、AI輔助功能

本README反映專案當前完整功能狀態，包含最新的請款管理系統與所有功能模組