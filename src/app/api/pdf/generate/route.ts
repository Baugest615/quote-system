// src/app/api/pdf/generate/route.ts
// Puppeteer PDF 生成 API - 兼容 Vercel 部署
import { NextRequest, NextResponse } from 'next/server';
import puppeteer, { Browser, Page } from 'puppeteer-core';

// 動態 import @sparticuz/chromium 避免本地開發問題
async function getBrowser(): Promise<Browser> {
    const isDev = process.env.NODE_ENV === 'development';

    if (isDev) {
        // 本地開發：使用系統的 Chrome
        const executablePath = process.platform === 'win32'
            ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
            : process.platform === 'darwin'
                ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
                : '/usr/bin/google-chrome';

        return puppeteer.launch({
            headless: true,
            executablePath,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
    } else {
        // Vercel 部署：使用 @sparticuz/chromium (v112)
        const chromium = await import('@sparticuz/chromium');

        return puppeteer.launch({
            args: chromium.default.args,
            defaultViewport: chromium.default.defaultViewport,
            executablePath: await chromium.default.executablePath(),
            headless: chromium.default.headless,
        });
    }
}

export async function POST(request: NextRequest) {
    let browser: Browser | null = null;

    try {
        const body = await request.json();
        const {
            quoteId,
            html,
            filename = 'quote.pdf',
            sealStampEnabled = false,
            sealStampImage = '',
            electronicSealEnabled = false,
        } = body;

        if (!html) {
            return NextResponse.json({ error: '缺少 HTML 內容' }, { status: 400 });
        }

        console.log(`[PDF API] Received HTML length: ${html.length}`);
        console.log(`[PDF API] HTML Preview: ${html.substring(0, 200)}...`);

        // 啟動瀏覽器
        browser = await getBrowser();
        const page: Page = await browser.newPage();

        // 設定視窗大小為 A4
        await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });

        // 直接設定 HTML 內容 (HTML Injection)
        // 改用 domcontentloaded 避免因圖片加載緩慢而超時
        await page.setContent(html, {
            waitUntil: 'domcontentloaded',
            timeout: 60000,
        });

        // 等待內容載入完成 (確保 DOM 已渲染)
        try {
            await page.waitForSelector('#printable-quote', { timeout: 10000 });
        } catch (e) {
            // 如果找不到 selector，記錄當前頁面內容以便除錯
            const content = await page.content();
            console.error('[PDF API] Selector #printable-quote not found. Page content:', content.substring(0, 500));
            throw e;
        }

        // 生成 PDF
        // 生成 PDF
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
                top: '10mm',
                right: '10mm',
                bottom: '10mm',
                left: '10mm',
            },
        });

        // 如果需要騎縫章，使用 pdf-lib 添加
        let finalPdf = Buffer.from(pdfBuffer as any);

        if (sealStampEnabled && sealStampImage) {
            console.log('[PDF API] Adding seal stamp...');
            finalPdf = await addSealStampToPdf(finalPdf, sealStampImage);
        } else {
            console.log('[PDF API] Seal stamp skipped. Enabled:', sealStampEnabled, 'Image provided:', !!sealStampImage);
        }

        // 返回 PDF
        return new NextResponse(finalPdf, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
            },
        });

    } catch (error) {
        console.error('PDF 生成錯誤:', error);
        return NextResponse.json(
            { error: `PDF 生成失敗: ${error instanceof Error ? error.message : String(error)}` },
            { status: 500 }
        );
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

/**
 * 使用 pdf-lib 添加騎縫章到 PDF
 */
async function addSealStampToPdf(pdfBuffer: Buffer, stampImageBase64: string): Promise<Buffer> {
    try {
        const { PDFDocument } = await import('pdf-lib');

        const pdfDoc = await PDFDocument.load(pdfBuffer);
        const pages = pdfDoc.getPages();
        const totalPages = pages.length;

        // 解析 base64 圖片
        // 確保移除 data URL prefix
        const imageData = stampImageBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');

        // 簡單驗證是否為有效的 base64
        if (!imageData || imageData.length < 100) {
            console.warn('[PDF API] Invalid base64 image data for seal stamp');
            return pdfBuffer;
        }

        const imageBytes = Buffer.from(imageData, 'base64');

        // 嵌入圖片
        let stampImage;
        try {
            // 嘗試作為 PNG 加載
            stampImage = await pdfDoc.embedPng(imageBytes);
        } catch (e) {
            console.log('[PDF API] Failed to embed as PNG, trying JPG...');
            try {
                stampImage = await pdfDoc.embedJpg(imageBytes);
            } catch (e2) {
                console.error('[PDF API] Failed to embed custom seal image:', e2);
                return pdfBuffer;
            }
        }

        const stampSize = 80; // 騎縫章大小 (稍微加大)

        // 實作「上下頁騎縫章」 (Page Connection Seal)
        // 在每一頁的底部和下一頁的頂部各蓋一半
        for (let i = 0; i < totalPages - 1; i++) {
            const pageCurrent = pages[i];
            const pageNext = pages[i + 1];
            const { width, height } = pageCurrent.getSize();

            // 水平置中
            const xPosition = width / 2 - stampSize / 2;

            // 1. 在當前頁面底部蓋章 (顯示上半部)
            // PDF 座標原點在左下角 (0,0)
            // 將圖片中心點放在底部邊緣 (y = 0)
            // drawImage 是指定左下角位置，所以 y = -stampSize / 2
            pageCurrent.drawImage(stampImage, {
                x: xPosition,
                y: -stampSize / 2, // 一半在頁面外
                width: stampSize,
                height: stampSize,
                opacity: 0.8,
            });

            // 2. 在下一頁頂部蓋章 (顯示下半部)
            // 將圖片中心點放在頂部邊緣 (y = height)
            // drawImage y = height - stampSize / 2
            pageNext.drawImage(stampImage, {
                x: xPosition,
                y: height - stampSize / 2, // 一半在頁面外
                width: stampSize,
                height: stampSize,
                opacity: 0.8,
            });
        }

        // 如果只有一頁，則蓋在右下角作為普通章
        if (totalPages === 1) {
            const page = pages[0];
            const { width } = page.getSize();
            page.drawImage(stampImage, {
                x: width - stampSize - 20,
                y: 20,
                width: stampSize,
                height: stampSize,
                opacity: 0.8,
            });
        }

        const modifiedPdfBytes = await pdfDoc.save();
        return Buffer.from(modifiedPdfBytes);

    } catch (error) {
        console.error('添加騎縫章失敗:', error);
        // 如果添加騎縫章失敗，返回原始 PDF
        return pdfBuffer;
    }
}
