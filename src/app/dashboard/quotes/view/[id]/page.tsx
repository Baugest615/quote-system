// src/app/dashboard/quotes/view/[id]/page.tsx - 修正後的完整版本
'use client'

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import supabase from '@/lib/supabase/client';
import { Database } from '@/types/database.types';
import { Button } from '@/components/ui/button';
import { Edit, Trash2, Printer, ArrowLeft, Stamp, UserCheck } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { pdfGenerator } from '@/lib/pdf/enhanced-pdf-generator';
import { SealStampConfig, SealStampManager } from '@/components/pdf/SealStampManager';
import { ElectronicSealManager } from '@/components/pdf/ElectronicSealManager';
import { usePermission } from '@/lib/permissions';

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
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { hasRole } = usePermission();
  const [quote, setQuote] = useState<FullQuotation | null>(null);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showStampSettings, setShowStampSettings] = useState(false);
  const [sealStampConfig, setSealStampConfig] = useState<SealStampConfig>(defaultSealStampConfig);
  const [showElectronicSealSettings, setShowElectronicSealSettings] = useState(false);
  const [electronicSealConfig, setElectronicSealConfig] = useState<SealStampConfig>(defaultElectronicSealConfig);

  // 🔧 修正後的表格合併邏輯
  const processTableData = (items: (QuotationItem & { kols: Pick<Kol, 'name'> | null })[]): Array<{
    item: QuotationItem & { kols: Pick<Kol, 'name'> | null };
    categoryRowSpan: number;
    kolRowSpan: number;
    showCategory: boolean;
    showKol: boolean;
  }> => {
    // 按分類分組，然後在每個分類內按KOL分組
    const categoryGroups = new Map<string, Array<QuotationItem & { kols: Pick<Kol, 'name'> | null }>>();
    
    // 先按分類分組
    items.forEach(item => {
      const category = item.category || 'N/A';
      if (!categoryGroups.has(category)) {
        categoryGroups.set(category, []);
      }
      categoryGroups.get(category)!.push(item);
    });
    
    const processedItems: Array<{
      item: QuotationItem & { kols: Pick<Kol, 'name'> | null };
      categoryRowSpan: number;
      kolRowSpan: number;
      showCategory: boolean;
      showKol: boolean;
    }> = [];
    
    // 處理每個分類
    categoryGroups.forEach((categoryItems, category) => {
      const categoryRowSpan = categoryItems.length;
      let isFirstInCategory = true;
      
      // 在該分類內，按KOL分組
      const kolGroups = new Map<string, Array<QuotationItem & { kols: Pick<Kol, 'name'> | null }>>();
      
      categoryItems.forEach(item => {
        const kolName = item.kols?.name || 'N/A';
        if (!kolGroups.has(kolName)) {
          kolGroups.set(kolName, []);
        }
        kolGroups.get(kolName)!.push(item);
      });
      
      // 處理該分類內的每個KOL組
      kolGroups.forEach((kolItems, kolName) => {
        const kolRowSpan = kolItems.length;
        let isFirstInKolGroup = true;
        
        kolItems.forEach(item => {
          processedItems.push({
            item,
            categoryRowSpan,
            kolRowSpan,
            showCategory: isFirstInCategory,
            showKol: isFirstInKolGroup
          });
          
          isFirstInCategory = false;
          isFirstInKolGroup = false;
        });
      });
    });
    
    return processedItems;
  };

  const fetchQuote = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('quotations')
      .select('*, clients(*), quotation_items(*, kols(name))')
      .eq('id', id)
      .single();

    if (error) {
      console.error(error);
      alert('讀取報價單資料失敗');
    } else {
      setQuote(data as FullQuotation);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchQuote();
    const savedSealConfig = localStorage.getItem(`sealStampConfig_${id}`);
    if (savedSealConfig) {
      try {
        setSealStampConfig(JSON.parse(savedSealConfig));
      } catch (e) { console.warn("Failed to load seal stamp config.") }
    }
    const savedElectronicConfig = localStorage.getItem(`electronicSealConfig_${id}`);
    if (savedElectronicConfig) {
      try {
        setElectronicSealConfig(JSON.parse(savedElectronicConfig));
      } catch (e) { console.warn("Failed to load electronic seal config.") }
    }
  }, [fetchQuote, id]);

  const handleSealStampConfigChange = useCallback((config: SealStampConfig) => {
    setSealStampConfig(config);
    localStorage.setItem(`sealStampConfig_${id}`, JSON.stringify(config));
  }, [id]);

  const handleElectronicSealConfigChange = useCallback((config: SealStampConfig) => {
    setElectronicSealConfig(config);
    localStorage.setItem(`electronicSealConfig_${id}`, JSON.stringify(config));
  }, [id]);

  const handleDelete = async () => {
    if (window.confirm('確定要刪除這份報價單嗎？')) {
      setIsProcessing(true);
      await supabase.from('quotation_items').delete().eq('quotation_id', id);
      await supabase.from('quotations').delete().eq('id', id);
      alert('報價單已刪除');
      router.push('/dashboard/quotes');
      router.refresh();
      setIsProcessing(false);
    }
  };

  const handleExportPDF = async () => {
    if (!quote || isProcessing) return;
    setIsProcessing(true);

    try {
      await pdfGenerator.generatePDF({
        filename: `報價單-${quote.clients?.name || '客戶'}-${quote.project_name}.pdf`,
        elementId: 'printable-quote',
        sealStamp: sealStampConfig,
      });
    } catch (error: any) {
      alert(error.message);
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

  if (loading) return <div>讀取中...</div>;
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
          <Link href="/dashboard/quotes" className="text-sm text-gray-500 hover:text-indigo-600 flex items-center mb-2">
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
                className={electronicSealConfig.enabled ? 'border-green-500 text-green-600' : ''}
              >
                <UserCheck className="mr-2 h-4 w-4" /> 電子用印
              </Button>
              <Button
                variant="outline"
                disabled={isProcessing}
                onClick={() => setShowStampSettings(true)}
                className={sealStampConfig.enabled ? 'border-indigo-500 text-indigo-600' : ''}
              >
                <Stamp className="mr-2 h-4 w-4" /> 騎縫章設定
              </Button>
            </>
          )}
          <Link href={`/dashboard/quotes/edit/${id}`}>
            <Button variant="outline" disabled={isProcessing}><Edit className="mr-2 h-4 w-4" /> 編輯</Button>
          </Link>
          <Button onClick={handleExportPDF} disabled={isProcessing}>
            <Printer className="mr-2 h-4 w-4" /> {isProcessing ? '處理中...' : '匯出 PDF'}
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={isProcessing}>
            <Trash2 className="mr-2 h-4 w-4" /> 刪除
          </Button>
        </div>
      </div>

      <Modal isOpen={showElectronicSealSettings} onClose={() => setShowElectronicSealSettings(false)} title="電子用印設定" maxWidth="sm:max-w-2xl">
        <ElectronicSealManager config={electronicSealConfig} onChange={handleElectronicSealConfigChange} />
      </Modal>

      <Modal isOpen={showStampSettings} onClose={() => setShowStampSettings(false)} title="騎縫章設定" maxWidth="sm:max-w-2xl">
        <SealStampManager config={sealStampConfig} onChange={handleSealStampConfigChange} />
      </Modal>

      <div id="printable-quote" className="relative bg-white p-8 md:p-12 rounded-lg shadow-md border text-[13px] leading-relaxed">
        <img src="/watermark-an.png" alt="watermark" className="absolute inset-0 w-full h-full opacity-5 object-contain z-0 pdf-watermark" />
        <div className="text-center mb-4 pb-2 border-b">
            <img src="/logo.png" alt="安安娛樂 LOGO" className="h-10 w-auto" />
            <h1 className="text-xl font-bold">安安娛樂有限公司委刊專案契約書</h1>
        </div>

        <table className="w-full text-sm mb-8 border border-gray-300">
          <tbody>
            <tr className="border-b">
              <td className="p-2 font-bold bg-gray-50 whitespace-nowrap w-[120px]">專案名稱：</td>
              <td className="p-2 col-span-3" colSpan={3}>
                <div className="flex justify-between items-center">
                  <span>{quote.project_name}</span>
                  <span className="text-sm text-gray-600 whitespace-nowrap">
                    開立時間：{quote.created_at ? new Date(quote.created_at).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
              </td>
            </tr>
            <tr className="border-b">
              <td className="p-2 font-bold bg-gray-50 whitespace-nowrap w-[120px]">委刊客戶：</td>
              <td className="p-2">{quote.clients?.name || 'N/A'}</td>
              <td className="p-2 font-bold bg-gray-50 whitespace-nowrap w-[120px]">客戶聯絡人：</td>
              <td className="p-2">{quote.client_contact}</td>
            </tr>
            <tr className="border-b">
              <td className="p-2 font-bold bg-gray-50 whitespace-nowrap w-[120px]">統一編號：</td>
              <td className="p-2">{quote.clients?.tin || 'N/A'}</td>
              <td className="p-2 font-bold bg-gray-50 whitespace-nowrap w-[120px]">電話：</td>
              <td className="p-2">{quote.clients?.phone || 'N/A'}</td>
            </tr>
            <tr className="border-b">
              <td className="p-2 font-bold bg-gray-50 whitespace-nowrap w-[120px]">地址：</td>
              <td className="p-2">{quote.clients?.address || 'N/A'}</td>
              <td className="p-2 font-bold bg-gray-50 whitespace-nowrap w-[120px]">電子郵件：</td>
              <td className="p-2">{quote.clients?.email || 'N/A'}</td>
            </tr>
          </tbody>
        </table>
        
        <table className="w-full border border-gray-300 mb-6 text-xs">
          <thead>
            <tr className="bg-gray-50">
              <th className="border p-2 text-center">分類</th>
              <th className="border p-2 text-center">KOL</th>
              <th className="border p-2 text-center">服務內容</th>
              <th className="border p-2 text-center">數量</th>
              <th className="border p-2 text-center">價格</th>
              <th className="border p-2 text-center">執行時間</th>
            </tr>
          </thead>
          <tbody>
            {processTableData(quote.quotation_items).map((row, index) => (
              <tr key={index} className="break-inside-avoid">
                {/* 分類欄位 - 只在第一次出現時顯示，並設置 rowSpan */}
                {row.showCategory && (
                  <td 
                    className="border p-2 text-center align-middle font-medium bg-gray-50" 
                    rowSpan={row.categoryRowSpan}
                  >
                    {row.item.category || 'N/A'}
                  </td>
                )}
                
                {/* KOL欄位 - 只在第一次出現時顯示，並設置 rowSpan */}
                {row.showKol && (
                  <td 
                    className="border p-2 text-center align-middle font-medium bg-blue-50" 
                    rowSpan={row.kolRowSpan}
                  >
                    {row.item.kols?.name || 'N/A'}
                  </td>
                )}
                
                {/* 其他欄位保持原樣 */}
                <td className="border p-2 text-center">{row.item.service}</td>
                <td className="border p-2 text-center">{row.item.quantity}</td>
                <td className="border p-2 text-right">${row.item.price?.toLocaleString() || '0'}</td>
                <td className="border p-2 text-center">{row.item.remark || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <table className="w-full mb-8 break-inside-avoid">
          <tbody>
            <tr>
              <td className="w-2/3 pr-8 align-top">
                <div className="border p-4 h-full">
                  <h3 className="text-sm font-bold mb-3 bg-gray-50 p-2 -m-4 mb-3 border-b">【廣告費之支付約定】</h3>
                  <div className="text-[10px] leading-normal space-y-2">
                    <p><strong>1.</strong> 本次廣告行銷費用由委託公司負責繳付，所有費用代收百分之五的營業稅。銀⾏⼿續費由⽀付⽅負擔。</p>
                    <p><strong>2.</strong> 本公司應於執行到期日開立當月份發票予委刊客戶，委刊客戶應於收到發票時，按發票日期月結30日依發票所載之金額匯入本公司指定帳戶如下。</p>
                    <p><strong>3.</strong> 所有報酬及因本服務契約書產⽣之相關費⽤均以本服務契約書內載明之幣值及約定付款⽇付款。</p>
                    <div className="mt-3 bg-gray-50 p-3 rounded border text-xs">
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
                          <td className="border p-2 font-bold bg-gray-50">未稅小計</td>
                          <td className="border p-2 text-right text-gray-500 relative">
                            <div style={{
                              position: 'relative',
                              display: 'inline-block',
                              color: '#6b7280'
                            }}>
                              ${quote.subtotal_untaxed?.toLocaleString() || '0'}
                              <div style={{
                                position: 'absolute',
                                left: '0',
                                right: '0',
                                top: '50%',
                                height: '1px',
                                backgroundColor: '#9ca3af',
                                transform: 'translateY(-50%)'
                              }}></div>
                            </div>                             
                          </td>
                        </tr>
                        <tr>
                          <td className="border p-2 font-bold bg-blue-50">未稅優惠</td>
                          <td className="border p-2 text-right font-bold text-blue-600">
                            ${quote.discounted_price?.toLocaleString() || '0'}
                          </td>
                        </tr>
                        <tr>
                          <td className="border p-2 font-bold bg-gray-50">營業稅 (5%)</td>
                          <td className="border p-2 text-right">
                            ${discountedTax.toLocaleString()}
                          </td>
                        </tr>
                        <tr>
                          <td className="border p-2 font-bold bg-red-50">含稅總計</td>
                          <td className="border p-2 text-right font-bold text-red-600">
                            ${discountedGrandTotal.toLocaleString()}
                          </td>
                        </tr>
                      </>
                    ) : (
                      <>
                        <tr>
                          <td className="border p-2 font-bold bg-gray-50">未稅小計</td>
                          <td className="border p-2 text-right">
                            ${quote.subtotal_untaxed?.toLocaleString() || '0'}
                          </td>
                        </tr>
                        <tr>
                          <td className="border p-2 font-bold bg-gray-50">營業稅 (5%)</td>
                          <td className="border p-2 text-right">
                            ${quote.tax?.toLocaleString() || '0'}
                          </td>
                        </tr>
                        <tr>
                          <td className="border p-2 font-bold bg-red-50">含稅總計</td>
                          <td className="border p-2 text-right font-bold text-red-600">
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
            <h3 className="text-sm font-bold mb-3 bg-gray-50 p-2 -m-4 mb-3 border-b">【合約約定】</h3>
            <p className="text-[10px] leading-normal">{contractAgreement}</p>
          </div>
          <div className="border p-4 break-inside-avoid">
            <h3 className="text-sm font-bold mb-3 bg-gray-50 p-2 -m-4 mb-3 border-b">【保密協議】</h3>
            <p className="text-[10px] leading-normal">{confidentialityAgreement}</p>
          </div>
          {quote.remarks && (
            <div className="border p-4 break-inside-avoid">
              <h3 className="text-sm font-bold mb-3 bg-gray-50 p-2 -m-4 mb-3 border-b">【補充協議】</h3>
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
    </div>
  );
}