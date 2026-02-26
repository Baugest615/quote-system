// src/app/dashboard/quotes/view/[id]/page.tsx - 修正後的完整版本
'use client'

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Database } from '@/types/database.types';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Edit, Trash2, Printer, ArrowLeft, Stamp, UserCheck } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { SealStampConfig, SealStampManager } from '@/components/pdf/SealStampManager';
import { ElectronicSealManager } from '@/components/pdf/ElectronicSealManager';
import { QuotePrintableTable } from '@/components/pdf/QuotePrintableTable';
import { usePermission } from '@/lib/permissions';
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';
import { useQuotation, useDeleteQuotation } from '@/hooks/useQuotations';
import { useConfirm } from '@/components/ui/ConfirmDialog';

type Quotation = Database['public']['Tables']['quotations']['Row'];
type QuotationItem = Database['public']['Tables']['quotation_items']['Row'];
type Client = Database['public']['Tables']['clients']['Row'];
type Kol = Database['public']['Tables']['kols']['Row'];

type FullQuotation = Quotation & {
  clients: Client | null;
  quotation_items: (QuotationItem & {
    kols: Pick<Kol, 'name'> | null;
  })[];
};

const companyBankInfo = {
  bankName: '國泰世華銀行(013)',
  branchName: '文山分行',
  accountName: '安安娛樂有限公司',
  accountNumber: '103-03-500480-1',
};

const defaultSealStampConfig: SealStampConfig = {
  enabled: false,
  stampImage: '/seals/company-seal.png',
  position: 'right',
  offsetX: -0.3,
  offsetY: 0,
  size: 1.2,
  opacity: 0.7,
  rotation: 15,
  overlayPages: true,
};

const defaultElectronicSealConfig: SealStampConfig = {
  enabled: false,
  stampImage: '/seals/approved-seal.png',
  position: 'left',
  offsetX: 0,
  offsetY: 0,
  size: 1.0,
  opacity: 0.9,
  rotation: 0,
  overlayPages: false,
};

export default function ViewQuotePage() {
  const confirm = useConfirm();
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { userId, hasRole } = usePermission();
  const { data: quote, isLoading: loading } = useQuotation(id);
  const deleteQuotation = useDeleteQuotation();
  const [isProcessing, setIsProcessing] = useState(false);
  const [showStampSettings, setShowStampSettings] = useState(false);
  const [sealStampConfig, setSealStampConfig] = useState<SealStampConfig>(defaultSealStampConfig);
  const [showElectronicSealSettings, setShowElectronicSealSettings] = useState(false);
  const [electronicSealConfig, setElectronicSealConfig] = useState<SealStampConfig>(defaultElectronicSealConfig);

  // 🔧 簡化的表格合併邏輯 - 正確計算 rowSpan
  const processTableData = (items: (QuotationItem & { kols: Pick<Kol, 'name'> | null })[]): Array<{
    item: QuotationItem & { kols: Pick<Kol, 'name'> | null };
    categoryRowSpan: number;
    kolRowSpan: number;
    showCategory: boolean;
    showKol: boolean;
  }> => {
    // 先排序 - 按分類、KOL名稱排序，確保項目連續
    const sortedItems = [...items].sort((a, b) => {
      const categoryA = a.category || 'N/A';
      const categoryB = b.category || 'N/A';
      if (categoryA !== categoryB) return categoryA.localeCompare(categoryB);

      const kolA = a.kols?.name || 'N/A';
      const kolB = b.kols?.name || 'N/A';
      return kolA.localeCompare(kolB);
    });

    // 第一遍：計算每個分類和 KOL 的項目數量
    const categoryCount = new Map<string, number>();
    const kolCount = new Map<string, number>(); // key: "category|kol"

    sortedItems.forEach(item => {
      const category = item.category || 'N/A';
      const kol = item.kols?.name || 'N/A';
      const kolKey = `${category}|${kol}`;

      categoryCount.set(category, (categoryCount.get(category) || 0) + 1);
      kolCount.set(kolKey, (kolCount.get(kolKey) || 0) + 1);
    });

    // 第二遍：生成帶有 rowSpan 資訊的項目
    const seenCategories = new Set<string>();
    const seenKols = new Set<string>(); // key: "category|kol"

    return sortedItems.map(item => {
      const category = item.category || 'N/A';
      const kol = item.kols?.name || 'N/A';
      const kolKey = `${category}|${kol}`;

      const isFirstInCategory = !seenCategories.has(category);
      const isFirstInKol = !seenKols.has(kolKey);

      if (isFirstInCategory) seenCategories.add(category);
      if (isFirstInKol) seenKols.add(kolKey);

      return {
        item,
        categoryRowSpan: isFirstInCategory ? categoryCount.get(category)! : 0,
        kolRowSpan: isFirstInKol ? kolCount.get(kolKey)! : 0,
        showCategory: isFirstInCategory,
        showKol: isFirstInKol,
      };
    });
  };

  useEffect(() => {
    const savedSealConfig = localStorage.getItem(`sealStampConfig_${id}`);
    if (savedSealConfig) {
      try {
        setSealStampConfig(JSON.parse(savedSealConfig));
      } catch (e) { console.warn('載入印章設定失敗') }
    }
    const savedElectronicConfig = localStorage.getItem(`electronicSealConfig_${id}`);
    if (savedElectronicConfig) {
      try {
        setElectronicSealConfig(JSON.parse(savedElectronicConfig));
      } catch (e) { console.warn('載入電子印章設定失敗') }
    }
  }, [id]);

  const handleSealStampConfigChange = useCallback((config: SealStampConfig) => {
    setSealStampConfig(config);
    localStorage.setItem(`sealStampConfig_${id}`, JSON.stringify(config));
  }, [id]);

  const handleElectronicSealConfigChange = useCallback((config: SealStampConfig) => {
    setElectronicSealConfig(config);
    localStorage.setItem(`electronicSealConfig_${id}`, JSON.stringify(config));
  }, [id]);

  const handleDelete = async () => {
    const ok = await confirm({
      title: '確認刪除',
      description: '確定要刪除這份報價單嗎？',
      confirmLabel: '刪除',
      variant: 'destructive',
    });
    if (!ok) return;
    setIsProcessing(true);
    deleteQuotation.mutate(id, {
      onSuccess: () => {
        router.push('/dashboard/quotes');
      },
      onSettled: () => {
        setIsProcessing(false);
      },
    });
  };

  const handleExportPDF = async () => {
    if (!quote || isProcessing) return;
    setIsProcessing(true);

    try {
      // 🔧 使用 Puppeteer API 生成 PDF（完美渲染 rowSpan）
      // 🔧 使用 HTML Injection 方案 - 前端獲取 HTML，後端 Puppeteer 渲染
      // 1. 獲取列印頁面的 HTML (包含使用者 Cookie，所以無需後端重新驗證)
      const printUrl = `/print/quote/${id}?seal=${electronicSealConfig.enabled}`;
      const htmlResponse = await fetch(printUrl, {
        credentials: 'include' // 確保發送所有 cookie
      });

      if (!htmlResponse.ok) {
        throw new Error(`無法讀取報價單列印頁面 (${htmlResponse.status} ${htmlResponse.statusText})`);
      }

      let html = await htmlResponse.text();

      // 檢查 HTML 是否有效
      if (!html.includes('printable-quote')) {
        console.error('無效的列印頁面 HTML:', html.substring(0, 500) + '...');
        // 嘗試解析它是什麼頁面
        const titleMatch = html.match(/<title>(.*?)<\/title>/);
        const pageTitle = titleMatch ? titleMatch[1] : 'Unknown Page';
        throw new Error(`列印頁面內容無效 (標題: ${pageTitle})，請檢查是否已登入或權限不足。`);
      }

      // 2. 清理 HTML：移除所有 script 標籤，防止 Puppeteer 中的 hydration錯誤
      // Next.js 的 hydration 腳本可能會在 Puppeteer 中失敗並觸發錯誤頁面
      html = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gmi, "");
      html = html.replace(/<link\b[^>]*as="script"[^>]*>/gmi, "");

      // 3. 將相對路徑轉換為絕對路徑 (確保 Puppeteer 能加載圖片和樣式)
      const origin = window.location.origin;
      html = html
        .replace(/src="\//g, `src="${origin}/`)
        .replace(/href="\//g, `href="${origin}/`)
        .replace(/srcset="\//g, `srcset="${origin}/`);

      // 3. 替換電子用印圖片 (如果使用者有自定義)
      if (electronicSealConfig.enabled && electronicSealConfig.stampImage !== '/seals/approved-seal.png') {
        html = html.replace('/seals/approved-seal.png', electronicSealConfig.stampImage);
      }

      // 4. 準備騎縫章圖片 (轉換為 Base64)
      let sealStampBase64 = '';
      if (sealStampConfig.enabled) {
        try {
          const imageUrl = sealStampConfig.stampImage;
          let fetchUrl = imageUrl;

          // 處理相對路徑
          if (imageUrl.startsWith('/')) {
            fetchUrl = `${window.location.origin}${imageUrl}`;
          }

          const imageRes = await fetch(fetchUrl);
          const imageBlob = await imageRes.blob();

          sealStampBase64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(imageBlob);
          });

          console.log('騎縫章圖片已轉換為 Base64');
        } catch (e) {
          console.error('轉換騎縫章圖片失敗:', e);
          // 失敗時不傳送圖片，避免後端報錯，或可選擇 alert 提示
        }
      }

      // 5. 發送 HTML 到後端生成 API
      const response = await fetch('/api/pdf/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteId: id,
          html: html, // 傳送處理過的 HTML
          filename: `報價單-${quote.clients?.name || '客戶'}-${quote.project_name}.pdf`,
          sealStampEnabled: sealStampConfig.enabled,
          sealStampImage: sealStampBase64, // 傳送 Base64
          electronicSealEnabled: electronicSealConfig.enabled,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'PDF 生成失敗');
      }

      // 下載 PDF
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `報價單-${quote.clients?.name || '客戶'}-${quote.project_name}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

    } catch (error: unknown) {
      console.error('PDF 匯出錯誤:', error);
      toast.error('PDF 生成失敗：' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setIsProcessing(false);
    }
  };

  const sealImageStyle: React.CSSProperties = {
    width: `${electronicSealConfig.size}in`,
    height: `${electronicSealConfig.size}in`,
    opacity: electronicSealConfig.opacity,
    transform: `translate(${electronicSealConfig.offsetX}in, ${electronicSealConfig.offsetY}in) rotate(${electronicSealConfig.rotation}deg)`,
  };

  if (loading) return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Skeleton className="h-9 w-20 rounded-md" />
        <Skeleton className="h-8 w-64" />
      </div>
      <SkeletonCard lines={5} />
      <SkeletonCard lines={8} />
    </div>
  );
  if (!quote) return <div>找不到報價單資料。</div>;

  const termsParts = quote.terms ? quote.terms.split('保密協議：') : [''];
  const contractAgreement = termsParts[0].replace('合約約定：', '').trim();
  const confidentialityAgreement = termsParts.length > 1 ? termsParts[1].trim() : '';

  // 計算優惠價情況下的稅金和總額
  let discountedTax = 0;
  let discountedGrandTotal = 0;
  const hasDiscountPrice = quote.has_discount && typeof quote.discounted_price === 'number';

  if (hasDiscountPrice) {
    discountedTax = Math.round(quote.discounted_price! * 0.05);
    discountedGrandTotal = quote.discounted_price! + discountedTax;
  }

  return (
    <div className="space-y-6">
      {/* 操作按鈕區域 */}
      <div className="flex justify-between items-center print:hidden">
        <div>
          <Link href="/dashboard/quotes" className="text-sm text-muted-foreground hover:text-primary flex items-center mb-2">
            <ArrowLeft className="h-4 w-4 mr-1" /> 返回列表
          </Link>
          <h1 className="text-3xl font-bold">檢視報價單</h1>
        </div>
        <div className="flex space-x-2">
          {hasRole('Editor') && (
            <>
              <Button
                variant="outline"
                disabled={isProcessing}
                onClick={() => setShowElectronicSealSettings(true)}
                className={electronicSealConfig.enabled ? 'border-success text-success' : ''}
              >
                <UserCheck className="mr-2 h-4 w-4" /> 電子用印
              </Button>
              <Button
                variant="outline"
                disabled={isProcessing}
                onClick={() => setShowStampSettings(true)}
                className={sealStampConfig.enabled ? 'border-primary text-primary' : ''}
              >
                <Stamp className="mr-2 h-4 w-4" /> 騎縫章設定
              </Button>
            </>
          )}
          {(hasRole('Editor') || quote?.created_by == null || quote?.created_by === userId) && (
            <Link href={`/dashboard/quotes/edit/${id}`}>
              <Button variant="outline" disabled={isProcessing}><Edit className="mr-2 h-4 w-4" /> 編輯</Button>
            </Link>
          )}
          <Button onClick={handleExportPDF} disabled={isProcessing}>
            <Printer className="mr-2 h-4 w-4" /> {isProcessing ? '處理中...' : '匯出 PDF'}
          </Button>
          {(hasRole('Editor') || (quote?.created_by != null && quote?.created_by === userId)) && (
            <Button variant="destructive" onClick={handleDelete} disabled={isProcessing}>
              <Trash2 className="mr-2 h-4 w-4" /> 刪除
            </Button>
          )}
        </div>
      </div>

      <Modal isOpen={showElectronicSealSettings} onClose={() => setShowElectronicSealSettings(false)} title="電子用印設定" maxWidth="sm:max-w-2xl">
        <ElectronicSealManager config={electronicSealConfig} onChange={handleElectronicSealConfigChange} />
      </Modal>

      <Modal isOpen={showStampSettings} onClose={() => setShowStampSettings(false)} title="騎縫章設定" maxWidth="sm:max-w-2xl">
        <SealStampManager config={sealStampConfig} onChange={handleSealStampConfigChange} />
      </Modal>

      <div id="printable-quote" className="relative bg-card p-8 md:p-12 rounded-lg shadow-md border text-[13px] leading-relaxed">
        <img src="/watermark-an.png" alt="watermark" className="absolute inset-0 w-full h-full opacity-5 object-contain z-0 pdf-watermark" />
        <div className="text-center mb-4 pb-2 border-b">
          <img src="/logo.png" alt="安安娛樂 LOGO" className="h-10 w-auto" />
          <h1 className="text-xl font-bold">安安娛樂有限公司委刊專案契約書</h1>
        </div>

        <table className="w-full text-sm mb-8 border border-border">
          <tbody>
            <tr className="border-b">
              <td className="p-2 font-bold bg-secondary whitespace-nowrap w-[120px]">專案名稱：</td>
              <td className="p-2 col-span-3" colSpan={3}>
                <div className="flex justify-between items-center">
                  <span>{quote.project_name}</span>
                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                    開立時間：{quote.created_at ? new Date(quote.created_at).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
              </td>
            </tr>
            <tr className="border-b">
              <td className="p-2 font-bold bg-secondary whitespace-nowrap w-[120px]">委刊客戶：</td>
              <td className="p-2">{quote.clients?.name || 'N/A'}</td>
              <td className="p-2 font-bold bg-secondary whitespace-nowrap w-[120px]">客戶聯絡人：</td>
              <td className="p-2">{quote.client_contact}</td>
            </tr>
            <tr className="border-b">
              <td className="p-2 font-bold bg-secondary whitespace-nowrap w-[120px]">統一編號：</td>
              <td className="p-2">{quote.clients?.tin || 'N/A'}</td>
              <td className="p-2 font-bold bg-secondary whitespace-nowrap w-[120px]">聯絡人電話：</td>
              <td className="p-2">{quote.contact_phone || quote.clients?.phone || 'N/A'}</td>
            </tr>
            <tr className="border-b">
              <td className="p-2 font-bold bg-secondary whitespace-nowrap w-[120px]">地址：</td>
              <td className="p-2">{quote.clients?.address || 'N/A'}</td>
              <td className="p-2 font-bold bg-secondary whitespace-nowrap w-[120px]">電子郵件：</td>
              <td className="p-2">{quote.contact_email || quote.clients?.email || 'N/A'}</td>
            </tr>
          </tbody>
        </table>

        <table className="w-full border border-border mb-6 text-xs">
          <thead>
            <tr className="bg-secondary">
              <th className="border p-2 text-center">分類</th>
              <th className="border p-2 text-center">KOL/服務</th>
              <th className="border p-2 text-center">執行內容</th>
              <th className="border p-2 text-center">單價</th>
              <th className="border p-2 text-center">數量</th>
              <th className="border p-2 text-center">合計</th>
            </tr>
          </thead>
          <tbody>
            {/* 🔧 網頁預覽使用 rowSpan（PDF 用 @react-pdf/renderer 獨立渲染） */}
            {processTableData(quote.quotation_items).map((row, index) => {
              const itemTotal = (row.item.price || 0) * (row.item.quantity || 1);
              const showCategory = row.showCategory && row.categoryRowSpan > 0;
              const showKol = row.showKol && row.kolRowSpan > 0;

              return (
                <tr key={index} className="break-inside-avoid">
                  {/* 分類欄位 - 使用 rowSpan 合併 */}
                  {showCategory && (
                    <td
                      className="border p-2 text-center align-middle font-medium bg-secondary"
                      rowSpan={row.categoryRowSpan}
                    >
                      {row.item.category || 'N/A'}
                    </td>
                  )}

                  {/* KOL欄位 - 使用 rowSpan 合併 */}
                  {showKol && (
                    <td
                      className="border p-2 text-center align-middle font-medium bg-info/10 text-info"
                      rowSpan={row.kolRowSpan}
                    >
                      {row.item.kols?.name || 'N/A'}
                    </td>
                  )}

                  {/* 服務內容 */}
                  <td className="border p-2 text-center">{row.item.service}</td>

                  {/* 單價 */}
                  <td className="border p-2 text-right">${row.item.price?.toLocaleString() || '0'}</td>

                  {/* 數量 */}
                  <td className="border p-2 text-center">{row.item.quantity || 1}</td>

                  {/* 合計 */}
                  <td className="border p-2 text-right font-semibold">${itemTotal.toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>



        <table className="w-full mb-8 break-inside-avoid">
          <tbody>
            <tr>
              <td className="w-2/3 pr-8 align-top">
                <div className="border p-4 h-full">
                  <h3 className="text-sm font-bold mb-3 bg-secondary p-2 -m-4 mb-3 border-b">【廣告費之支付約定】</h3>
                  <div className="text-[10px] leading-normal space-y-2">
                    <p><strong>1.</strong> 本次廣告行銷費用由委託公司負責繳付，所有費用代收百分之五的營業稅。銀⾏⼿續費由⽀付⽅負擔。</p>
                    <p><strong>2.</strong> 本公司應於執行到期日開立當月份發票予委刊客戶，委刊客戶應於收到發票時，按發票日期月結30日依發票所載之金額匯入本公司指定帳戶如下。</p>
                    <p><strong>3.</strong> 所有報酬及因本服務契約書產⽣之相關費⽤均以本服務契約書內載明之幣值及約定付款⽇付款。</p>
                    <div className="mt-3 bg-secondary p-3 rounded border text-xs">
                      <table className="w-full">
                        <tbody>
                          <tr>
                            <td className="py-1 pr-4"><strong>銀行名稱：</strong>{companyBankInfo.bankName}</td>
                            <td><strong>銀行帳號：</strong>{companyBankInfo.accountNumber}</td>
                          </tr>
                          <tr>
                            <td className="py-1 pr-4"><strong>分行名稱：</strong>{companyBankInfo.branchName}</td>
                            <td><strong>帳戶名稱：</strong>{companyBankInfo.accountName}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </td>
              <td className="w-1/3 align-top">
                <table className="w-full border text-sm h-full">
                  <tbody>
                    {hasDiscountPrice ? (
                      <>
                        <tr>
                          <td className="border p-2 font-bold bg-secondary">未稅小計</td>
                          <td className="border p-2 text-right text-muted-foreground relative">

                            ${quote.subtotal_untaxed?.toLocaleString() || '0'}

                          </td>
                        </tr>
                        <tr>
                          <td className="border p-2 font-bold bg-info/10 text-info">未稅優惠</td>
                          <td className="border p-2 text-right font-bold text-info">
                            ${quote.discounted_price?.toLocaleString() || '0'}
                          </td>
                        </tr>
                        <tr>
                          <td className="border p-2 font-bold bg-secondary">營業稅 (5%)</td>
                          <td className="border p-2 text-right">
                            ${discountedTax.toLocaleString()}
                          </td>
                        </tr>
                        <tr>
                          <td className="border p-2 font-bold bg-destructive/10 text-destructive">含稅總計</td>
                          <td className="border p-2 text-right font-bold text-destructive">
                            ${discountedGrandTotal.toLocaleString()}
                          </td>
                        </tr>
                      </>
                    ) : (
                      <>
                        <tr>
                          <td className="border p-2 font-bold bg-secondary">未稅小計</td>
                          <td className="border p-2 text-right">
                            ${quote.subtotal_untaxed?.toLocaleString() || '0'}
                          </td>
                        </tr>
                        <tr>
                          <td className="border p-2 font-bold bg-secondary">營業稅 (5%)</td>
                          <td className="border p-2 text-right">
                            ${quote.tax?.toLocaleString() || '0'}
                          </td>
                        </tr>
                        <tr>
                          <td className="border p-2 font-bold bg-destructive/10 text-destructive">含稅總計</td>
                          <td className="border p-2 text-right font-bold text-destructive">
                            ${quote.grand_total_taxed?.toLocaleString() || '0'}
                          </td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>

        <div className="text-xs space-y-4 whitespace-pre-wrap">
          <div className="border p-4 break-inside-avoid">
            <h3 className="text-sm font-bold mb-3 bg-secondary p-2 -m-4 mb-3 border-b">【合約約定】</h3>
            <p className="text-[10px] leading-normal">{contractAgreement}</p>
          </div>
          <div className="border p-4 break-inside-avoid">
            <h3 className="text-sm font-bold mb-3 bg-secondary p-2 -m-4 mb-3 border-b">【保密協議】</h3>
            <p className="text-[10px] leading-normal">{confidentialityAgreement}</p>
          </div>
          {quote.remarks && (
            <div className="border p-4 break-inside-avoid">
              <h3 className="text-sm font-bold mb-3 bg-secondary p-2 -m-4 mb-3 border-b">【補充協議】</h3>
              <p className="text-[10px] leading-normal">{quote.remarks}</p>
            </div>
          )}
        </div>

        <div className="mt-8 flex justify-between items-start gap-8 break-inside-avoid">
          <div className="text-center w-[48%]">
            <div className="signature-box">
              <p className="text-sm font-bold">安安娛樂簽章</p>
              {electronicSealConfig.enabled && (
                <div className="seal-image-container">
                  <img src={electronicSealConfig.stampImage} alt="Electronic Seal" style={sealImageStyle} />
                </div>
              )}
            </div>
          </div>
          <div className="text-center w-[48%]">
            <div className="signature-box">
              <p className="text-sm font-bold">委刊方簽章</p>
            </div>
          </div>
        </div>
      </div>

      {/* 🔧 隱藏的 PDF 專用區塊 - 供 html2pdf.js 使用（無 rowSpan 避免跑版） */}
      <div
        id="pdf-printable"
        className="fixed -left-[9999px] top-0 bg-card"
        style={{ width: '210mm', padding: '15mm' }}
      >
        <img src="/watermark-an.png" alt="watermark" className="absolute inset-0 w-full h-full opacity-5 object-contain z-0 pdf-watermark" />
        <div className="text-center mb-4 pb-2 border-b">
          <img src="/logo.png" alt="安安娛樂 LOGO" className="h-10 w-auto" />
          <h1 className="text-xl font-bold">安安娛樂有限公司委刊專案契約書</h1>
        </div>

        <table className="w-full text-sm mb-8 border border-border">
          <tbody>
            <tr className="border-b">
              <td className="p-2 font-bold bg-secondary whitespace-nowrap w-[120px]">專案名稱：</td>
              <td className="p-2" colSpan={3}>
                <div className="flex justify-between items-center">
                  <span>{quote.project_name}</span>
                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                    開立時間：{quote.created_at ? new Date(quote.created_at).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
              </td>
            </tr>
            <tr className="border-b">
              <td className="p-2 font-bold bg-secondary whitespace-nowrap w-[120px]">委刊客戶：</td>
              <td className="p-2">{quote.clients?.name || 'N/A'}</td>
              <td className="p-2 font-bold bg-secondary whitespace-nowrap w-[120px]">客戶聯絡人：</td>
              <td className="p-2">{quote.client_contact}</td>
            </tr>
            <tr className="border-b">
              <td className="p-2 font-bold bg-secondary whitespace-nowrap w-[120px]">統一編號：</td>
              <td className="p-2">{quote.clients?.tin || 'N/A'}</td>
              <td className="p-2 font-bold bg-secondary whitespace-nowrap w-[120px]">聯絡人電話：</td>
              <td className="p-2">{quote.contact_phone || quote.clients?.phone || 'N/A'}</td>
            </tr>
            <tr className="border-b">
              <td className="p-2 font-bold bg-secondary whitespace-nowrap w-[120px]">地址：</td>
              <td className="p-2">{quote.clients?.address || 'N/A'}</td>
              <td className="p-2 font-bold bg-secondary whitespace-nowrap w-[120px]">電子郵件：</td>
              <td className="p-2">{quote.contact_email || quote.clients?.email || 'N/A'}</td>
            </tr>
          </tbody>
        </table>

        {/* 使用無 rowSpan 的表格 */}
        <QuotePrintableTable items={quote.quotation_items} />

        {/* 金額匯總表 */}
        <table className="w-full mb-8 break-inside-avoid">
          <tbody>
            <tr>
              <td className="w-2/3 pr-8 align-top">
                <div className="border p-4 h-full">
                  <h3 className="text-sm font-bold mb-3 bg-secondary p-2 -m-4 mb-3 border-b">【廣告費之支付約定】</h3>
                  <div className="text-[10px] leading-normal space-y-2">
                    <p><strong>1.</strong> 本次廣告行銷費用由委託公司負責繳付，所有費用代收百分之五的營業稅。銀⾏⼿續費由⽀付⽅負擔。</p>
                    <p><strong>2.</strong> 本公司應於執行到期日開立當月份發票予委刊客戶，委刊客戶應於收到發票時，按發票日期月結30日依發票所載之金額匯入本公司指定帳戶如下。</p>
                    <p><strong>3.</strong> 所有報酬及因本服務契約書產⽣之相關費⽤均以本服務契約書內載明之幣值及約定付款⽇付款。</p>
                    <div className="mt-3 bg-secondary p-3 rounded border text-xs">
                      <p>銀行名稱：{companyBankInfo.bankName}　｜　銀行帳號：{companyBankInfo.accountNumber}</p>
                      <p>分行名稱：{companyBankInfo.branchName}　｜　帳戶名稱：{companyBankInfo.accountName}</p>
                    </div>
                  </div>
                </div>
              </td>
              <td className="w-1/3 align-top">
                <table className="w-full border border-border text-sm">
                  <tbody>
                    {hasDiscountPrice ? (
                      <>
                        <tr className="border-b"><td className="p-2 font-bold bg-secondary">未稅小計</td><td className="p-2 text-right line-through text-muted-foreground">${quote.subtotal_untaxed?.toLocaleString()}</td></tr>
                        <tr className="border-b bg-info/10"><td className="p-2 font-bold">未稅優惠</td><td className="p-2 text-right text-info font-bold">${quote.discounted_price?.toLocaleString()}</td></tr>
                        <tr className="border-b"><td className="p-2 font-bold bg-secondary">營業稅(5%)</td><td className="p-2 text-right">${discountedTax.toLocaleString()}</td></tr>
                        <tr className="bg-destructive/10"><td className="p-2 font-bold">含稅總計</td><td className="p-2 text-right text-destructive text-lg font-bold">${discountedGrandTotal.toLocaleString()}</td></tr>
                      </>
                    ) : (
                      <>
                        <tr className="border-b"><td className="p-2 font-bold bg-secondary">未稅小計</td><td className="p-2 text-right">${quote.subtotal_untaxed?.toLocaleString()}</td></tr>
                        <tr className="border-b"><td className="p-2 font-bold bg-secondary">營業稅(5%)</td><td className="p-2 text-right">${quote.tax?.toLocaleString()}</td></tr>
                        <tr className="bg-destructive/10"><td className="p-2 font-bold">含稅總計</td><td className="p-2 text-right text-destructive text-lg font-bold">${quote.grand_total_taxed?.toLocaleString()}</td></tr>
                      </>
                    )}
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>

        {/* 條款區塊 */}
        <div className="space-y-4 break-inside-avoid">
          {contractAgreement && (
            <div className="border p-4">
              <h3 className="text-sm font-bold mb-3 bg-secondary p-2 -m-4 mb-3 border-b">【合約約定】</h3>
              <p className="text-[10px] leading-normal whitespace-pre-wrap">{contractAgreement}</p>
            </div>
          )}
          {confidentialityAgreement && (
            <div className="border p-4">
              <h3 className="text-sm font-bold mb-3 bg-secondary p-2 -m-4 mb-3 border-b">【保密協議】</h3>
              <p className="text-[10px] leading-normal whitespace-pre-wrap">{confidentialityAgreement}</p>
            </div>
          )}
          {quote.remarks && (
            <div className="border p-4">
              <h3 className="text-sm font-bold mb-3 bg-secondary p-2 -m-4 mb-3 border-b">【補充協議】</h3>
              <p className="text-[10px] leading-normal">{quote.remarks}</p>
            </div>
          )}
        </div>

        {/* 簽章區 - PDF 版本 */}
        <div className="mt-8 flex justify-between items-start gap-8 break-inside-avoid">
          <div className="text-center w-[48%]">
            <div className="signature-box">
              <p className="text-sm font-bold">安安娛樂簽章</p>
              {electronicSealConfig.enabled && (
                <div className="seal-image-container">
                  <img src={electronicSealConfig.stampImage} alt="Electronic Seal" style={sealImageStyle} />
                </div>
              )}
            </div>
          </div>
          <div className="text-center w-[48%]">
            <div className="signature-box">
              <p className="text-sm font-bold">委刊方簽章</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}