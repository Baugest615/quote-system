'use client'

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import supabase from '@/lib/supabase/client';
import { Database } from '@/types/database.types';
import { Button } from '@/components/ui/button';
import { Edit, Trash2, Printer, ArrowLeft } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas'; // 重新引入 html2canvas

// --- 類型定義 ---
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

// --- 公司銀行帳戶資訊 ---
const companyBankInfo = {
  bankName: '國泰世華銀行 (013)',
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

  useEffect(() => { fetchQuote() }, [fetchQuote]);

  const handleDelete = async () => {
    if (window.confirm('確定要刪除這份報價單嗎？所有相關資料和附件都將被永久刪除。')) {
      if (quote?.attachments && Array.isArray(quote.attachments) && quote.attachments.length > 0) {
        const attachment = quote.attachments[0] as any;
        if (attachment.path) await supabase.storage.from('attachments').remove([attachment.path]);
      }
      await supabase.from('quotation_items').delete().eq('quotation_id', id);
      await supabase.from('quotations').delete().eq('id', id);
      alert('報價單已刪除');
      router.push('/dashboard/quotes');
      router.refresh();
    }
  };
  
  // --- 還原為 html2canvas 的 PDF 產生邏輯 ---
  const handlePrintToPDF = async () => {
    const printableElement = document.getElementById('printable-quote');
    if (!printableElement || isPrinting) return;

    setIsPrinting(true);
    printableElement.classList.add('print-mode');
    
    try {
      const canvas = await html2canvas(printableElement, {
        scale: 2, // 使用較高的解析度以確保清晰度
        useCORS: true,
      });

      printableElement.classList.remove('print-mode');
      const imgData = canvas.toDataURL('image/jpeg', 0.95); // 使用高品質的 JPEG 壓縮
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      // 檢查 PDF 是否需要分頁
      if (pdfHeight > pdf.internal.pageSize.getHeight()) {
        const pageCount = Math.ceil(pdfHeight / pdf.internal.pageSize.getHeight());
        let heightLeft = pdfHeight;
        let position = 0;
        
        pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);
        heightLeft -= pdf.internal.pageSize.getHeight();

        for (let i = 1; i < pageCount; i++) {
          position = -i * pdf.internal.pageSize.getHeight();
          pdf.addPage();
          pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);
          heightLeft -= pdf.internal.pageSize.getHeight();
        }
      } else {
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      }
      
      const fileName = `報價單-${quote?.clients?.name || '客戶'}-${quote?.project_name}.pdf`;
      pdf.save(fileName);

    } catch (error) {
      console.error("PDF 匯出失敗:", error);
      alert("PDF 匯出失敗，請檢查 console 獲取更多資訊。");
      printableElement.classList.remove('print-mode');
    } finally {
      setIsPrinting(false);
    }
  };

  if (loading) return <div>讀取中...</div>;
  if (!quote) return <div>找不到報價單資料。</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center print:hidden">
        <div>
          <Link href="/dashboard/quotes" className="text-sm text-gray-500 hover:text-indigo-600 flex items-center mb-2"><ArrowLeft className="h-4 w-4 mr-1"/> 返回列表</Link>
          <h1 className="text-3xl font-bold">檢視報價單</h1>
        </div>
        <div className="flex space-x-2">
          <Link href={`/dashboard/quotes/edit/${quote.id}`}><Button variant="outline" disabled={isPrinting}><Edit className="mr-2 h-4 w-4" /> 編輯</Button></Link>
          <Button variant="outline" onClick={handlePrintToPDF} disabled={isPrinting}>{isPrinting ? 'PDF產生中...' : <><Printer className="mr-2 h-4 w-4" /> 輸出成 PDF</>}</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={isPrinting}><Trash2 className="mr-2 h-4 w-4" /> 刪除</Button>
        </div>
      </div>
      
      <div id="printable-quote" className="bg-white p-8 md:p-12 rounded-lg shadow-md border">
        <div className="text-center mb-8 pb-4 border-b">
            <h1 className="text-2xl font-bold">安安娛樂有限公司委刊專案契約書</h1>
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm my-6">
            <div><strong>專案名稱:</strong> {quote.project_name}</div>
            <div><strong>委刊客戶:</strong> {quote.clients?.name || 'N/A'}</div>
            <div><strong>客戶聯絡人:</strong> {quote.client_contact}</div>
            <div><strong>統一編號:</strong> {quote.clients?.tin || 'N/A'}</div>
            <div><strong>發票抬頭:</strong> {quote.clients?.invoice_title || 'N/A'}</div>
            <div><strong>發票寄送地址:</strong> {quote.clients?.address || 'N/A'}</div>
            <div><strong>付款方式:</strong> {quote.payment_method}</div>
            <div className="no-print"><strong>狀態:</strong> {quote.status}</div>
        </div>

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
                {quote.quotation_items.map(item => (
                    <tr key={item.id} className="border-b">
                        <td className="p-2 align-top">{item.category}</td>
                        <td className="p-2 align-top">{item.kols?.name || '自訂項目'}</td>
                        <td className="p-2 align-top whitespace-pre-wrap">{item.service}</td>
                        <td className="text-center p-2 align-top">{item.quantity}</td>
                        <td className="text-right p-2 align-top">NT$ {item.price.toLocaleString()}</td>
                        <td className="p-2 align-top">{item.remark || ''}</td>
                    </tr>
                ))}
            </tbody>
        </table>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8 border-t pt-6">
            <div className="text-xs space-y-2">
                <h4 className="font-bold text-sm mb-1">廣告費之支付約定：</h4>
                <ol className="list-decimal list-inside space-y-1 text-gray-600">
                    <li>本次廣告行銷費用由委託公司負責繳付，所有費用代收百分之五的營業稅。</li>
                    <li>本公司應於執行到期日開立當月份發票予委刊客戶，委刊客戶應於收到發票時，按發票日期月結30日依發票所載之金額匯入本公司指定帳戶如下。所有報酬及因本服務契約書產生之相關費用均以本服務契約書內載明之幣值及約定付款日付款。</li>
                </ol>
                <div className="mt-2 p-2 bg-gray-100 rounded">
                    <p className="font-semibold">本公司銀行帳戶資料如下：</p>
                    <p>銀行名稱：{companyBankInfo.bankName}  分行名稱：{companyBankInfo.branchName}</p>
                    <p>銀行帳號：{companyBankInfo.accountNumber}</p>
                    <p>帳號名稱：{companyBankInfo.accountName}</p>
                </div>
            </div>
            <div className="flex flex-col justify-end text-sm space-y-2">
                <div className="flex justify-between"><span className="text-gray-600">項目合計未稅:</span> <span>NT$ {quote.subtotal_untaxed.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">稅金 (5%):</span> <span>NT$ {quote.tax.toLocaleString()}</span></div>
                <div className="flex justify-between font-bold text-lg border-t pt-2 mt-2"><span>合計含稅:</span> <span>NT$ {quote.grand_total_taxed.toLocaleString()}</span></div>
                {quote.has_discount && (<div className="flex justify-between text-indigo-600 font-bold text-lg border-t border-indigo-200 pt-2 mt-2"><span>專案優惠價:</span> <strong>NT$ {quote.discounted_price?.toLocaleString()}</strong></div>)}
            </div>
        </div>

        {quote.terms && (<div className="mb-6"><h4 className="text-md font-semibold text-gray-800 mb-2">合約條款</h4><div className="text-xs text-gray-600 bg-gray-50 p-4 rounded-md whitespace-pre-wrap">{quote.terms}</div></div>)}
        {quote.remarks && (<div className="mb-8"><h4 className="text-md font-semibold text-gray-800 mb-2">專案備註</h4><div className="text-sm text-gray-700 bg-yellow-50 border border-yellow-200 p-4 rounded-md">{quote.remarks}</div></div>)}
        
        <div className="grid grid-cols-2 gap-8 pt-16">
            <div><p className="mb-12">委刊客戶簽署:</p><div className="border-t pt-2 text-sm text-gray-600">公司印鑑</div></div>
            <div><p className="mb-12">安安娛樂簽署:</p><div className="border-t pt-2 text-sm text-gray-600">公司印鑑</div></div>
        </div>
        <div className="text-right mt-4 text-sm">委刊日期: {new Date(quote.created_at).toLocaleDateString('zh-TW')}</div>
      </div>
    </div>
  )
}