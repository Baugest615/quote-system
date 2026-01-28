// 測試 PDF 生成的簡單 HTML
const testHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <title>PDF 生成測試</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Microsoft JhengHei', sans-serif; padding: 20px; }
    </style>
</head>
<body>
    <div id="printable-quote">
        <h1>PDF 生成測試</h1>
        <p>這是一個測試文件，用於驗證 Puppeteer PDF 生成功能。</p>
        <table border="1" style="width: 100%; margin-top: 20px;">
            <thead>
                <tr>
                    <th>項目</th>
                    <th>數量</th>
                    <th>單價</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>測試項目 1</td>
                    <td>2</td>
                    <td>$1,000</td>
                </tr>
            </tbody>
        </table>
    </div>
</body>
</html>
`;

// 測試 API
async function testPdfGeneration() {
    try {
        console.log('開始測試 PDF 生成...');

        const response = await fetch('http://localhost:3000/api/pdf/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                html: testHtml,
                filename: 'test.pdf',
                sealStampEnabled: false,
                electronicSealEnabled: false,
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            console.error('❌ PDF 生成失敗:', error);
            return;
        }

        console.log('✅ PDF 生成成功！');
        console.log('Response status:', response.status);
        console.log('Content-Type:', response.headers.get('Content-Type'));

        // 將 PDF 儲存為檔案
        const blob = await response.blob();
        console.log('PDF 大小:', blob.size, 'bytes');

    } catch (error) {
        console.error('❌ 測試失敗:', error);
    }
}

// 執行測試
testPdfGeneration();
