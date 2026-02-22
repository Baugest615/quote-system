// src/app/api/pdf/generate/route.ts
// Puppeteer PDF 生成 API - 兼容 Vercel 部署
import { NextRequest, NextResponse } from 'next/server';
import puppeteer, { Browser, Page } from 'puppeteer-core';
import { createServerClient } from '@/lib/supabase/server';
import { PAGE_PERMISSIONS, PAGE_KEYS, UserRole } from '@/types/custom.types';
import { isDev, serverEnv } from '@/lib/env';

// 動態 import @sparticuz/chromium 避免本地開發問題
async function getBrowser(): Promise<Browser> {
    const puppeteerPath = serverEnv.puppeteerExecutablePath;

    if (isDev) {
        // 本地開發：自動偵測可用的 Chromium 核心瀏覽器
        const { existsSync } = await import('fs');
        const candidates: string[] = process.platform === 'win32'
            ? [
                'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
                'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
            ]
            : process.platform === 'darwin'
                ? [
                    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
                    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
                    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
                    '/Applications/Chromium.app/Contents/MacOS/Chromium',
                ]
                : ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium'];

        const executablePath = candidates.find(p => existsSync(p));
        if (!executablePath) {
            throw new Error(`找不到 Chromium 核心瀏覽器。請安裝 Chrome、Brave 或 Edge，或設定 PUPPETEER_EXECUTABLE_PATH 環境變數。`);
        }
        console.log(`[PDF API] Using local browser: ${executablePath}`);

        return puppeteer.launch({
            headless: true,
            executablePath,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
    }

    // Railway Docker 環境：使用系統安裝的 Chromium
    if (puppeteerPath) {
        console.log('[PDF API] Using system Chromium from:', puppeteerPath);
        return puppeteer.launch({
            headless: true,
            executablePath: puppeteerPath,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
            ],
        });
    }

    // Vercel 或其他環境：使用 @sparticuz/chromium
    const chromium = await import('@sparticuz/chromium');

    return puppeteer.launch({
        args: (chromium.default as any).args,
        defaultViewport: (chromium.default as any).defaultViewport,
        executablePath: await (chromium.default as any).executablePath(),
        headless: (chromium.default as any).headless,
    });
}

export async function POST(request: NextRequest) {
    // 驗證使用者身份
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: '未授權：請先登入' }, { status: 401 });
    }

    // 權限檢查：確認使用者有報價單存取權限
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    const userRole = profile?.role as UserRole | null;
    if (!userRole || !PAGE_PERMISSIONS[PAGE_KEYS.QUOTES]?.allowedRoles.includes(userRole)) {
        return NextResponse.json({ error: '無權限：您無法產生 PDF' }, { status: 403 });
    }

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

        // 將 #printable-quote 直接搬到 body 下，保留 <style> 標籤
        await page.evaluate(() => {
            const el = document.getElementById('printable-quote');
            if (el) {
                // 先收集所有 <style> 元素（包含 print page 的 inline CSS）
                const styles = Array.from(document.querySelectorAll('style'));
                document.body.innerHTML = '';
                // 先放回所有樣式
                styles.forEach(s => document.body.appendChild(s));
                // 再放入報價單內容
                document.body.appendChild(el);
            }
        });

        // 注入 PDF 專用樣式：白底 + CJK 字體
        await page.addStyleTag({
            content: `
                html, body {
                    background: white !important;
                    color: #1f2937 !important;
                    margin: 0 !important;
                    padding: 0 !important;
                }
                #printable-quote {
                    width: 100% !important;
                    max-width: 100% !important;
                    padding: 0 !important;
                    margin: 0 !important;
                }
                body, body *, #printable-quote, #printable-quote * {
                    font-family: 'Heiti TC', 'Apple LiGothic', 'STHeiti', 'PingFang TC',
                                 'Noto Sans TC', 'Microsoft JhengHei', system-ui, sans-serif !important;
                }
            `
        });

        // 等待字體載入完成
        await page.evaluate(() => document.fonts.ready);

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
