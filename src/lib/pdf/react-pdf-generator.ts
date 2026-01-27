'use client';

// src/lib/pdf/react-pdf-generator.ts
// 使用 @react-pdf/renderer 生成 PDF
import { pdf } from '@react-pdf/renderer';
import React from 'react';
import { QuotePDFDocument, FullQuotation } from '@/components/pdf/QuotePDFDocument';

export interface ReactPDFOptions {
    filename: string;
    quote: FullQuotation;
    electronicSealEnabled?: boolean;
    sealStampEnabled?: boolean;
}

/**
 * 使用 @react-pdf/renderer 生成並下載 PDF
 */
export async function generateQuotePDF(options: ReactPDFOptions): Promise<void> {
    const { filename, quote, electronicSealEnabled, sealStampEnabled } = options;

    try {
        // 建立 PDF 文件元素
        const doc = React.createElement(QuotePDFDocument, {
            quote,
            electronicSealEnabled,
            sealStampEnabled,
        });

        // 生成 blob
        const blob = await pdf(doc as any).toBlob();

        // 建立下載連結
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('PDF 生成失敗:', error);
        throw new Error(`PDF 生成失敗: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export default generateQuotePDF;
