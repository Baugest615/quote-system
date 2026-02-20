// src/app/print/quote/[id]/page.tsx
// 專供 Puppeteer PDF 渲染的列印頁面
import { createServerClient } from '@/lib/supabase/server';
import { Database } from '@/types/database.types';
import { notFound, redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';

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

// 🔧 表格合併邏輯
function processTableData(items: (QuotationItem & { kols: Pick<Kol, 'name'> | null })[]) {
    // ... existing logic ...
    const sortedItems = [...items].sort((a, b) => {
        const categoryA = a.category || 'N/A';
        const categoryB = b.category || 'N/A';
        if (categoryA !== categoryB) return categoryA.localeCompare(categoryB);
        const kolA = a.kols?.name || 'N/A';
        const kolB = b.kols?.name || 'N/A';
        return kolA.localeCompare(kolB);
    });

    const categoryCount = new Map<string, number>();
    const kolCount = new Map<string, number>();

    sortedItems.forEach(item => {
        const category = item.category || 'N/A';
        const kol = item.kols?.name || 'N/A';
        const kolKey = `${category}|${kol}`;
        categoryCount.set(category, (categoryCount.get(category) || 0) + 1);
        kolCount.set(kolKey, (kolCount.get(kolKey) || 0) + 1);
    });

    const seenCategories = new Set<string>();
    const seenKols = new Set<string>();

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
}

// 伺服器端取得資料
async function getQuote(supabase: SupabaseClient, id: string): Promise<FullQuotation | null> {
    const { data, error } = await supabase
        .from('quotations')
        .select(`
      *,
      clients (*),
      quotation_items (
        *,
        kols ( name )
      )
    `)
        .eq('id', id)
        .single();

    if (error || !data) {
        console.error('Fetching quote failed:', error);
        return null;
    }
    return data as FullQuotation;
}

interface PageProps {
    params: { id: string };
    searchParams: { seal?: string };
}

export default async function PrintQuotePage({ params, searchParams }: PageProps) {
    // 身份驗證（縱深防禦，middleware 已有第一層保護）
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        redirect('/auth/login');
    }

    const quote = await getQuote(supabase, params.id);
    if (!quote) notFound();

    const showElectronicSeal = searchParams.seal === 'true';

    // 計算金額
    let discountedTax = 0;
    let discountedGrandTotal = 0;
    const hasDiscountPrice = quote.has_discount && typeof quote.discounted_price === 'number';

    if (hasDiscountPrice) {
        discountedTax = Math.round(quote.discounted_price! * 0.05);
        discountedGrandTotal = quote.discounted_price! + discountedTax;
    }

    // 取得條款
    const termsParts = quote.terms ? quote.terms.split('保密協議：') : [''];
    const contractAgreement = termsParts[0].replace('合約約定：', '').trim();
    const confidentialityAgreement = termsParts.length > 1 ? termsParts[1].trim() : '';

    return (
        <html>
            <head>
                <meta charSet="utf-8" />
                <title>報價單 - {quote.project_name}</title>
                <style>{`
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body, #printable-quote, #printable-quote * {
            font-family: 'PingFang TC', 'Noto Sans TC', 'Microsoft JhengHei', 'Apple LiGothic', system-ui, sans-serif !important;
          }
          body { font-size: 13px; line-height: 1.5; color: #1f2937; }
          .container { padding: 0; background: white; }
          .header { text-align: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #e5e7eb; }
          .header img { height: 36px; }
          .header h1 { font-size: 18px; font-weight: bold; margin-top: 6px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
          th, td { border: 1px solid #d1d5db; padding: 6px; }
          th { background-color: #f9fafb; text-align: center; font-weight: 600; font-size: 12px; }
          .info-table td { font-size: 12px; }
          .info-label { background-color: #f9fafb; font-weight: bold; white-space: nowrap; width: 100px; }
          .items-table { font-size: 11px; }
          .items-table td { text-align: center; vertical-align: middle; padding: 4px; }
          .items-table .price { text-align: right; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .font-bold { font-weight: bold; }
          .bg-gray { background-color: #f9fafb; }
          .bg-blue { background-color: #dbeafe; }
          .bg-red { background-color: #fee2e2; }
          .text-red { color: #dc2626; }
          .text-blue { color: #2563eb; }
          .text-gray { color: #6b7280; }
          .text-sm { font-size: 12px; }
          .text-xs { font-size: 10px; }
          .section { border: 1px solid #d1d5db; padding: 12px; margin-bottom: 12px; }
          .section-title { font-weight: bold; font-size: 13px; background: #f9fafb; padding: 6px; margin: -12px -12px 10px; border-bottom: 1px solid #d1d5db; }
          .signature-area { display: flex; justify-content: space-between; gap: 24px; margin-top: 24px; }
          .signature-box { width: 48%; text-align: center; border: 1px solid #d1d5db; padding: 12px; height: 110px; display: flex; flex-direction: column; justify-content: space-between; position: relative; }
          .seal-container { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); }
          .seal-image { width: 80px; height: 80px; opacity: 0.9; }
          .break-inside-avoid { break-inside: avoid; page-break-inside: avoid; }
          .line-through { text-decoration: line-through; }
          .no-border, .no-border td { border: none !important; }
        `}</style>
            </head>
            <body>
                <div id="printable-quote" className="container">
                    {/* 頁首 */}
                    <div className="header">
                        <img src="/logo.png" alt="安安娛樂 LOGO" />
                        <h1>安安娛樂有限公司委刊專案契約書</h1>
                    </div>

                    {/* 公司資訊表格 */}
                    <table className="info-table">
                        <tbody>
                            <tr>
                                <td className="info-label">專案名稱：</td>
                                <td colSpan={3}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span>{quote.project_name}</span>
                                        <span className="text-sm text-gray">
                                            開立時間：{quote.created_at ? new Date(quote.created_at).toLocaleDateString() : 'N/A'}
                                        </span>
                                    </div>
                                </td>
                            </tr>
                            <tr>
                                <td className="info-label">委刊客戶：</td>
                                <td>{quote.clients?.name || 'N/A'}</td>
                                <td className="info-label">客戶聯絡人：</td>
                                <td>{quote.client_contact}</td>
                            </tr>
                            <tr>
                                <td className="info-label">統一編號：</td>
                                <td>{quote.clients?.tin || 'N/A'}</td>
                                <td className="info-label">聯絡人電話：</td>
                                <td>{quote.contact_phone || quote.clients?.phone || 'N/A'}</td>
                            </tr>
                            <tr>
                                <td className="info-label">地址：</td>
                                <td>{quote.clients?.address || 'N/A'}</td>
                                <td className="info-label">電子郵件：</td>
                                <td>{quote.contact_email || quote.clients?.email || 'N/A'}</td>
                            </tr>
                        </tbody>
                    </table>

                    {/* 報價項目表格 */}
                    <table className="items-table">
                        <thead>
                            <tr>
                                <th style={{ width: '12%' }}>分類</th>
                                <th style={{ width: '14%' }}>KOL/服務</th>
                                <th style={{ width: '30%' }}>執行內容</th>
                                <th style={{ width: '14%' }}>單價</th>
                                <th style={{ width: '10%' }}>數量</th>
                                <th style={{ width: '14%' }}>合計</th>
                            </tr>
                        </thead>
                        <tbody>
                            {processTableData(quote.quotation_items).map((row, index) => {
                                const itemTotal = (row.item.price || 0) * (row.item.quantity || 1);
                                const showCategory = row.showCategory && row.categoryRowSpan > 0;
                                const showKol = row.showKol && row.kolRowSpan > 0;

                                return (
                                    <tr key={index} className="break-inside-avoid">
                                        {showCategory && (
                                            <td className="bg-gray font-bold" rowSpan={row.categoryRowSpan}>
                                                {row.item.category || 'N/A'}
                                            </td>
                                        )}
                                        {showKol && (
                                            <td className="bg-blue font-bold" rowSpan={row.kolRowSpan}>
                                                {row.item.kols?.name || 'N/A'}
                                            </td>
                                        )}
                                        <td>{row.item.service}</td>
                                        <td className="price">${row.item.price?.toLocaleString() || '0'}</td>
                                        <td>{row.item.quantity || 1}</td>
                                        <td className="price font-bold">${itemTotal.toLocaleString()}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    {/* 金額匯總與付款資訊 */}
                    <table className="break-inside-avoid" style={{ marginBottom: '24px' }}>
                        <tbody>
                            <tr>
                                <td style={{ width: '66%', paddingRight: '24px', verticalAlign: 'top', border: 'none' }}>
                                    <div className="section">
                                        <div className="section-title">【廣告費之支付約定】</div>
                                        <div className="text-xs">
                                            <p style={{ marginBottom: '8px' }}><strong>1.</strong> 本次廣告行銷費用由委託公司負責繳付，所有費用代收百分之五的營業稅。銀行手續費由支付方負擔。</p>
                                            <p style={{ marginBottom: '8px' }}><strong>2.</strong> 本公司應於執行到期日開立當月份發票予委刊客戶，委刊客戶應於收到發票時，按發票日期月結30日依發票所載之金額匯入本公司指定帳戶如下。</p>
                                            <p style={{ marginBottom: '12px' }}><strong>3.</strong> 所有報酬及因本服務契約書產生之相關費用均以本服務契約書內載明之幣值及約定付款日付款。</p>
                                            <div style={{ background: '#f9fafb', padding: '10px', borderRadius: '4px', border: '1px solid #d1d5db' }}>
                                                <table className="no-border" style={{ width: '100%', marginBottom: 0 }}>
                                                    <tbody>
                                                        <tr>
                                                            <td style={{ padding: '2px 0', width: '50%' }}>銀行名稱：{companyBankInfo.bankName}</td>
                                                            <td style={{ padding: '2px 0' }}>銀行帳號：{companyBankInfo.accountNumber}</td>
                                                        </tr>
                                                        <tr>
                                                            <td style={{ padding: '2px 0', width: '50%' }}>分行名稱：{companyBankInfo.branchName}</td>
                                                            <td style={{ padding: '2px 0' }}>帳戶名稱：{companyBankInfo.accountName}</td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </div>
                                </td>
                                <td style={{ width: '34%', verticalAlign: 'top', border: 'none' }}>
                                    <table>
                                        <tbody>
                                            {hasDiscountPrice ? (
                                                <>
                                                    <tr><td className="bg-gray font-bold">未稅小計</td><td className="text-right line-through text-gray">${quote.subtotal_untaxed?.toLocaleString()}</td></tr>
                                                    <tr className="bg-blue"><td className="font-bold">未稅優惠</td><td className="text-right text-blue font-bold">${quote.discounted_price?.toLocaleString()}</td></tr>
                                                    <tr><td className="bg-gray font-bold">營業稅(5%)</td><td className="text-right">${discountedTax.toLocaleString()}</td></tr>
                                                    <tr className="bg-red"><td className="font-bold">含稅總計</td><td className="text-right text-red font-bold" style={{ fontSize: '16px' }}>${discountedGrandTotal.toLocaleString()}</td></tr>
                                                </>
                                            ) : (
                                                <>
                                                    <tr><td className="bg-gray font-bold">未稅小計</td><td className="text-right">${quote.subtotal_untaxed?.toLocaleString()}</td></tr>
                                                    <tr><td className="bg-gray font-bold">營業稅(5%)</td><td className="text-right">${quote.tax?.toLocaleString()}</td></tr>
                                                    <tr className="bg-red"><td className="font-bold">含稅總計</td><td className="text-right text-red font-bold" style={{ fontSize: '16px' }}>${quote.grand_total_taxed?.toLocaleString()}</td></tr>
                                                </>
                                            )}
                                        </tbody>
                                    </table>
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    {/* 條款區塊 */}
                    <div className="break-inside-avoid">
                        {contractAgreement && (
                            <div className="section">
                                <div className="section-title">【合約約定】</div>
                                <p className="text-xs" style={{ whiteSpace: 'pre-wrap' }}>{contractAgreement}</p>
                            </div>
                        )}
                        {confidentialityAgreement && (
                            <div className="section">
                                <div className="section-title">【保密協議】</div>
                                <p className="text-xs" style={{ whiteSpace: 'pre-wrap' }}>{confidentialityAgreement}</p>
                            </div>
                        )}
                        {quote.remarks && (
                            <div className="section">
                                <div className="section-title">【補充協議】</div>
                                <p className="text-xs">{quote.remarks}</p>
                            </div>
                        )}
                    </div>

                    {/* 簽章區 */}
                    <div className="signature-area break-inside-avoid">
                        <div className="signature-box">
                            <p className="font-bold text-sm">安安娛樂簽章</p>
                            {showElectronicSeal && (
                                <div className="seal-container">
                                    <img src="/seals/approved-seal.png" alt="Electronic Seal" className="seal-image" />
                                </div>
                            )}
                        </div>
                        <div className="signature-box">
                            <p className="font-bold text-sm">委刊方簽章</p>
                        </div>
                    </div>
                </div>
            </body>
        </html>
    );
}
