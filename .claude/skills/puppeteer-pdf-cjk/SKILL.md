---
name: puppeteer-pdf-cjk
description: "Puppeteer PDF 生成與 CJK 字型跨平台配置。當修改 PDF 相關元件或 print 頁面時觸發。"
---

# Puppeteer PDF + CJK 字型配置

## 架構

```
src/app/api/pdf/generate/route.ts    # Puppeteer 渲染 API
src/app/print/quote/[id]/page.tsx    # 列印模板（故意淺色）
src/components/pdf/                   # PDF 相關元件
```

## CJK 字型策略（勿修改）

### 問題
Puppeteer headless 模式下系統字體不可靠：
- macOS 有 PingFang TC，但 Windows 沒有
- Windows 有 Microsoft JhengHei，但 headless 下不保證可用
- Linux（CI/CD）通常完全沒有 CJK 字型

### 解法：Web Font 優先
透過 Google Fonts CDN 載入 **Noto Sans TC** 作為主要 CJK 字型。

### 字型優先順序（勿變更）
```css
font-family: 'Noto Sans TC', 'Microsoft JhengHei', 'PingFang TC',
             'Hiragino Sans GB', 'WenQuanYi Micro Hei', sans-serif;
```

1. **Noto Sans TC**（Web Font）— 跨平台一致
2. **Microsoft JhengHei**（Windows fallback）
3. **PingFang TC**（macOS fallback）
4. 其餘 CJK fallback

## 關鍵規則

### 勿移除
- Google Fonts CDN 的 `<link>` 標籤
- `@import url()` Web Font 載入
- Noto Sans TC 作為首選字型

### 淺色模式
PDF/列印元件**故意使用淺色背景**（白底黑字），與主應用的深色模式不同。
**勿將深色模式套用到 `src/components/pdf/` 或 `src/app/print/`**。

### 跨平台驗證
修改 PDF 相關程式碼後，必須在目標環境**實際匯出 PDF** 驗證：
- 不能只看網頁預覽（瀏覽器會用系統字型補足）
- headless 模式的渲染結果可能與預覽完全不同
- 尤其注意：表格對齊、中文換行、數字寬度

### Puppeteer 配置注意
- 使用 `@sparticuz/chromium`（無頭 Chromium，適合 serverless）
- `puppeteer-core`（不含內建 Chromium，需外部提供）
- PDF 紙張大小、邊距在 `route.ts` 中設定
