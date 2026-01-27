// src/components/pdf/QuotePDFDocument.tsx
// 使用 @react-pdf/renderer 生成報價單 PDF
import { Document, Page, Text, View, StyleSheet, Font, Image } from '@react-pdf/renderer';
import { Database } from '@/types/database.types';

// 註冊中文字型（使用 Noto Sans TC）
// 注意：需要確保 public/fonts 目錄下有對應的字型檔案
Font.register({
    family: 'NotoSansTC',
    fonts: [
        { src: '/fonts/NotoSansTC-Regular.ttf', fontWeight: 'normal' },
        // 如果沒有 Bold 字型，使用 Regular 替代
        { src: '/fonts/NotoSansTC-Regular.ttf', fontWeight: 'bold' },
    ],
});

// 型別定義
type Quotation = Database['public']['Tables']['quotations']['Row'];
type QuotationItem = Database['public']['Tables']['quotation_items']['Row'];
type Client = Database['public']['Tables']['clients']['Row'];
type Kol = Database['public']['Tables']['kols']['Row'];

export type FullQuotation = Quotation & {
    clients: Client | null;
    quotation_items: (QuotationItem & {
        kols: Pick<Kol, 'name'> | null;
    })[];
};

interface QuotePDFDocumentProps {
    quote: FullQuotation;
    electronicSealEnabled?: boolean;
    sealStampEnabled?: boolean;
}

// 公司銀行資訊
const companyBankInfo = {
    bankName: '國泰世華銀行(013)',
    branchName: '文山分行',
    accountName: '安安娛樂有限公司',
    accountNumber: '103-03-500480-1',
};

// 樣式定義
const styles = StyleSheet.create({
    page: {
        fontFamily: 'NotoSansTC',
        fontSize: 10,
        padding: 40,
        backgroundColor: '#ffffff',
    },
    header: {
        textAlign: 'center',
        marginBottom: 15,
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#d1d5db',
    },
    logo: {
        width: 60,
        height: 30,
        marginBottom: 5,
        alignSelf: 'center',
    },
    title: {
        fontSize: 14,
        fontWeight: 'bold',
    },
    // 資訊表格
    infoTable: {
        marginBottom: 15,
        borderWidth: 1,
        borderColor: '#d1d5db',
    },
    infoRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#d1d5db',
    },
    infoLabel: {
        width: '18%',
        padding: 6,
        backgroundColor: '#f9fafb',
        fontWeight: 'bold',
        fontSize: 9,
    },
    infoValue: {
        width: '32%',
        padding: 6,
        fontSize: 9,
    },
    infoValueFull: {
        width: '82%',
        padding: 6,
        fontSize: 9,
    },
    // 項目表格
    table: {
        marginBottom: 15,
        borderWidth: 1,
        borderColor: '#d1d5db',
    },
    tableHeader: {
        flexDirection: 'row',
        backgroundColor: '#f9fafb',
        borderBottomWidth: 1,
        borderBottomColor: '#d1d5db',
    },
    tableRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
    },
    tableRowGroupStart: {
        flexDirection: 'row',
        borderTopWidth: 2,
        borderTopColor: '#9ca3af',
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
    },
    // 表格欄位
    colCategory: { width: '12%', padding: 5, textAlign: 'center', fontSize: 8 },
    colKol: { width: '14%', padding: 5, textAlign: 'center', fontSize: 8 },
    colService: { width: '28%', padding: 5, textAlign: 'center', fontSize: 8 },
    colPrice: { width: '14%', padding: 5, textAlign: 'right', fontSize: 8 },
    colQty: { width: '10%', padding: 5, textAlign: 'center', fontSize: 8 },
    colTotal: { width: '14%', padding: 5, textAlign: 'right', fontSize: 8, fontWeight: 'bold' },
    // 分類首行樣式
    colCategoryHighlight: { width: '12%', padding: 5, textAlign: 'center', fontSize: 8, backgroundColor: '#f3f4f6', fontWeight: 'bold' },
    colKolHighlight: { width: '14%', padding: 5, textAlign: 'center', fontSize: 8, backgroundColor: '#dbeafe', fontWeight: 'bold' },
    headerText: {
        fontWeight: 'bold',
        fontSize: 9,
    },
    // 金額區塊
    summarySection: {
        flexDirection: 'row',
        marginBottom: 15,
    },
    paymentTerms: {
        width: '60%',
        paddingRight: 15,
    },
    summaryTable: {
        width: '40%',
        borderWidth: 1,
        borderColor: '#d1d5db',
    },
    summaryRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#d1d5db',
    },
    summaryLabel: {
        width: '50%',
        padding: 6,
        backgroundColor: '#f9fafb',
        fontWeight: 'bold',
        fontSize: 9,
    },
    summaryValue: {
        width: '50%',
        padding: 6,
        textAlign: 'right',
        fontSize: 9,
    },
    summaryValueHighlight: {
        width: '50%',
        padding: 6,
        textAlign: 'right',
        fontSize: 9,
        fontWeight: 'bold',
        color: '#dc2626',
    },
    // 條款區塊
    termsSection: {
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#d1d5db',
        padding: 8,
    },
    termsTitle: {
        fontSize: 10,
        fontWeight: 'bold',
        marginBottom: 5,
        backgroundColor: '#f9fafb',
        padding: 5,
        marginTop: -8,
        marginLeft: -8,
        marginRight: -8,
    },
    termsText: {
        fontSize: 8,
        lineHeight: 1.4,
    },
    // 銀行資訊
    bankInfo: {
        backgroundColor: '#f9fafb',
        padding: 8,
        marginTop: 8,
        borderRadius: 4,
    },
    bankInfoText: {
        fontSize: 8,
        marginBottom: 2,
    },
    // 簽章區
    signatureSection: {
        flexDirection: 'row',
        marginTop: 20,
        justifyContent: 'space-between',
    },
    signatureBox: {
        width: '45%',
        textAlign: 'center',
        borderWidth: 1,
        borderColor: '#d1d5db',
        padding: 20,
        minHeight: 80,
    },
    signatureTitle: {
        fontSize: 10,
        fontWeight: 'bold',
    },
});

// 格式化金額
const formatCurrency = (amount: number | null | undefined): string => {
    if (amount === null || amount === undefined) return '$0';
    return `$${amount.toLocaleString()}`;
};

// 處理表格資料（排序）
const processTableData = (items: (QuotationItem & { kols: Pick<Kol, 'name'> | null })[]) => {
    // 按分類、KOL 排序
    const sortedItems = [...items].sort((a, b) => {
        const categoryA = a.category || 'N/A';
        const categoryB = b.category || 'N/A';
        if (categoryA !== categoryB) return categoryA.localeCompare(categoryB);

        const kolA = a.kols?.name || 'N/A';
        const kolB = b.kols?.name || 'N/A';
        return kolA.localeCompare(kolB);
    });

    return sortedItems.map((item, index) => {
        const prevItem = index > 0 ? sortedItems[index - 1] : null;
        const isNewCategory = !prevItem || prevItem.category !== item.category;
        const isNewKol = isNewCategory || prevItem?.kols?.name !== item.kols?.name;

        return {
            item,
            isNewCategory,
            isNewKol,
        };
    });
};

// PDF 文件元件
export const QuotePDFDocument: React.FC<QuotePDFDocumentProps> = ({
    quote,
    electronicSealEnabled = false,
    sealStampEnabled = false
}) => {
    const termsParts = quote.terms ? quote.terms.split('保密協議：') : [''];
    const contractAgreement = termsParts[0].replace('合約約定：', '').trim();
    const confidentialityAgreement = termsParts.length > 1 ? termsParts[1].trim() : '';

    // 計算優惠價
    const hasDiscountPrice = quote.has_discount && typeof quote.discounted_price === 'number';
    const discountedTax = hasDiscountPrice ? Math.round(quote.discounted_price! * 0.05) : 0;
    const discountedGrandTotal = hasDiscountPrice ? quote.discounted_price! + discountedTax : 0;

    const tableData = processTableData(quote.quotation_items);

    return (
        <Document>
            <Page size="A4" style={styles.page}>
                {/* 標題 */}
                <View style={styles.header}>
                    <Text style={styles.title}>安安娛樂有限公司委刊專案契約書</Text>
                </View>

                {/* 客戶資訊表 */}
                <View style={styles.infoTable}>
                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>專案名稱：</Text>
                        <View style={styles.infoValueFull}>
                            <Text>{quote.project_name}</Text>
                            <Text style={{ fontSize: 8, color: '#6b7280' }}>
                                開立時間：{quote.created_at ? new Date(quote.created_at).toLocaleDateString() : 'N/A'}
                            </Text>
                        </View>
                    </View>
                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>委刊客戶：</Text>
                        <Text style={styles.infoValue}>{quote.clients?.name || 'N/A'}</Text>
                        <Text style={styles.infoLabel}>客戶聯絡人：</Text>
                        <Text style={styles.infoValue}>{quote.client_contact || 'N/A'}</Text>
                    </View>
                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>統一編號：</Text>
                        <Text style={styles.infoValue}>{quote.clients?.tin || 'N/A'}</Text>
                        <Text style={styles.infoLabel}>聯絡人電話：</Text>
                        <Text style={styles.infoValue}>{quote.contact_phone || quote.clients?.phone || 'N/A'}</Text>
                    </View>
                    <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
                        <Text style={styles.infoLabel}>地址：</Text>
                        <Text style={styles.infoValue}>{quote.clients?.address || 'N/A'}</Text>
                        <Text style={styles.infoLabel}>電子郵件：</Text>
                        <Text style={styles.infoValue}>{quote.contact_email || quote.clients?.email || 'N/A'}</Text>
                    </View>
                </View>

                {/* 項目表格 */}
                <View style={styles.table}>
                    {/* 表頭 */}
                    <View style={styles.tableHeader}>
                        <Text style={[styles.colCategory, styles.headerText]}>分類</Text>
                        <Text style={[styles.colKol, styles.headerText]}>KOL</Text>
                        <Text style={[styles.colService, styles.headerText]}>服務內容</Text>
                        <Text style={[styles.colPrice, styles.headerText]}>單價</Text>
                        <Text style={[styles.colQty, styles.headerText]}>數量</Text>
                        <Text style={[styles.colTotal, styles.headerText]}>合計</Text>
                    </View>

                    {/* 表格內容 */}
                    {tableData.map((row, index) => {
                        const itemTotal = (row.item.price || 0) * (row.item.quantity || 1);
                        const rowStyle = row.isNewCategory ? styles.tableRowGroupStart : styles.tableRow;

                        return (
                            <View key={index} style={rowStyle} wrap={false}>
                                <Text style={row.isNewCategory ? styles.colCategoryHighlight : styles.colCategory}>
                                    {row.isNewCategory ? (row.item.category || 'N/A') : ''}
                                </Text>
                                <Text style={row.isNewKol ? styles.colKolHighlight : styles.colKol}>
                                    {row.isNewKol ? (row.item.kols?.name || 'N/A') : ''}
                                </Text>
                                <Text style={styles.colService}>{row.item.service}</Text>
                                <Text style={styles.colPrice}>{formatCurrency(row.item.price)}</Text>
                                <Text style={styles.colQty}>{row.item.quantity || 1}</Text>
                                <Text style={styles.colTotal}>{formatCurrency(itemTotal)}</Text>
                            </View>
                        );
                    })}
                </View>

                {/* 金額與付款條款 */}
                <View style={styles.summarySection}>
                    {/* 付款條款 */}
                    <View style={styles.paymentTerms}>
                        <View style={styles.termsSection}>
                            <Text style={styles.termsTitle}>【廣告費之支付約定】</Text>
                            <Text style={styles.termsText}>
                                1. 本次廣告行銷費用由委託公司負責繳付，所有費用代收百分之五的營業稅。銀行手續費由支付方負擔。
                            </Text>
                            <Text style={styles.termsText}>
                                2. 本公司應於執行到期日開立當月份發票予委刊客戶，委刊客戶應於收到發票時，按發票日期月結30日依發票所載之金額匯入本公司指定帳戶。
                            </Text>
                            <Text style={styles.termsText}>
                                3. 所有報酬及因本服務契約書產生之相關費用均以本服務契約書內載明之幣值及約定付款日付款。
                            </Text>
                            <View style={styles.bankInfo}>
                                <Text style={styles.bankInfoText}>銀行名稱：{companyBankInfo.bankName}　　銀行帳號：{companyBankInfo.accountNumber}</Text>
                                <Text style={styles.bankInfoText}>分行名稱：{companyBankInfo.branchName}　　帳戶名稱：{companyBankInfo.accountName}</Text>
                            </View>
                        </View>
                    </View>

                    {/* 金額匯總 */}
                    <View style={styles.summaryTable}>
                        {hasDiscountPrice ? (
                            <>
                                <View style={styles.summaryRow}>
                                    <Text style={styles.summaryLabel}>未稅小計</Text>
                                    <Text style={[styles.summaryValue, { color: '#9ca3af' }]}>{formatCurrency(quote.subtotal_untaxed)}</Text>
                                </View>
                                <View style={styles.summaryRow}>
                                    <Text style={[styles.summaryLabel, { backgroundColor: '#dbeafe' }]}>未稅優惠</Text>
                                    <Text style={[styles.summaryValue, { color: '#2563eb', fontWeight: 'bold' }]}>{formatCurrency(quote.discounted_price)}</Text>
                                </View>
                                <View style={styles.summaryRow}>
                                    <Text style={styles.summaryLabel}>營業稅 (5%)</Text>
                                    <Text style={styles.summaryValue}>{formatCurrency(discountedTax)}</Text>
                                </View>
                                <View style={[styles.summaryRow, { borderBottomWidth: 0 }]}>
                                    <Text style={[styles.summaryLabel, { backgroundColor: '#fee2e2' }]}>含稅總計</Text>
                                    <Text style={styles.summaryValueHighlight}>{formatCurrency(discountedGrandTotal)}</Text>
                                </View>
                            </>
                        ) : (
                            <>
                                <View style={styles.summaryRow}>
                                    <Text style={styles.summaryLabel}>未稅小計</Text>
                                    <Text style={styles.summaryValue}>{formatCurrency(quote.subtotal_untaxed)}</Text>
                                </View>
                                <View style={styles.summaryRow}>
                                    <Text style={styles.summaryLabel}>營業稅 (5%)</Text>
                                    <Text style={styles.summaryValue}>{formatCurrency(quote.tax)}</Text>
                                </View>
                                <View style={[styles.summaryRow, { borderBottomWidth: 0 }]}>
                                    <Text style={[styles.summaryLabel, { backgroundColor: '#fee2e2' }]}>含稅總計</Text>
                                    <Text style={styles.summaryValueHighlight}>{formatCurrency(quote.grand_total_taxed)}</Text>
                                </View>
                            </>
                        )}
                    </View>
                </View>

                {/* 合約條款 */}
                {contractAgreement && (
                    <View style={styles.termsSection}>
                        <Text style={styles.termsTitle}>【合約約定】</Text>
                        <Text style={styles.termsText}>{contractAgreement}</Text>
                    </View>
                )}

                {/* 保密協議 */}
                {confidentialityAgreement && (
                    <View style={styles.termsSection}>
                        <Text style={styles.termsTitle}>【保密協議】</Text>
                        <Text style={styles.termsText}>{confidentialityAgreement}</Text>
                    </View>
                )}

                {/* 補充協議 */}
                {quote.remarks && (
                    <View style={styles.termsSection}>
                        <Text style={styles.termsTitle}>【補充協議】</Text>
                        <Text style={styles.termsText}>{quote.remarks}</Text>
                    </View>
                )}

                {/* 簽章區 */}
                <View style={styles.signatureSection}>
                    <View style={styles.signatureBox}>
                        <Text style={styles.signatureTitle}>安安娛樂簽章</Text>
                    </View>
                    <View style={styles.signatureBox}>
                        <Text style={styles.signatureTitle}>委刊方簽章</Text>
                    </View>
                </View>
            </Page>
        </Document>
    );
};

export default QuotePDFDocument;
