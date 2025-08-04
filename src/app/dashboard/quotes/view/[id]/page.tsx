// src/app/dashboard/quotes/view/[id]/page.tsx - 修復版
'use client'

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import supabase from '@/lib/supabase/client';
import { Database } from '@/types/database.types';
import { Button } from '@/components/ui/button';
import { Edit, Trash2, Printer, ArrowLeft, Settings, Stamp } from 'lucide-react';
import { Modal } from '@/components/ui/modal'; // 使用現有的 Modal 組件

// 類型定義保持不變...
type Quotation = Database['public']['Tables']['quotations']['Row'];
type QuotationItem = Database['public']['Tables']['quotation_items']['Row'];
type Client = Database['public']['Tables']['clients']['Row'];
type Kol = Database['public']['Tables']['kols']['Row'];

type FullQuotation = Quotation & {
  id: number;
  quote_number: string;
  clients: Client | null;
  subtotal_untaxed: number | null;
  tax: number | null;
  grand_total_taxed: number | null;
  valid_until: string | null; 
  quotation_items: (QuotationItem & {
    kols: Pick<Kol, 'name'> | null;
  })[];
};

// 騎縫章配置介面
interface SealStampConfig {
  enabled: boolean;
  stampImage: string;
  position: 'left' | 'right' | 'top' | 'bottom';
  offsetX: number;
  offsetY: number;
  size: number;
  opacity: number;
  rotation: number;
  overlayPages: boolean;
}

const companyBankInfo = {
  bankName: '國泰世華銀行(013)',
  branchName: '文山分行',
  accountName: '安安娛樂有限公司',
  accountNumber: '103-03-500480-1',
};

// 預設騎縫章設定
const defaultSealStampConfig: SealStampConfig = {
  enabled: false,
  stampImage: '/seals/company-seal.png',
  position: 'right',
  offsetX: -0.3,
  offsetY: 2.0, // 調整到下方
  size: 2.0, // 增大印章尺寸
  opacity: 0.7,
  rotation: 15, // 向右旋轉15度
  overlayPages: true,
};

export default function ViewQuotePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [quote, setQuote] = useState<FullQuotation | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPrinting, setIsPrinting] = useState(false);
  
  // 騎縫章相關狀態
  const [sealStampConfig, setSealStampConfig] = useState<SealStampConfig>(defaultSealStampConfig);
  const [showStampSettings, setShowStampSettings] = useState(false);

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
      setQuote(null);
    } else {
      setQuote(data as FullQuotation);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { 
    fetchQuote();
    
    // 嘗試從 localStorage 載入騎縫章設定
    const savedConfig = localStorage.getItem(`sealStamp_${id}`);
    if (savedConfig) {
      try {
        setSealStampConfig(JSON.parse(savedConfig));
      } catch (error) {
        console.warn('無法載入騎縫章設定:', error);
      }
    }
  }, [fetchQuote, id]);

  // 儲存騎縫章設定
  const handleSealStampConfigChange = useCallback((config: SealStampConfig) => {
    setSealStampConfig(config);
    localStorage.setItem(`sealStamp_${id}`, JSON.stringify(config));
  }, [id]);

  const handleDelete = async () => {
    if (window.confirm('確定要刪除這份報價單嗎？')) {
      await supabase.from('quotation_items').delete().eq('quotation_id', id);
      await supabase.from('quotations').delete().eq('id', id);
      alert('報價單已刪除');
      router.push('/dashboard/quotes');
      router.refresh();
    }
  };

  // 🆕 增強版 PDF 匯出功能（含騎縫章）
  const handleExportPDF = async () => {
    const element = document.getElementById('printable-quote');
    if (!element || !quote || isPrinting) return;
    setIsPrinting(true);

    try {
      // 動態載入 html2pdf.js
      const { default: html2pdf } = await import('html2pdf.js');

      // 複製元素並移除不需要的樣式
      const elementToPrint = element.cloneNode(true) as HTMLElement;
      elementToPrint.classList.remove('border', 'shadow-md', 'rounded-lg');

      // 移除現有的浮水印（會手動添加）
      const existingWatermark = elementToPrint.querySelector('img[alt="watermark"]');
      if (existingWatermark) {
        existingWatermark.remove();
      }

      const opt = {
        margin: [0.25, 0.5, 0.25, 0.5],
        filename: `報價單-${quote.clients?.name || '客戶'}-${quote.project_name}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
        },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
      };

      // 使用 worker 模式來添加浮水印和騎縫章
      const worker = html2pdf().set(opt).from(elementToPrint);

      await worker.toPdf().get('pdf').then(async (pdf: any) => {
        const totalPages = pdf.internal.getNumberOfPages();
        
        // 添加浮水印
        await addWatermark(pdf, totalPages);
        
        // 添加騎縫章（如果啟用）
        if (sealStampConfig.enabled) {
          await addSealStamp(pdf, totalPages, sealStampConfig);
        }
      }).save();

    } catch (error) {
      console.error('PDF 匯出失敗:', error);
      alert('PDF 匯出失敗，請稍後再試');
    } finally {
      setIsPrinting(false);
    }
  };

  // 添加浮水印
  const addWatermark = async (pdf: any, totalPages: number) => {
    const watermarkImgSrc = '/watermark-an.png';
    
    for (let i = 1; i <= totalPages; i++) {
      pdf.setPage(i);
      pdf.setGState(new (pdf as any).GState({opacity: 0.05}));
      
      const { width, height } = pdf.internal.pageSize;
      const imgWidth = width * 0.7;
      const imgHeight = height * 0.4;
      const x = (width - imgWidth) / 2;
      const y = (height - imgHeight) / 2;
      
      pdf.addImage(watermarkImgSrc, 'PNG', x, y, imgWidth, imgHeight, undefined, 'FAST');
      pdf.setGState(new (pdf as any).GState({opacity: 1}));
    }
  };

  // 添加騎縫章 - 修正版本
  const addSealStamp = async (pdf: any, totalPages: number, config: SealStampConfig) => {
    const { width, height } = pdf.internal.pageSize;
    
    for (let i = 1; i <= totalPages; i++) {
      pdf.setPage(i);
      pdf.setGState(new (pdf as any).GState({opacity: config.opacity}));
      
      // 計算騎縫章位置
      let x: number, y: number;
      
      switch (config.position) {
        case 'right':
          x = width - (config.size / 2) + config.offsetX;
          if (config.overlayPages && totalPages > 1) {
            const pageOffset = (height / totalPages) * (i - 1);
            y = (height / 2) + config.offsetY - pageOffset * 0.1;
          } else {
            y = (height / 2) + config.offsetY;
          }
          break;
          
        case 'left':
          x = -(config.size / 2) + config.offsetX;
          if (config.overlayPages && totalPages > 1) {
            const pageOffset = (height / totalPages) * (i - 1);
            y = (height / 2) + config.offsetY - pageOffset * 0.1;
          } else {
            y = (height / 2) + config.offsetY;
          }
          break;
          
        case 'top':
          y = -(config.size / 2) + config.offsetY;
          if (config.overlayPages && totalPages > 1) {
            const pageOffset = (width / totalPages) * (i - 1);
            x = (width / 2) + config.offsetX - pageOffset * 0.1;
          } else {
            x = (width / 2) + config.offsetX;
          }
          break;
          
        case 'bottom':
          y = height - (config.size / 2) + config.offsetY;
          if (config.overlayPages && totalPages > 1) {
            const pageOffset = (width / totalPages) * (i - 1);
            x = (width / 2) + config.offsetX - pageOffset * 0.1;
          } else {
            x = (width / 2) + config.offsetX;
          }
          break;
          
        default:
          x = width - (config.size / 2) + config.offsetX;
          y = (height / 2) + config.offsetY;
      }
      
      // 添加騎縫章 - 使用 jsPDF 支援的方法
      try {
        // 如果有旋轉角度，使用 jsPDF 的旋轉功能
        if (config.rotation !== 0) {
          // 儲存當前狀態
          pdf.saveGraphicsState();
          
          // 設定變換矩陣進行旋轉
          const radians = (config.rotation * Math.PI) / 180;
          const cos = Math.cos(radians);
          const sin = Math.sin(radians);
          
          // 移動到旋轉中心
          const centerX = x;
          const centerY = y;
          
          // 應用旋轉變換
          pdf.setTransformationMatrix(cos, sin, -sin, cos, centerX, centerY);
          
          // 在旋轉後的座標系中繪製印章
          pdf.addImage(
            config.stampImage,
            'PNG',
            -config.size / 2,
            -config.size / 2,
            config.size,
            config.size,
            `seal-stamp-page-${i}-rotated`,
            'FAST'
          );
          
          // 恢復狀態
          pdf.restoreGraphicsState();
        } else {
          // 無旋轉時直接添加
          pdf.addImage(
            config.stampImage,
            'PNG',
            x - config.size / 2,
            y - config.size / 2,
            config.size,
            config.size,
            `seal-stamp-page-${i}`,
            'FAST'
          );
        }
      } catch (error) {
        console.warn(`騎縫章添加失敗 (第${i}頁):`, error);
        
        // 如果旋轉失敗，嘗試不旋轉的版本
        try {
          pdf.addImage(
            config.stampImage,
            'PNG',
            x - config.size / 2,
            y - config.size / 2,
            config.size,
            config.size,
            `seal-stamp-page-${i}-fallback`,
            'FAST'
          );
        } catch (fallbackError) {
          console.error(`騎縫章備用方案也失敗 (第${i}頁):`, fallbackError);
        }
      }
      
      // 重設透明度
      pdf.setGState(new (pdf as any).GState({opacity: 1}));
    }
  };

  // 快速啟用騎縫章
  const handleQuickEnableSealStamp = () => {
    handleSealStampConfigChange({
      ...sealStampConfig,
      enabled: true
    });
  };

  if (loading) return <div>讀取中...</div>;
  if (!quote) return <div>找不到報價單資料。</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center print:hidden">
        <div>
          <Link href="/dashboard/quotes" className="text-sm text-gray-500 hover:text-indigo-600 flex items-center mb-2">
            <ArrowLeft className="h-4 w-4 mr-1" /> 返回列表
          </Link>
          <h1 className="text-3xl font-bold">檢視報價單</h1>
        </div>
        <div className="flex space-x-2">
          {/* 騎縫章設定按鈕 */}
          <Button 
            variant="outline" 
            disabled={isPrinting}
            onClick={() => setShowStampSettings(true)}
            className={sealStampConfig.enabled ? 'border-indigo-500 text-indigo-600' : ''}
          >
            <Stamp className="mr-2 h-4 w-4" /> 
            騎縫章
            {sealStampConfig.enabled && (
              <span className="ml-1 bg-indigo-100 text-indigo-600 px-1 rounded text-xs">
                ON
              </span>
            )}
          </Button>

          <Link href={`/dashboard/quotes/edit/${quote.id}`}>
            <Button variant="outline" disabled={isPrinting}>
              <Edit className="mr-2 h-4 w-4" /> 編輯
            </Button>
          </Link>
          
          <Button variant="outline" onClick={handleExportPDF} disabled={isPrinting}>
            {isPrinting ? (
              '匯出中...'
            ) : (
              <>
                <Printer className="mr-2 h-4 w-4" /> 
                匯出 PDF
                {sealStampConfig.enabled && (
                  <Stamp className="ml-1 h-3 w-3 text-indigo-600" />
                )}
              </>
            )}
          </Button>
          
          <Button variant="destructive" onClick={handleDelete} disabled={isPrinting}>
            <Trash2 className="mr-2 h-4 w-4" /> 刪除
          </Button>
        </div>
      </div>

      {/* 騎縫章狀態提示 */}
      {!sealStampConfig.enabled && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 print:hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Stamp className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm font-medium text-blue-800">
                  騎縫章功能
                </p>
                <p className="text-xs text-blue-600">
                  為 PDF 添加專業的騎縫章，支援上下左右四個方位，提升文件的防偽性和正式性
                </p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={handleQuickEnableSealStamp}
              className="bg-blue-600 hover:bg-blue-700"
            >
              啟用騎縫章
            </Button>
          </div>
        </div>
      )}

      {sealStampConfig.enabled && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 print:hidden">
          <div className="flex items-center space-x-2">
            <Stamp className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-sm font-medium text-green-800">
                騎縫章已啟用
              </p>
              <p className="text-xs text-green-600">
                位置: {
                  sealStampConfig.position === 'right' ? '右側邊緣' : 
                  sealStampConfig.position === 'left' ? '左側邊緣' :
                  sealStampConfig.position === 'top' ? '上側邊緣' : 
                  '下側邊緣'
                } | 
                透明度: {Math.round(sealStampConfig.opacity * 100)}% | 
                大小: {sealStampConfig.size}吋 | 
                旋轉: {sealStampConfig.rotation}°
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 騎縫章設定 Modal */}
      <Modal 
        isOpen={showStampSettings} 
        onClose={() => setShowStampSettings(false)}
        title="騎縫章設定"
        maxWidth="sm:max-w-2xl"
      >
        <SealStampSettingsForm 
          config={sealStampConfig}
          onChange={handleSealStampConfigChange}
        />
      </Modal>

      {/* 報價單內容保持原樣 */}
      <div id="printable-quote" className="relative bg-white p-8 md:p-12 rounded-lg shadow-md border text-[13px] leading-relaxed">
        {/* 網頁顯示用的浮水印層 */}
        <img src="/watermark-an.png" alt="watermark" className="absolute inset-0 w-full h-full opacity-5 object-contain z-0" style={{ pointerEvents: 'none' }} />

        {/* 刊頭與 LOGO 並排 */}
        <div className="flex items-center justify-center mb-4 pb-2 border-b space-x-4">
          <img src="/logo.png" alt="安安娛樂 LOGO" className="h-10 w-auto" />
          <h1 className="text-xl font-bold">安安娛樂有限公司委刊專案契約書</h1>
        </div>

        {/* 基本資訊表格 */}
        <table className="w-full text-sm mb-8 border border-gray-300">
          <tbody>
            <tr className="border-b">
              <td className="p-2 font-bold bg-gray-50 w-1/4">專案名稱：</td>
              <td className="p-2" colSpan={3}>{quote.project_name}</td>
            </tr>
            <tr className="border-b">
              <td className="p-2 font-bold bg-gray-50">委刊客戶：</td>
              <td className="p-2">{quote.clients?.name || 'N/A'}</td>
              <td className="p-2 font-bold bg-gray-50">客戶聯絡人：</td>
              <td className="p-2">{quote.client_contact}</td>
            </tr>
            <tr className="border-b">
              <td className="p-2 font-bold bg-gray-50">統一編號：</td>
              <td className="p-2">{quote.clients?.tin || 'N/A'}</td>
              <td className="p-2 font-bold bg-gray-50">電話：</td>
              <td className="p-2">{quote.clients?.phone || 'N/A'}</td>
            </tr>
            <tr className="border-b">
              <td className="p-2 font-bold bg-gray-50">地址：</td>
              <td className="p-2" colSpan={3}>{quote.clients?.address || 'N/A'}</td>
            </tr>
          </tbody>
        </table>

        {/* 報價項目表格 */}
        <table className="w-full border border-gray-300 mb-6 text-xs">
          <thead>
            <tr className="bg-gray-50">
              <th className="border border-gray-300 p-2 text-left w-1/6">分類</th>
              <th className="border border-gray-300 p-2 text-left w-1/6">KOL</th>
              <th className="border border-gray-300 p-2 text-left w-2/6">服務內容</th>
              <th className="border border-gray-300 p-2 text-center w-1/12">數量</th>
              <th className="border border-gray-300 p-2 text-right w-1/6">單價</th>
              <th className="border border-gray-300 p-2 text-right w-1/6">小計</th>
            </tr>
          </thead>
          <tbody>
            {quote.quotation_items.map((item, index) => (
              <tr key={index}>
                <td className="border border-gray-300 p-2">{item.category || 'N/A'}</td>
                <td className="border border-gray-300 p-2">{item.kols?.name || 'N/A'}</td>
                <td className="border border-gray-300 p-2">{item.service}</td>
                <td className="border border-gray-300 p-2 text-center">{item.quantity}</td>
                <td className="border border-gray-300 p-2 text-right">${item.price.toLocaleString()}</td>
                <td className="border border-gray-300 p-2 text-right">${(item.price * item.quantity).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* 總計區域 - 新增廣告費支付約定 */}
        <div className="flex justify-between mb-8 gap-8">
          {/* 左側：廣告費支付約定 */}
          <div className="w-2/3">
            <div className="border border-gray-300 p-4">
              <h3 className="text-sm font-bold mb-3 bg-gray-50 p-2 -m-4 mb-3 border-b border-gray-300">
                【廣告費之支付約定】
              </h3>
              <div className="text-xs leading-relaxed space-y-2">
                <p>
                  <strong>1.</strong> 本次廣告行銷費用由委託公司負責繳付，所有費用代收百分之五的營業稅。
                </p>
                <p>
                  <strong>2.</strong> 本公司應於執行到期日開立當月份發票予委刊客戶，委刊客戶應於收到發票時，按發票日期月結30日依發票所載之金額匯入本公司指定帳戶如下。
                </p>
                <div className="mt-3 bg-gray-50 p-3 rounded border">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div><strong>銀行名稱：</strong>{companyBankInfo.bankName}</div>
                    <div><strong>分行名稱：</strong>{companyBankInfo.branchName}</div>
                    <div><strong>銀行帳號：</strong>{companyBankInfo.accountNumber}</div>
                    <div><strong>帳號名稱：</strong>{companyBankInfo.accountName}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 右側：金額統計 */}
          <div className="w-1/3">
            <table className="w-full border border-gray-300 text-sm">
              <tbody>
                <tr>
                  <td className="border border-gray-300 p-2 font-bold bg-gray-50">未稅小計</td>
                  <td className="border border-gray-300 p-2 text-right">${quote.subtotal_untaxed?.toLocaleString() || '0'}</td>
                </tr>
                <tr>
                  <td className="border border-gray-300 p-2 font-bold bg-gray-50">營業稅 (5%)</td>
                  <td className="border border-gray-300 p-2 text-right">${quote.tax?.toLocaleString() || '0'}</td>
                </tr>
                <tr>
                  <td className="border border-gray-300 p-2 font-bold bg-red-50">含稅總計</td>
                  <td className="border border-gray-300 p-2 text-right font-bold text-red-600">${quote.grand_total_taxed?.toLocaleString() || '0'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 合約條款與保密協定 - 重新調整 */}
        <div className="space-y-6 mb-8">
          {/* 合約條款 */}
          <div className="border border-gray-300 p-4">
            <h3 className="text-base font-bold mb-3 bg-gray-50 p-2 -m-4 mb-3 border-b border-gray-300">
              合約條款
            </h3>
            <div className="text-sm leading-relaxed space-y-2">
              <p><strong>第一條：</strong>委刊內容以本契約書所列項目為準，如有變動需雙方書面同意。</p>
              <p><strong>第二條：</strong>執行期間內，委刊方不得要求無償增加服務項目或延長執行時間。</p>
              <p><strong>第三條：</strong>受刊方應確保所提供之服務符合約定之品質標準。</p>
              <p><strong>第四條：</strong>任何爭議以台灣台北地方法院為第一審管轄法院。</p>
              {quote.terms && (
                <p><strong>特殊約定：</strong>{quote.terms}</p>
              )}
            </div>
          </div>

          {/* 保密協定 */}
          <div className="border border-gray-300 p-4">
            <h3 className="text-base font-bold mb-3 bg-gray-50 p-2 -m-4 mb-3 border-b border-gray-300">
              保密協定
            </h3>
            <div className="text-sm leading-relaxed space-y-2">
              <p><strong>第一條：</strong>雙方同意對於因本契約而知悉之對方商業機密資訊予以保密。</p>
              <p><strong>第二條：</strong>保密義務不因本契約終止而消滅，雙方應持續履行保密義務。</p>
              <p><strong>第三條：</strong>如有違反保密義務，應負損害賠償責任。</p>
            </div>
          </div>

          {/* 其他約定事項 */}
          <div className="border border-gray-300 p-4">
            <h3 className="text-base font-bold mb-3 bg-gray-50 p-2 -m-4 mb-3 border-b border-gray-300">
              其他約定事項
            </h3>
            <div className="text-sm leading-relaxed space-y-2">
              <p><strong>執行期限：</strong>自契約簽署日起執行，具體時程依各項目約定辦理。</p>
              <p><strong>智慧財產權：</strong>委刊內容所產生之著作權歸委刊方所有，但執行過程中之創意發想歸受刊方所有。</p>
              <p><strong>契約變更：</strong>本契約之變更須經雙方書面同意始生效力。</p>
              {quote.remarks && (
                <p><strong>備註：</strong>{quote.remarks}</p>
              )}
            </div>
          </div>
        </div>

        {/* 簽名區域 */}
        <div className="grid grid-cols-2 gap-8 mt-12">
          <div className="text-center">
            <div className="border-t border-gray-300 pt-2">
              <p className="text-sm font-bold">委刊方簽名</p>
              <p className="text-xs text-gray-500 mt-1">日期：_____________</p>
            </div>
          </div>
          <div className="text-center">
            <div className="border-t border-gray-300 pt-2">
              <p className="text-sm font-bold">受刊方簽名</p>
              <p className="text-xs text-gray-500 mt-1">日期：_____________</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// 🆕 騎縫章設定表單組件（簡化版）
function SealStampSettingsForm({ 
  config, 
  onChange 
}: { 
  config: SealStampConfig, 
  onChange: (config: SealStampConfig) => void 
}) {
  const [uploading, setUploading] = useState(false);

  // 上傳印章圖片
  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('檔案大小不得超過 2MB');
      return;
    }

    if (!file.type.startsWith('image/')) {
      alert('請選擇圖片檔案');
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `seal-stamps/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { data, error } = await supabase.storage
        .from('attachments')
        .upload(fileName, file);

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('attachments')
        .getPublicUrl(data.path);

      onChange({
        ...config,
        stampImage: publicUrl
      });

      alert('印章上傳成功！');
    } catch (error) {
      console.error('上傳失敗:', error);
      alert('上傳失敗，請稍後再試');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 啟用開關 */}
      <div className="flex items-center justify-between">
        <span className="text-lg font-semibold">啟用騎縫章</span>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => onChange({ ...config, enabled: e.target.checked })}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
        </label>
      </div>

      {config.enabled && (
        <div className="space-y-4">
          {/* 印章圖片上傳 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">印章圖片</label>
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              disabled={uploading}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            {config.stampImage && (
              <div className="mt-2">
                <img 
                  src={config.stampImage} 
                  alt="當前印章" 
                  className="h-16 w-16 object-contain border rounded"
                />
              </div>
            )}
          </div>

          {/* 基本設定 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">騎縫位置</label>
              <select
                value={config.position}
                onChange={(e) => onChange({ ...config, position: e.target.value as 'left' | 'right' | 'top' | 'bottom' })}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              >
                <option value="right">右側邊緣</option>
                <option value="left">左側邊緣</option>
                <option value="top">上側邊緣</option>
                <option value="bottom">下側邊緣</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                印章大小 ({config.size}吋)
              </label>
              <input
                type="range"
                min="0.5"
                max="3.0"
                step="0.1"
                value={config.size}
                onChange={(e) => onChange({ ...config, size: parseFloat(e.target.value) })}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>

          {/* 進階設定 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                透明度 ({Math.round(config.opacity * 100)}%)
              </label>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.1"
                value={config.opacity}
                onChange={(e) => onChange({ ...config, opacity: parseFloat(e.target.value) })}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                旋轉角度 ({config.rotation}°)
              </label>
              <input
                type="range"
                min="-45"
                max="45"
                step="5"
                value={config.rotation}
                onChange={(e) => onChange({ ...config, rotation: parseInt(e.target.value) })}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>

          {/* 微調設定 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {config.position === 'top' || config.position === 'bottom' ? '水平偏移' : '水平偏移'} ({config.offsetX}吋)
              </label>
              <input
                type="range"
                min="-2.0"
                max="2.0"
                step="0.1"
                value={config.offsetX}
                onChange={(e) => onChange({ ...config, offsetX: parseFloat(e.target.value) })}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <div className="text-xs text-gray-500 mt-1">
                {config.position === 'top' || config.position === 'bottom' ? '左右微調位置' : '內外微調位置'}
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {config.position === 'top' || config.position === 'bottom' ? '垂直偏移' : '垂直偏移'} ({config.offsetY}吋)
              </label>
              <input
                type="range"
                min="-2.0"
                max="4.0"
                step="0.1"
                value={config.offsetY}
                onChange={(e) => onChange({ ...config, offsetY: parseFloat(e.target.value) })}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <div className="text-xs text-gray-500 mt-1">
                {config.position === 'top' || config.position === 'bottom' ? '內外微調位置' : '上下微調位置'}
              </div>
            </div>
          </div>

          {/* 跨頁重疊選項 */}
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="overlay-pages"
              checked={config.overlayPages}
              onChange={(e) => onChange({ ...config, overlayPages: e.target.checked })}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <label htmlFor="overlay-pages" className="text-sm text-gray-700">
              跨頁重疊效果
            </label>
          </div>

          {/* 預設印章範本 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">預設印章範本</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { name: '公司印章', path: '/seals/company-seal.png' },
                { name: '核准印章', path: '/seals/approved-seal.png' },
                { name: '確認印章', path: '/seals/confirmed-seal.png' },
                { name: '騎縫章', path: '/seals/bridge-seal.png' },
              ].map((template) => (
                <button
                  key={template.name}
                  type="button"
                  onClick={() => onChange({ ...config, stampImage: template.path })}
                  className="p-2 border rounded hover:bg-gray-50 text-sm text-center"
                >
                  {template.name}
                </button>
              ))}
            </div>
          </div>

          {/* 🆕 快速位置設定 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">快速位置設定</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onChange({ 
                  ...config, 
                  position: 'right', 
                  offsetX: -0.3, 
                  offsetY: 2.0, 
                  rotation: 15,
                  size: 2.0 
                })}
                className="p-2 border rounded hover:bg-blue-50 text-sm text-center"
              >
                📍 右下角 (合約)
              </button>
              <button
                type="button"
                onClick={() => onChange({ 
                  ...config, 
                  position: 'left', 
                  offsetX: 0.3, 
                  offsetY: 0, 
                  rotation: -15,
                  size: 1.5 
                })}
                className="p-2 border rounded hover:bg-blue-50 text-sm text-center"
              >
                📍 左中央 (騎縫)
              </button>
              <button
                type="button"
                onClick={() => onChange({ 
                  ...config, 
                  position: 'top', 
                  offsetX: 0, 
                  offsetY: 0.3, 
                  rotation: 0,
                  size: 1.2 
                })}
                className="p-2 border rounded hover:bg-blue-50 text-sm text-center"
              >
                📍 上方中央
              </button>
              <button
                type="button"
                onClick={() => onChange({ 
                  ...config, 
                  position: 'bottom', 
                  offsetX: 0, 
                  offsetY: -0.3, 
                  rotation: 0,
                  size: 1.2 
                })}
                className="p-2 border rounded hover:bg-blue-50 text-sm text-center"
              >
                📍 下方中央
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}