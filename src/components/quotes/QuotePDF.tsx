import React from 'react';
import { Page, Text, View, Document, StyleSheet, Font } from '@react-pdf/renderer';
import type { QuoteWithRelations } from '@/types/database'; // 引入您專案的類型

// --- 字型註冊 ---
// 請確認您已將中文字型檔 (例如 NotoSansTC-Regular.ttf) 放在 /public/fonts/ 資料夾下
Font.register({
  family: 'Noto Sans TC',
  fonts: [
    { src: '/fonts/NotoSansTC-Regular.ttf' },
    // 如有粗體字重，可一併註冊
    // { src: '/fonts/NotoSansTC-Bold.ttf', fontWeight: 'bold' }, 
  ],
});

// --- PDF 樣式定義 ---
const styles = StyleSheet.create({
    page: {
        fontFamily: 'Noto Sans TC',
        padding: 35,
        fontSize: 10,
        backgroundColor: '#ffffff',
        color: '#333333',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 25,
        borderBottomWidth: 2,
        borderBottomColor: '#eeeeee',
        paddingBottom: 10,
    },
    headerTitle: {
        fontSize: 26,
    },
    headerInfo: {
        textAlign: 'right',
        fontSize: 11,
        lineHeight: 1.5,
    },
    section: {
        marginBottom: 20,
    },
    sectionTitle: {
        fontSize: 14,
        marginBottom: 10,
        backgroundColor: '#f7f7f7',
        padding: 8,
        borderRadius: 3,
    },
    infoBlock: {
        lineHeight: 1.6,
        fontSize: 11,
    },
    table: {
        display: "flex",
        width: 'auto',
        borderStyle: 'solid',
        borderWidth: 1,
        borderColor: '#e0e0e0',
    },
    tableRow: {
        flexDirection: 'row',
        borderBottomColor: '#e0e0e0',
        borderBottomWidth: 1,
        alignItems: 'center',
    },
    tableHeader: {
        backgroundColor: '#f7f7f7',
        fontSize: 11,
    },
    tableCol: {
        padding: 8,
        borderRightColor: '#e0e0e0',
        borderRightWidth: 1,
    },
    colLast: {
        borderRightWidth: 0,
    },
    colName: { width: '35%' },
    colSpec: { width: '35%' },
    colQty: { width: '10%', textAlign: 'right' },
    colPrice: { width: '10%', textAlign: 'right' },
    colTotal: { width: '10%', textAlign: 'right' },
    notesSection: {
        marginTop: 20,
        padding: 10,
        backgroundColor: '#f7f7f7',
        borderRadius: 3,
        fontSize: 9,
        lineHeight: 1.4,
    },
    footer: {
        position: 'absolute',
        bottom: 30,
        left: 35,
        right: 35,
        textAlign: 'center',
        fontSize: 8,
        color: 'grey',
    },
    totalSection: {
        marginTop: 20,
        flexDirection: 'row',
        justifyContent: 'flex-end',
    },
    totalBox: {
        width: '45%',
    },
    totalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 4,
    },
    totalAmount: {
        fontSize: 14,
    },
});

interface QuotePDFProps {
  quote: QuoteWithRelations;
}

export const QuotePDF: React.FC<QuotePDFProps> = ({ quote }) => {
    const subtotal = quote.total_amount ? quote.total_amount / 1.05 : 0;
    const tax = quote.total_amount ? quote.total_amount - subtotal : 0;

    return (
        <Document title={`報價單_${quote.project_name}`}>
            <Page size="A4" style={styles.page}>
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>報價單</Text>
                    <View style={styles.headerInfo}>
                        <Text>單號: {quote.id}</Text>
                        <Text>報價日期: {new Date(quote.quote_date).toLocaleDateString('zh-TW')}</Text>
                        <Text>有效期限: {new Date(quote.valid_until).toLocaleDateString('zh-TW')}</Text>
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>客戶資訊</Text>
                    <Text style={styles.infoBlock}>客戶名稱: {quote.clients?.name || 'N/A'}</Text>
                    <Text style={styles.infoBlock}>專案名稱: {quote.project_name}</Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>報價項目</Text>
                    <View style={styles.table}>
                        <View style={[styles.tableRow, styles.tableHeader]}>
                            <Text style={[styles.tableCol, styles.colName]}>項目</Text>
                            <Text style={[styles.tableCol, styles.colSpec]}>規格</Text>
                            <Text style={[styles.tableCol, styles.colQty]}>數量</Text>
                            <Text style={[styles.tableCol, styles.colPrice]}>單價</Text>
                            <Text style={[styles.tableCol, styles.colTotal, styles.colLast]}>總價</Text>
                        </View>
                        {quote.quote_items.map((item) => (
                            <View key={item.id} style={styles.tableRow}>
                                <Text style={[styles.tableCol, styles.colName]}>{item.name}</Text>
                                <Text style={[styles.tableCol, styles.colSpec]}>{item.spec}</Text>
                                <Text style={[styles.tableCol, styles.colQty]}>{item.quantity}</Text>
                                <Text style={[styles.tableCol, styles.colPrice]}>{item.price?.toLocaleString()}</Text>
                                <Text style={[styles.tableCol, styles.colTotal, styles.colLast]}>{(item.quantity && item.price ? item.quantity * item.price : 0).toLocaleString()}</Text>
                            </View>
                        ))}
                    </View>
                </View>

                <View style={styles.totalSection}>
                    <View style={styles.totalBox}>
                        <View style={styles.totalRow}><Text>稅前合計</Text><Text>NT$ {subtotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text></View>
                        <View style={styles.totalRow}><Text>營業稅 (5%)</Text><Text>NT$ {tax.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text></View>
                        <View style={[styles.totalRow, { marginTop: 5, paddingTop: 5, borderTop: '1 solid #dddddd' }]}><Text style={styles.totalAmount}>總計金額</Text><Text style={styles.totalAmount}>NT$ {quote.total_amount?.toLocaleString()}</Text></View>
                    </View>
                </View>

                {quote.notes && (
                    <View style={styles.notesSection}><Text>備註：</Text><Text>{quote.notes}</Text></View>
                )}

                <Text style={styles.footer}>感謝您的合作，若有任何問題，請隨時與我們聯繫。</Text>
            </Page>
        </Document>
    );
};