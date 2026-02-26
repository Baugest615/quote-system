// src/lib/pdf/enhanced-pdf-generator.ts - 簡化版
import { SealStampConfig } from '@/components/pdf/SealStampManager';

export interface PDFExportOptions {
  filename: string;
  elementId: string;
  watermark?: {
    enabled: boolean;
    imagePath: string;
    opacity: number;
    size: { width: number; height: number };
  };
  sealStamp?: SealStampConfig; // 只保留騎縫章設定
  pageOptions?: {
    margin: [number, number, number, number];
    format: 'a4' | 'letter';
    orientation: 'portrait' | 'landscape';
  };
}

export class EnhancedPDFGenerator {
  private defaultOptions: PDFExportOptions = {
    filename: 'document.pdf',
    elementId: 'printable-quote',
    watermark: {
      enabled: true,
      imagePath: '/watermark-an.png',
      opacity: 0.05,
      size: { width: 0.7, height: 0.4 },
    },
    pageOptions: {
      margin: [0.2, 0.3, 0.2, 0.3],
      format: 'a4',
      orientation: 'portrait',
    },
  };

  private async loadImageAsBase64(imageSrc: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject('Could not get canvas context');
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = (e) => reject(`Failed to load image from src: ${imageSrc}. Error: ${e}`);
      img.src = imageSrc;
    });
  }

  private async getRotatedImage(imageBase64: string, rotation: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject('Could not get canvas context for rotation');

        const rads = (rotation * Math.PI) / 180;
        const sin = Math.abs(Math.sin(rads));
        const cos = Math.abs(Math.cos(rads));
        const newWidth = img.width * cos + img.height * sin;
        const newHeight = img.width * sin + img.height * cos;

        canvas.width = newWidth;
        canvas.height = newHeight;

        ctx.translate(newWidth / 2, newHeight / 2);
        ctx.rotate(rads);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);

        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = (e) => reject(`Failed to load image for rotation. Error: ${e}`);
      img.src = imageBase64;
    });
  }

  public async generatePDF(options: Partial<PDFExportOptions>): Promise<void> {
    const config = { ...this.defaultOptions, ...options };
    const element = document.getElementById(config.elementId);
    if (!element) throw new Error(`找不到 ID 為 "${config.elementId}" 的元素`);

    try {
      const { default: html2pdf } = await import('html2pdf.js');
      const elementToPrint = this.prepareElementForPrint(element);

      // 添加 PDF 專用樣式類別
      elementToPrint.classList.add('pdf-export');

      const worker = html2pdf().set({
        margin: config.pageOptions!.margin,
        filename: config.filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2, useCORS: true, backgroundColor: '#ffffff',
          // 【修正】優化 html2canvas 設定以正確處理樣式
          onclone: (clonedDoc: Document) => {
            // 在克隆的文檔中確保樣式正確應用
            const clonedElement = clonedDoc.getElementById(config.elementId);
            if (clonedElement) {
              // 移除所有可能導致黑線的 text-decoration 樣式
              const allElements = clonedElement.querySelectorAll('*');
              allElements.forEach((el) => {
                const htmlEl = el as HTMLElement;
                if (htmlEl.style) {
                  htmlEl.style.textDecoration = 'none';
                  htmlEl.style.textDecorationLine = 'none';
                  htmlEl.style.textDecorationStyle = 'none';
                  htmlEl.style.textDecorationColor = 'transparent';
                }
              });

              // 修復 .section-title 負邊距導致右側邊框被截斷
              const sectionTitles = clonedElement.querySelectorAll('.section-title');
              sectionTitles.forEach(title => {
                const titleEl = title as HTMLElement;
                titleEl.style.margin = '0 0 10px 0';
                titleEl.style.padding = '6px 12px';
                titleEl.style.borderBottom = '1px solid #d1d5db';
              });
              // section 本身移除 padding，由內容自帶
              const sections = clonedElement.querySelectorAll('.section');
              sections.forEach(section => {
                const sectionEl = section as HTMLElement;
                sectionEl.style.padding = '0';
                sectionEl.style.overflow = 'hidden';
                // 為非 section-title 的子元素加 padding
                Array.from(sectionEl.children).forEach(child => {
                  const childEl = child as HTMLElement;
                  if (!childEl.classList.contains('section-title')) {
                    childEl.style.padding = '8px 12px 12px';
                  }
                });
              });

              // 確保容器不超出頁面寬度
              clonedElement.style.maxWidth = '100%';
              clonedElement.style.overflow = 'hidden';
              clonedElement.style.boxSizing = 'border-box';

              // 確保表格邊框樣式
              const tables = clonedElement.querySelectorAll('table');
              tables.forEach(table => {
                const tableEl = table as HTMLElement;
                tableEl.style.borderCollapse = 'collapse';
                tableEl.style.border = '1px solid #d1d5db';
                tableEl.style.tableLayout = 'fixed';
                tableEl.style.maxWidth = '100%';
              });

              // 確保所有 td, th 都有正確的邊框
              const cells = clonedElement.querySelectorAll('td, th');
              cells.forEach(cell => {
                const cellEl = cell as HTMLElement;
                cellEl.style.border = '1px solid #d1d5db';
                cellEl.style.overflowWrap = 'break-word';
              });

              // no-border 表格排除邊框（銀行資訊等）
              const noBorderTables = clonedElement.querySelectorAll('.no-border');
              noBorderTables.forEach(table => {
                (table as HTMLElement).style.border = 'none';
                table.querySelectorAll('td, th').forEach(cell => {
                  (cell as HTMLElement).style.border = 'none';
                });
              });
            }
          }
        },

        jsPDF: { unit: 'in', format: config.pageOptions!.format, orientation: config.pageOptions!.orientation, compress: true },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
      }).from(elementToPrint);

      await worker.toPdf().get('pdf').then(async (pdf: any) => {
        const totalPages = pdf.internal.getNumberOfPages();
        if (config.watermark?.enabled) {
          await this.addWatermark(pdf, totalPages, config.watermark);
        }

        if (config.sealStamp?.enabled && config.sealStamp.stampImage) {
          let sealImage = await this.loadImageAsBase64(config.sealStamp.stampImage);
          if (config.sealStamp.rotation !== 0) {
            sealImage = await this.getRotatedImage(sealImage, config.sealStamp.rotation);
          }
          await this.addSealStamp(pdf, totalPages, config.sealStamp, sealImage);
        }
      }).save();

      // 【清理】移除 PDF 專用樣式類別
      elementToPrint.classList.remove('pdf-export');

    } catch (error) {
      console.error('PDF 生成失敗:', error);
      throw new Error(`PDF 生成失敗: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private prepareElementForPrint(element: HTMLElement): HTMLElement {
    const elementToPrint = element.cloneNode(true) as HTMLElement;
    // 移除不需要的樣式
    elementToPrint.classList.remove('border', 'shadow-md', 'rounded-lg');
    // 移除現有浮水印（將由 PDF 處理）
    const existingWatermark = elementToPrint.querySelector('img[alt="watermark"]');
    if (existingWatermark) existingWatermark.remove();

    // 【關鍵修正】移除 rowSpan 並填充儲存格，避免 pdf 渲染問題
    this.removeRowSpans(elementToPrint);

    // 確保表格樣式正確
    const tables = elementToPrint.querySelectorAll('table');
    tables.forEach(table => {
      table.style.borderCollapse = 'collapse';
    });

    return elementToPrint;
  }

  /**
   * 移除表格中的 rowSpan，將合併儲存格展開為每行獨立的儲存格
   * 只處理有 rowSpan > 1 的表格，避免影響其他表格
   */
  private removeRowSpans(element: HTMLElement): void {
    const tables = element.querySelectorAll('table');

    tables.forEach(table => {
      const tbody = table.querySelector('tbody');
      if (!tbody) return;

      const rows = Array.from(tbody.querySelectorAll('tr'));
      if (rows.length === 0) return;

      // 🔧 檢查這個表格是否有 rowSpan > 1 的儲存格
      // 如果沒有，就跳過這個表格（避免影響公司資訊等只用 colSpan 的表格）
      let hasRowSpan = false;
      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll('td, th'));
        for (const cell of cells) {
          if ((cell as HTMLTableCellElement).rowSpan > 1) {
            hasRowSpan = true;
            break;
          }
        }
        if (hasRowSpan) break;
      }
      if (!hasRowSpan) return; // 這個表格沒有 rowSpan，跳過

      // 計算實際的欄數（從表頭計算）
      const thead = table.querySelector('thead tr');
      const headerCells = thead ? thead.querySelectorAll('th, td') : null;
      const actualCols = headerCells ? headerCells.length : 6;

      // 建立虛擬表格來追蹤每個格子的佔用狀態
      const grid: { occupied: boolean; cell: HTMLTableCellElement | null; originalText: string }[][] = [];

      // 初始化 grid
      for (let r = 0; r < rows.length; r++) {
        grid[r] = [];
        for (let c = 0; c < actualCols; c++) {
          grid[r][c] = { occupied: false, cell: null, originalText: '' };
        }
      }

      // 第一遍：遍歷所有行，記錄 rowSpan 佔用的格子
      rows.forEach((row, rowIndex) => {
        const cells = Array.from(row.querySelectorAll('td, th')) as HTMLTableCellElement[];
        let colIndex = 0;

        cells.forEach(cell => {
          // 跳過已被佔用的格子
          while (colIndex < actualCols && grid[rowIndex][colIndex].occupied) {
            colIndex++;
          }
          if (colIndex >= actualCols) return;

          const rowSpan = cell.rowSpan || 1;
          const colSpan = cell.colSpan || 1;
          const cellText = cell.textContent || '';

          // 標記這個儲存格佔用的所有位置
          for (let r = 0; r < rowSpan && (rowIndex + r) < rows.length; r++) {
            for (let c = 0; c < colSpan && (colIndex + c) < actualCols; c++) {
              grid[rowIndex + r][colIndex + c] = {
                occupied: true,
                cell: r === 0 && c === 0 ? cell : null,
                originalText: cellText
              };
            }
          }

          // 如果有 rowSpan > 1，移除它
          if (rowSpan > 1) {
            cell.removeAttribute('rowspan');
          }

          colIndex += colSpan;
        });
      });

      // 第二遍：為被 rowSpan 佔用的位置插入填充儲存格
      rows.forEach((row, rowIndex) => {
        const newRow: Node[] = [];

        for (let colIndex = 0; colIndex < actualCols; colIndex++) {
          const gridCell = grid[rowIndex][colIndex];

          if (!gridCell.occupied) {
            break; // 超出表格範圍
          }

          if (gridCell.cell !== null) {
            // 這是原始儲存格的位置，添加防截斷樣式
            gridCell.cell.style.breakInside = 'avoid';
            newRow.push(gridCell.cell);
          } else {
            // 這是被 rowSpan 佔用的位置，創建填充儲存格
            // 顯示原始文字（淺灰色）以保持可讀性
            const newCell = document.createElement('td');
            newCell.textContent = gridCell.originalText ? `↳ ${gridCell.originalText}` : '';
            newCell.style.border = '1px solid #d1d5db';
            newCell.style.padding = '0.5rem';
            newCell.style.textAlign = 'center';
            newCell.style.verticalAlign = 'middle';
            newCell.style.color = '#9ca3af'; // 淺灰色
            newCell.style.fontSize = '0.85em';
            newCell.style.breakInside = 'avoid';
            newRow.push(newCell);
          }
        }

        // 添加防截斷樣式到行
        (row as HTMLElement).style.breakInside = 'avoid';
        (row as HTMLElement).style.pageBreakInside = 'avoid';

        // 清空原本的行並重新添加儲存格
        while (row.firstChild) {
          row.removeChild(row.firstChild);
        }
        newRow.forEach(cell => row.appendChild(cell));
      });
    });
  }

  private async addWatermark(pdf: any, totalPages: number, watermarkConfig: NonNullable<PDFExportOptions['watermark']>): Promise<void> {
    for (let i = 1; i <= totalPages; i++) {
      pdf.setPage(i);
      pdf.setGState(new pdf.GState({ opacity: watermarkConfig.opacity }));
      const { width, height } = pdf.internal.pageSize;
      const imgWidth = width * watermarkConfig.size.width;
      const imgHeight = height * watermarkConfig.size.height;
      const x = (width - imgWidth) / 2;
      const y = (height - imgHeight) / 2;
      pdf.addImage(watermarkConfig.imagePath, 'PNG', x, y, imgWidth, imgHeight);
      pdf.setGState(new pdf.GState({ opacity: 1 }));
    }
  }

  private async addSealStamp(pdf: any, totalPages: number, config: SealStampConfig, stampImage: string): Promise<void> {
    const { width, height } = pdf.internal.pageSize;
    const stampSize = config.size;

    for (let i = 1; i <= totalPages; i++) {
      try {
        pdf.setPage(i);
        pdf.setGState(new pdf.GState({ opacity: config.opacity }));

        if (config.position === 'right' || config.position === 'left') {
          const y_center = (config.overlayPages && totalPages > 1) ? (height / totalPages) * (i - 0.5) : height / 2;
          const y_topLeft = y_center - (stampSize / 2) + config.offsetY;
          const x_topLeft = (config.position === 'right')
            ? width - (stampSize / 2) + config.offsetX
            : -(stampSize / 2) + config.offsetX;
          pdf.addImage(stampImage, 'PNG', x_topLeft, y_topLeft, stampSize, stampSize);
        } else if (config.position === 'top' || config.position === 'bottom') {
          const x_center = width / 2 + config.offsetX;
          const x_topLeft = x_center - (stampSize / 2);
          if (i > 1) {
            const y_topLeft_top = 0 - (stampSize / 2) + config.offsetY;
            pdf.addImage(stampImage, 'PNG', x_topLeft, y_topLeft_top, stampSize, stampSize, `seal-top-${i}`);
          }
          if (i < totalPages) {
            const y_topLeft_bottom = height - (stampSize / 2) + config.offsetY;
            pdf.addImage(stampImage, 'PNG', x_topLeft, y_topLeft_bottom, stampSize, stampSize, `seal-bottom-${i}`);
          }
        }

        pdf.setGState(new pdf.GState({ opacity: 1 }));
      } catch (e) {
        console.error(`在第 ${i} 頁添加騎縫章時發生錯誤:`, e);
      }
    }
  }
}

export const pdfGenerator = new EnhancedPDFGenerator();