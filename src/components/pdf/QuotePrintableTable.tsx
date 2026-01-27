// src/components/pdf/QuotePrintableTable.tsx
// PDF 專用表格 - 不使用 rowSpan 避免 html2pdf.js 跑版
'use client';

import { Database } from '@/types/database.types';

type QuotationItem = Database['public']['Tables']['quotation_items']['Row'];
type Kol = Database['public']['Tables']['kols']['Row'];

interface QuotePrintableTableProps {
    items: (QuotationItem & { kols: Pick<Kol, 'name'> | null })[];
}

/**
 * PDF 專用的表格元件 - 使用非 rowSpan 的方式渲染
 * 每行都有完整的 6 個欄位，但重複的分類/KOL 顯示淺色或空白
 */
export function QuotePrintableTable({ items }: QuotePrintableTableProps) {
    // 排序項目
    const sortedItems = [...items].sort((a, b) => {
        const categoryA = a.category || 'N/A';
        const categoryB = b.category || 'N/A';
        if (categoryA !== categoryB) return categoryA.localeCompare(categoryB);

        const kolA = a.kols?.name || 'N/A';
        const kolB = b.kols?.name || 'N/A';
        return kolA.localeCompare(kolB);
    });

    // 追蹤顯示過的分類和 KOL
    const seenCategories = new Set<string>();
    const seenKols = new Set<string>();

    return (
        <table className="w-full border border-gray-300 mb-6 text-xs" style={{ borderCollapse: 'collapse' }}>
            <thead>
                <tr className="bg-gray-50">
                    <th className="border p-2 text-center" style={{ width: '12%' }}>分類</th>
                    <th className="border p-2 text-center" style={{ width: '14%' }}>KOL</th>
                    <th className="border p-2 text-center" style={{ width: '30%' }}>服務內容</th>
                    <th className="border p-2 text-center" style={{ width: '14%' }}>單價</th>
                    <th className="border p-2 text-center" style={{ width: '10%' }}>數量</th>
                    <th className="border p-2 text-center" style={{ width: '14%' }}>合計</th>
                </tr>
            </thead>
            <tbody>
                {sortedItems.map((item, index) => {
                    const category = item.category || 'N/A';
                    const kol = item.kols?.name || 'N/A';
                    const kolKey = `${category}|${kol}`;
                    const itemTotal = (item.price || 0) * (item.quantity || 1);

                    const isFirstInCategory = !seenCategories.has(category);
                    const isFirstInKol = !seenKols.has(kolKey);

                    if (isFirstInCategory) seenCategories.add(category);
                    if (isFirstInKol) seenKols.add(kolKey);

                    return (
                        <tr key={index} style={{ breakInside: 'avoid' }}>
                            {/* 分類 */}
                            <td
                                className="border p-2 text-center align-middle font-medium"
                                style={{
                                    backgroundColor: isFirstInCategory ? '#f9fafb' : 'transparent',
                                    borderTop: isFirstInCategory ? '2px solid #6b7280' : undefined,
                                }}
                            >
                                {isFirstInCategory ? category : ''}
                            </td>

                            {/* KOL */}
                            <td
                                className="border p-2 text-center align-middle font-medium"
                                style={{
                                    backgroundColor: isFirstInKol ? '#dbeafe' : 'transparent',
                                    borderTop: isFirstInCategory ? '2px solid #6b7280' : undefined,
                                }}
                            >
                                {isFirstInKol ? kol : ''}
                            </td>

                            {/* 服務內容 */}
                            <td
                                className="border p-2 text-center"
                                style={{ borderTop: isFirstInCategory ? '2px solid #6b7280' : undefined }}
                            >
                                {item.service}
                            </td>

                            {/* 單價 */}
                            <td
                                className="border p-2 text-right"
                                style={{ borderTop: isFirstInCategory ? '2px solid #6b7280' : undefined }}
                            >
                                ${item.price?.toLocaleString() || '0'}
                            </td>

                            {/* 數量 */}
                            <td
                                className="border p-2 text-center"
                                style={{ borderTop: isFirstInCategory ? '2px solid #6b7280' : undefined }}
                            >
                                {item.quantity || 1}
                            </td>

                            {/* 合計 */}
                            <td
                                className="border p-2 text-right font-semibold"
                                style={{ borderTop: isFirstInCategory ? '2px solid #6b7280' : undefined }}
                            >
                                ${itemTotal.toLocaleString()}
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}

export default QuotePrintableTable;
