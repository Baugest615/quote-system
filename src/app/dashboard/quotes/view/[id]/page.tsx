'use client'

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import supabase from '@/lib/supabase/client';
import { Database } from '@/types/database.types';
import { Button } from '@/components/ui/button';
import { Edit, Trash2, Printer, ArrowLeft } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable'; // ✅ 改為具名引入函式
import type { UserOptions } from 'jspdf-autotable';

// 告訴 TypeScript jsPDF 實例上會有 .autoTable() 方法
interface jsPDFWithAutoTable extends jsPDF {
  autoTable: (options: UserOptions) => jsPDF;
}

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

  const handleExportPDF = async () => {
    if (!quote || isPrinting) return;
    setIsPrinting(true);

    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      const fontResponse = await fetch('/fonts/NotoSansTC-Regular.ttf');
      if (!fontResponse.ok) {
          throw new Error(`字體檔案載入失敗: ${fontResponse.statusText} (請確認 public/fonts 資料夾與檔案名稱正確，並已重啟伺服器)`);
      }
      const fontBuffer = await fontResponse.arrayBuffer();
      const fontBase64 = btoa(new Uint8Array(fontBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));

      pdf.addFileToVFS('NotoSansTC-Regular.ttf', fontBase64);
      pdf.addFont('NotoSansTC-Regular.ttf', 'NotoSansTC', 'normal');
      pdf.setFont('NotoSansTC');

      let y = 15;
      
      pdf.setFontSize(20);
      pdf.text('安安娛樂有限公司委刊專案契約書', pdf.internal.pageSize.getWidth() / 2, y, { align: 'center' });
      y += 15;

      pdf.setFontSize(10);
      pdf.text(`專案名稱: ${quote.project_name}`, 14, y);
      pdf.text(`委刊客戶: ${quote.clients?.name || 'N/A'}`, 105, y);
      y += 7;
      pdf.text(`客戶聯絡人: ${quote.client_contact || 'N/A'}`, 14, y);
      pdf.text(`統一編號: ${quote.clients?.tin || 'N/A'}`, 105, y);
      y += 7;
      pdf.text(`發票抬頭: ${quote.clients?.invoice_title || 'N/A'}`, 14, y);
      pdf.text(`發票寄送地址: ${quote.clients?.address || 'N/A'}`, 105, y);
      y += 7;
      pdf.text(`付款方式: ${quote.payment_method}`, 14, y);
      y += 10;
      
      const tableHeaders = [['類別', 'KOL/項目', '執行內容', '數量', '價格', '備註']];
      const tableData = quote.quotation_items.map(item => [
          item.category || '',
          item.kols?.name || '自訂項目',
          item.service,
          item.quantity.toString(),
          `NT$ ${item.price.toLocaleString()}`,
          item.remark || ''
      ]);

      autoTable(pdf, {
        startY: y,
        head: tableHeaders,
        body: tableData,
        theme: 'grid',
        styles: { font: 'NotoSansTC', fontSize: 8 },
        headStyles: { fillColor: [243, 244, 246], textColor: [20, 20, 20] },
      });

        y = (pdf as any).lastAutoTable.finalY + 10;

        const rightAlignX = pdf.internal.pageSize.getWidth() - 15;
        pdf.setFontSize(10);
              pdf.text(`項目合計未稅: NT$ ${quote.subtotal_untaxed.toLocaleString()}`, rightAlignX, y, { align: 'right' });
              y += 7;
              pdf.text(`稅金 (5%): NT$ ${quote.tax.toLocaleString()}`, rightAlignX, y, { align: 'right' });
              y += 7;
              pdf.setFontSize(12);
              pdf.text(`合計含稅: NT$ ${quote.grand_total_taxed.toLocaleString()}`, rightAlignX, y, { align: 'right' });
              
              if(quote.has_discount && quote.discounted_price) {
                y += 7;
                pdf.setTextColor(79, 70, 229);
                pdf.text(`專案優惠價: NT$ ${quote.discounted_price.toLocaleString()}`, rightAlignX, y, { align: 'right' });
                pdf.setTextColor(0, 0, 0);

                const terms = quote.terms || '（無合約條款）';
        const termsLines = pdf.splitTextToSize(terms, 180);
        pdf.text(termsLines, 14, y);
        y += termsLines.length * 5 + 10;

        if (quote.remarks) {
          pdf.setFontSize(10);
          pdf.setTextColor(0);
          pdf.text('專案備註：', 14, y);
          y += 6;
          const remarkLines = pdf.splitTextToSize(quote.remarks, 180);
          pdf.text(remarkLines, 14, y);
          y += remarkLines.length * 5 + 10;
        }

        // 簽署欄
        pdf.setFontSize(10);
        pdf.setTextColor(0);
        pdf.text('委刊客戶簽署：', 14, y);
        pdf.text('安安娛樂簽署：', 110, y);
        y += 20;
        pdf.line(14, y, 80, y);     // 客戶簽名線
        pdf.line(110, y, 180, y);   // 公司簽名線
        y += 6;
        pdf.setFontSize(8);
        pdf.text('公司印鑑', 14, y);
        pdf.text('公司印鑑', 110, y);
        y += 10;

        // 日期
        pdf.setFontSize(10);
        pdf.text(`委刊日期：${new Date(quote.created_at).toLocaleDateString('zh-TW')}`, 180, y, { align: 'right' });
      }
      
      const fileName = `報價單-${quote?.clients?.name || '客戶'}-${quote?.project_name}.pdf`;
      pdf.save(fileName);

    } catch (error) {
      console.error("PDF 匯出失敗:", error);
      alert(`PDF 匯出失敗: ${error instanceof Error ? error.message : '未知錯誤'}`);
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
          <Button variant="outline" onClick={handleExportPDF} disabled={isPrinting}>{isPrinting ? 'PDF產生中...' : <><Printer className="mr-2 h-4 w-4" /> 輸出成 PDF</>}</Button>
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