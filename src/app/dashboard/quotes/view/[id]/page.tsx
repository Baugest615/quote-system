'use client'

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import supabase from '@/lib/supabase/client';
import { Database } from '@/types/database.types';
import { Button } from '@/components/ui/button';
import { Edit, Trash2, Printer, ArrowLeft } from 'lucide-react';
// REMOVED: import html2pdf from 'html2pdf.js'; // <- 移除這一行，改為動態載入

// 類型定義
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

const companyBankInfo = {
  bankName: '國泰世華銀行(013)',
  branchName: '文山分行',
  accountName: '安安娛樂有限公司',
  accountNumber: '103-03-500480-1',
};

export default function ViewQuotePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [quote, setQuote] = useState<FullQuotation | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPrinting, setIsPrinting] = useState(false);

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

  useEffect(() => { fetchQuote(); }, [fetchQuote]);

  const handleDelete = async () => {
    if (window.confirm('確定要刪除這份報價單嗎？')) {
      await supabase.from('quotation_items').delete().eq('quotation_id', id);
      await supabase.from('quotations').delete().eq('id', id);
      alert('報價單已刪除');
      router.push('/dashboard/quotes');
      router.refresh();
    }
  };

  const handleExportPDF = async () => {
    const element = document.getElementById('printable-quote');
    if (!element || !quote || isPrinting) return;
    setIsPrinting(true);

    // 1. 動態載入 html2pdf.js，避免 SSR 錯誤
    const { default: html2pdf } = await import('html2pdf.js');

    // 2. 複製元素並移除 PDF 中不需要的樣式 (邊框、陰影)
    const elementToPrint = element.cloneNode(true) as HTMLElement;
    elementToPrint.classList.remove('border', 'shadow-md', 'rounded-lg');

    // 3. 從複製的內容中移除既有的浮水印 img 標籤，因為我們要手動繪製
    const existingWatermark = elementToPrint.querySelector('img[alt="watermark"]');
    if (existingWatermark) {
      existingWatermark.remove();
    }
    
    const opt = {
      margin: [0.25, 0.5, 0.25, 0.5], // 上下 0.75 吋, 左右 0.5 吋邊距
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

    // 4. 使用 promise API 來手動添加浮水印
    const worker = html2pdf().set(opt).from(elementToPrint);

    worker.toPdf().get('pdf').then((pdf:any) => {
      const totalPages = pdf.internal.getNumberOfPages();
      const watermarkImgSrc = '/watermark-an.png'; // 確保此路徑在 public 資料夾下正確

      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        
        // 設定透明度
        pdf.setGState(new (pdf as any).GState({opacity: 0.05}));
        
        const { width, height } = pdf.internal.pageSize;
        const imgWidth = width * 0.7; // 浮水印寬度為頁面寬度的 70%
        const imgHeight = height * 0.4; // 浮水印高度為頁面高度的 40% (可調整)
        const x = (width - imgWidth) / 2; // 水平置中
        const y = (height - imgHeight) / 2; // 垂直置中
        
        // 將浮水印圖片添加到當前頁面
        pdf.addImage(watermarkImgSrc, 'PNG', x, y, imgWidth, imgHeight, undefined, 'FAST');
        
        // 重設透明度，以免影響頁面其他內容
        pdf.setGState(new (pdf as any).GState({opacity: 1}));
      }
    }).save().catch((err: Error) => {
      console.error("PDF export failed:", err);
      alert("匯出 PDF 失敗。");
    }).finally(() => {
      setIsPrinting(false);
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
          <Link href={`/dashboard/quotes/edit/${quote.id}`}>
            <Button variant="outline" disabled={isPrinting}>
              <Edit className="mr-2 h-4 w-4" /> 編輯
            </Button>
          </Link>
          <Button variant="outline" onClick={handleExportPDF} disabled={isPrinting}>
            {isPrinting ? '匯出中...' : <><Printer className="mr-2 h-4 w-4" /> 匯出 PDF</>}
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={isPrinting}>
            <Trash2 className="mr-2 h-4 w-4" /> 刪除
          </Button>
        </div>
      </div>

       <div id="printable-quote" className="relative bg-white p-8 md:p-12 rounded-lg shadow-md border text-[13px] leading-relaxed">
        {/* 網頁顯示用的浮水印層 */}
        <img src="/watermark-an.png" alt="watermark" className="absolute inset-0 w-full h-full opacity-5 object-contain z-0" style={{ pointerEvents: 'none' }} />

        {/* 刊頭與 LOGO 並排 */}
        <div className="flex items-center justify-center mb-4 pb-2 border-b space-x-4">
          <img src="/logo.png" alt="安安娛樂 LOGO" className="h-10 w-auto" />
          <h1 className="text-xl font-bold">安安娛樂有限公司委刊專案契約書</h1>
        </div>

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
              <td className="p-2 font-bold bg-gray-50">付款方式：</td>
              <td className="p-2">{quote.payment_method}</td>
            </tr>
            <tr className="border-b">
              <td className="p-2 font-bold bg-gray-50">發票抬頭：</td>
              <td className="p-2">{quote.clients?.invoice_title || 'N/A'}</td>
              <td className="p-2 font-bold bg-gray-50">寄送地址：</td>
              <td className="p-2">{quote.clients?.address || 'N/A'}</td>
            </tr>
          </tbody>
        </table>

        <table className="w-full text-sm mb-8">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-2 font-medium">類別</th>
              <th className="text-left p-2 font-medium">KOL名稱</th>
              <th className="text-left p-2 font-medium">執行內容</th>
              <th className="text-center p-2 font-medium">數量</th>
              <th className="text-right p-2 font-medium">價格</th>
              <th className="text-left p-2 font-medium">備註</th>
            </tr>
          </thead>
          <tbody>
            {quote.quotation_items.map((item, index) => (
              <tr key={index} className="border-b">
                <td className="p-2">{item.category || ''}</td>
                <td className="p-2">{item.kols?.name || '自訂項目'}</td>
                <td className="p-2">{item.service}</td>
                <td className="p-2 text-center">{item.quantity}</td>
                <td className="p-2 text-right">NT$ {item.price.toLocaleString()}</td>
                <td className="p-2">{item.remark || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex flex-col justify-end text-right space-y-2 mb-8">
          <div>項目合計未稅: NT$ {(quote.subtotal_untaxed || 0).toLocaleString()}</div>
          <div>稅金 (5%): NT$ {(quote.tax || 0).toLocaleString()}</div>
          <div className="text-lg font-bold border-t pt-2">合計含稅: NT$ {(quote.grand_total_taxed || 0).toLocaleString()}</div>
          {quote.has_discount && quote.discounted_price && (
            <div className="text-indigo-600 font-bold">專案優惠價: NT$ {quote.discounted_price.toLocaleString()}</div>
          )}
        </div>

        {quote.terms && (
          <div className="mb-6">
            <h4 className="text-base font-bold mb-2">合約條款：</h4>
            <div className="text-[11px] leading-[1.8] whitespace-pre-wrap">
              {quote.terms}
              {'\n\n'}【廣告費之支付約定】
              {'\n'}1. 本次廣告行銷費用由委託公司負責繳付，所有費用代收百分之五的營業稅。
              {'\n'}2. 本公司應於執行到期日開立當月份發票予委刊客戶，委刊客戶應於收到發票時，按發票日期月結30日依發票所載之金額匯入本公司指定帳戶如下。
              {'\n'}銀行名稱：{companyBankInfo.bankName}  分行名稱：{companyBankInfo.branchName}
              {'\n'}銀行帳號：{companyBankInfo.accountNumber}
              {'\n'}帳號名稱：{companyBankInfo.accountName}
            </div>
          </div>
        )}

        {quote.remarks && (
          <div className="mb-6">
            <h4 className="text-base font-bold mb-2">專案備註：</h4>
            <div className="text-[11px] leading-[1.8] whitespace-pre-wrap">{quote.remarks}</div>
          </div>
        )}

        <div className="mt-12 grid grid-cols-2 gap-8">
          <div>
            <div className="font-bold mb-4">委刊客戶簽署：</div>
            <div className="border-b border-gray-400 mb-2 h-8"></div>
            <div className="text-xs">公司印鑑</div>
          </div>
          <div>
            <div className="font-bold mb-4">安安娛樂簽署：</div>
            <div className="border-b border-gray-400 mb-2 h-8"></div>
            <div className="text-xs">公司印鑑</div>
          </div>
        </div>

        <div className="mt-6 text-right text-sm">
          委刊日期：{quote.created_at ? new Date(quote.created_at).toLocaleDateString('zh-TW') : new Date().toLocaleDateString('zh-TW')}
        </div>
      </div>
    </div>
  );
}