'use client'

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import supabase from '@/lib/supabase/client';
import { Database } from '@/types/database.types';
import { Button } from '@/components/ui/button';
import { Edit, Trash2, Printer, ArrowLeft } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
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

// 公司銀行資訊
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
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      
      // 載入字體
      const fontResponse = await fetch('/fonts/NotoSansTC-Regular.ttf');
      if (!fontResponse.ok) {
          throw new Error(`字體檔案載入失敗: ${fontResponse.statusText}`);
      }
      const fontBuffer = await fontResponse.arrayBuffer();
      const fontBase64 = btoa(new Uint8Array(fontBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));

      pdf.addFileToVFS('NotoSansTC-Regular.ttf', fontBase64);
      pdf.addFont('NotoSansTC-Regular.ttf', 'NotoSansTC', 'normal');
      pdf.setFont('NotoSansTC', 'normal');

      let y = 20;
      const margin = 15;
      
      // === 精美標題區塊 ===
      pdf.setFontSize(16);
      pdf.setTextColor(31, 45, 61); // 深灰藍色
      
      // 標題背景
      pdf.setFillColor(248, 250, 252);
      pdf.rect(margin, y - 5, pageWidth - 2 * margin, 15, 'F');
      
      // 標題文字
      pdf.text('安安娛樂有限公司委刊專案契約書', pageWidth / 2, y + 3, { align: 'center' });
      
      // 標題底線
      pdf.setLineWidth(0.5);
      pdf.setDrawColor(99, 102, 241); // 藍色
      pdf.line(margin + 10, y + 8, pageWidth - margin - 10, y + 8);
      
      y += 20;

      // === 美化基本資訊區塊 ===
      pdf.setFontSize(9);
      pdf.setTextColor(55, 65, 81); // 深灰色
      
      // 基本資訊背景
      pdf.setFillColor(249, 250, 251);
      pdf.rect(margin, y, pageWidth - 2 * margin, 24, 'F');
      
      y += 5;
      const infoStartY = y;
      const leftColX = margin + 5;
      const rightColX = pageWidth / 2 + 5;
      
      // 左欄
      pdf.text(`專案名稱: ${quote.project_name}`, leftColX, y);
      y += 5;
      pdf.text(`客戶聯絡人: ${quote.client_contact || 'N/A'}`, leftColX, y);
      y += 5;
      pdf.text(`發票抬頭: ${quote.clients?.invoice_title || 'N/A'}`, leftColX, y);
      y += 5;
      pdf.text(`付款方式: ${quote.payment_method}`, leftColX, y);
      
      // 右欄
      y = infoStartY;
      pdf.text(`委刊客戶: ${quote.clients?.name || 'N/A'}`, rightColX, y);
      y += 5;
      pdf.text(`統一編號: ${quote.clients?.tin || 'N/A'}`, rightColX, y);
      y += 5;
      pdf.text(`發票寄送地址: ${quote.clients?.address || 'N/A'}`, rightColX, y);
      
      y = infoStartY + 30;
      
      // === 優化項目表格（修復寬度問題）===
      const tableHeaders = [['類別', 'KOL/項目', '執行內容', '數量', '價格', '備註']];
      const tableData = quote.quotation_items.map(item => [
          item.category || '',
          item.kols?.name || '自訂項目',
          item.service.length > 25 ? item.service.substring(0, 25) + '...' : item.service, // 限制長度
          item.quantity.toString(),
          `NT$ ${item.price.toLocaleString()}`,
          (item.remark || '').length > 15 ? (item.remark || '').substring(0, 15) + '...' : (item.remark || '') // 限制備註長度
      ]);

      autoTable(pdf, {
        startY: y,
        head: tableHeaders,
        body: tableData,
        theme: 'striped',
        styles: { 
          font: 'NotoSansTC', 
          fontSize: 8,
          cellPadding: 3,
          fontStyle: 'normal',
          textColor: [55, 65, 81],
          fillColor: [255, 255, 255]
        },
        headStyles: { 
          fillColor: [99, 102, 241], // 藍色表頭
          textColor: [255, 255, 255], // 白色文字
          fontStyle: 'normal',
          fontSize: 8,
          halign: 'center'
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252] // 淺灰色交替行
        },
        columnStyles: {
          0: { cellWidth: 18, halign: 'center' }, // 類別
          1: { cellWidth: 22, halign: 'center' }, // KOL/項目
          2: { cellWidth: 50, halign: 'left' },   // 執行內容
          3: { cellWidth: 12, halign: 'center' }, // 數量
          4: { cellWidth: 22, halign: 'right' },  // 價格
          5: { cellWidth: 31, halign: 'left' }    // 備註
        },
        margin: { left: margin, right: margin },
        tableWidth: 'wrap'
      });

      y = (pdf as any).lastAutoTable.finalY + 15;

      // === 美化兩欄布局：付款條款 + 金額統計 ===
      const sectionBgColor: [number, number, number] = [249, 250, 251];
      const leftSectionX = margin;
      const leftSectionWidth = (pageWidth - 3 * margin) * 0.58; // 58% 寬度給付款條款
      const rightSectionX = leftSectionX + leftSectionWidth + margin;
      const rightSectionWidth = (pageWidth - 3 * margin) * 0.42; // 42% 寬度給金額

      const sectionStartY = y;

      // 左側：付款條款區塊
      pdf.setFillColor(...sectionBgColor);
      pdf.rect(leftSectionX, y, leftSectionWidth, 50, 'F');
      
      y += 5;
      pdf.setFontSize(9);
      pdf.setTextColor(31, 45, 61);
      pdf.text('廣告費之支付約定', leftSectionX + 3, y);
      
      y += 5;
      pdf.setFontSize(7);
      pdf.setTextColor(75, 85, 99);
      
      const paymentTerms = [
        '1. 本次廣告行銷費用由委託公司負責繳付，所有費用代收百分之五的營業稅。',
        '2. 本公司應於執行到期日開立當月份發票予委刊客戶，委刊客戶應於收到發票時，按發票日期月結30日依發票所載之金額匯入本公司指定帳戶如下。'
      ];

      paymentTerms.forEach(term => {
        const termLines = pdf.splitTextToSize(term, leftSectionWidth - 6);
        pdf.text(termLines, leftSectionX + 3, y);
        y += termLines.length * 3 + 2;
      });

      y += 2;

      // 銀行帳戶資訊框
      pdf.setFillColor(255, 255, 255);
      pdf.setDrawColor(209, 213, 219);
      pdf.rect(leftSectionX + 3, y, leftSectionWidth - 6, 18, 'FD');
      
      y += 4;
      pdf.setFontSize(7);
      pdf.setTextColor(31, 45, 61);
      pdf.text('本公司銀行帳戶資料', leftSectionX + 6, y);
      y += 3;
      pdf.setTextColor(75, 85, 99);
      pdf.text(`銀行：${companyBankInfo.bankName} 分行：${companyBankInfo.branchName}`, leftSectionX + 6, y);
      y += 3;
      pdf.text(`帳號：${companyBankInfo.accountNumber}`, leftSectionX + 6, y);
      y += 3;
      pdf.text(`戶名：${companyBankInfo.accountName}`, leftSectionX + 6, y);

      // 右側：金額統計區塊
      const rightY = sectionStartY;
      pdf.setFillColor(...sectionBgColor);
      pdf.rect(rightSectionX, rightY, rightSectionWidth, 50, 'F');
      
      let currentRightY = rightY + 8;
      pdf.setFontSize(9);
      pdf.setTextColor(75, 85, 99);
      
      // 金額項目
      const amounts = [
        { label: '項目合計未稅', value: quote.subtotal_untaxed },
        { label: '稅金 (5%)', value: quote.tax },
      ];
      
      amounts.forEach(item => {
        pdf.text(item.label + ':', rightSectionX + 3, currentRightY);
        pdf.text(`NT$ ${item.value.toLocaleString()}`, rightSectionX + rightSectionWidth - 3, currentRightY, { align: 'right' });
        currentRightY += 5;
      });
      
      // 合計含稅（強調）
      pdf.setDrawColor(99, 102, 241);
      pdf.line(rightSectionX + 3, currentRightY - 1, rightSectionX + rightSectionWidth - 3, currentRightY - 1);
      currentRightY += 2;
      
      pdf.setFontSize(10);
      pdf.setTextColor(31, 45, 61);
      pdf.text('合計含稅:', rightSectionX + 3, currentRightY);
      pdf.text(`NT$ ${quote.grand_total_taxed.toLocaleString()}`, rightSectionX + rightSectionWidth - 3, currentRightY, { align: 'right' });
      currentRightY += 6;
      
      // 優惠價格
      if(quote.has_discount && quote.discounted_price) {
        pdf.setTextColor(99, 102, 241);
        pdf.text('專案優惠價:', rightSectionX + 3, currentRightY);
        pdf.text(`NT$ ${quote.discounted_price.toLocaleString()}`, rightSectionX + rightSectionWidth - 3, currentRightY, { align: 'right' });
      }

      y = sectionStartY + 60;

      // === 合約條款和備註 ===
      if (quote.terms) {
        pdf.setFontSize(9);
        pdf.setTextColor(31, 45, 61);
        pdf.text('合約條款', margin, y);
        y += 5;
        
        pdf.setFontSize(7);
        pdf.setTextColor(75, 85, 99);
        const termsLines = pdf.splitTextToSize(quote.terms, pageWidth - 2 * margin);
        pdf.text(termsLines, margin, y);
        y += termsLines.length * 3 + 8;
      }

      if (quote.remarks) {
        pdf.setFontSize(9);
        pdf.setTextColor(31, 45, 61);
        pdf.text('專案備註', margin, y);
        y += 5;
        
        pdf.setFontSize(7);
        pdf.setTextColor(75, 85, 99);
        const remarkLines = pdf.splitTextToSize(quote.remarks, pageWidth - 2 * margin);
        pdf.text(remarkLines, margin, y);
        y += remarkLines.length * 3 + 8;
      }

      // 檢查是否需要新頁面
      if (y > pageHeight - 60) {
        pdf.addPage();
        y = 30;
      }

      // === 精美簽署欄 ===
      pdf.setFillColor(248, 250, 252);
      pdf.rect(margin, y, pageWidth - 2 * margin, 35, 'F');
      
      y += 8;
      pdf.setFontSize(9);
      pdf.setTextColor(31, 45, 61);
      
      const signatureLeftX = margin + 15;
      const signatureRightX = pageWidth / 2 + 15;
      
      pdf.text('委刊客戶簽署', signatureLeftX, y);
      pdf.text('安安娛樂簽署', signatureRightX, y);
      y += 12;
      
      // 簽名線
      pdf.setLineWidth(0.5);
      pdf.setDrawColor(156, 163, 175);
      pdf.line(signatureLeftX, y, signatureLeftX + 60, y);
      pdf.line(signatureRightX, y, signatureRightX + 60, y);
      y += 6;
      
      pdf.setFontSize(7);
      pdf.setTextColor(107, 114, 128);
      pdf.text('公司印鑑', signatureLeftX, y);
      pdf.text('公司印鑑', signatureRightX, y);
      
      // 日期
      y += 8;
      pdf.setFontSize(8);
      pdf.text(`委刊日期：${new Date(quote.created_at).toLocaleDateString('zh-TW')}`, pageWidth - margin, y, { align: 'right' });
      
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
          <Link href="/dashboard/quotes" className="text-sm text-gray-500 hover:text-indigo-600 flex items-center mb-2">
            <ArrowLeft className="h-4 w-4 mr-1"/> 返回列表
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
            {isPrinting ? 'PDF產生中...' : <><Printer className="mr-2 h-4 w-4" /> 輸出成 PDF</>}
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={isPrinting}>
            <Trash2 className="mr-2 h-4 w-4" /> 刪除
          </Button>
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
          <div className="flex flex-col justify-end text-right space-y-2">
            <div>項目合計未稅: NT$ {quote.subtotal_untaxed.toLocaleString()}</div>
            <div>稅金 (5%): NT$ {quote.tax.toLocaleString()}</div>
            <div className="text-lg font-bold border-t pt-2">合計含稅: NT$ {quote.grand_total_taxed.toLocaleString()}</div>
            {quote.has_discount && quote.discounted_price && (
              <div className="text-indigo-600 font-bold">專案優惠價: NT$ {quote.discounted_price.toLocaleString()}</div>
            )}
          </div>
        </div>

        {quote.terms && (
          <div className="mb-6 text-xs space-y-4">
            <h4 className="font-bold">合約條款：</h4>
            <div className="whitespace-pre-wrap">{quote.terms}</div>
          </div>
        )}

        {quote.remarks && (
          <div className="mb-6 text-xs space-y-4">
            <h4 className="font-bold">專案備註：</h4>
            <div className="whitespace-pre-wrap">{quote.remarks}</div>
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
          委刊日期：{new Date(quote.created_at).toLocaleDateString('zh-TW')}
        </div>
      </div>
    </div>
  );
}