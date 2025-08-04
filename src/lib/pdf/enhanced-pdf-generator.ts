// src/lib/pdf/enhanced-pdf-generator.ts
import { SealStampConfig } from '@/components/pdf/SealStampManager';

export interface PDFExportOptions {
  // 基本設定
  filename: string;
  elementId: string;
  
  // 浮水印設定
  watermark?: {
    enabled: boolean;
    imagePath: string;
    opacity: number;
    size: { width: number; height: number }; // 相對於頁面的比例
  };
  
  // 騎縫章設定
  sealStamp?: SealStampConfig;
  
  // 頁面設定
  pageOptions?: {
    margin: [number, number, number, number]; // 上、右、下、左
    format: 'a4' | 'letter';
    orientation: 'portrait' | 'landscape';
  };
}

export class EnhancedPDFGenerator {
  private defaultOptions: PDFExportOptions = {
    filename: 'document.pdf',
    elementId: 'printable-content',
    watermark: {
      enabled: true,
      imagePath: '/watermark-an.png',
      opacity: 0.05,
      size: { width: 0.7, height: 0.4 }
    },
    pageOptions: {
      margin: [0.25, 0.5, 0.25, 0.5],
      format: 'a4',
      orientation: 'portrait'
    }
  };

  async generatePDF(options: Partial<PDFExportOptions>): Promise<void> {
    const config = { ...this.defaultOptions, ...options };
    
    const element = document.getElementById(config.elementId);
    if (!element) {
      throw new Error(`找不到 ID 為 "${config.elementId}" 的元素`);
    }

    try {
      // 動態載入 html2pdf.js
      const { default: html2pdf } = await import('html2pdf.js');

      // 準備要列印的元素
      const elementToPrint = this.prepareElement(element);

      // 設定 html2pdf 選項
      const html2pdfOptions = {
        margin: config.pageOptions!.margin,
        filename: config.filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
        },
        jsPDF: { 
          unit: 'in', 
          format: config.pageOptions!.format, 
          orientation: config.pageOptions!.orientation 
        },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
      };

      // 使用 worker 模式來添加浮水印和騎縫章
      const worker = html2pdf().set(html2pdfOptions).from(elementToPrint);

      await worker.toPdf().get('pdf').then(async (pdf: any) => {
        const totalPages = pdf.internal.getNumberOfPages();
        
        // 添加浮水印
        if (config.watermark?.enabled) {
          await this.addWatermark(pdf, totalPages, config.watermark);
        }
        
        // 添加騎縫章
        if (config.sealStamp?.enabled) {
          await this.addSealStamp(pdf, totalPages, config.sealStamp);
        }
      }).save();

    } catch (error) {
      console.error('PDF 生成失敗:', error);
      throw new Error('PDF 匯出失敗，請稍後再試');
    }
  }

  private prepareElement(element: HTMLElement): HTMLElement {
    // 複製元素並移除不需要的樣式
    const elementToPrint = element.cloneNode(true) as HTMLElement;
    elementToPrint.classList.remove('border', 'shadow-md', 'rounded-lg');
    
    // 移除現有的浮水印圖片（因為我們會手動添加）
    const existingWatermark = elementToPrint.querySelector('img[alt="watermark"]');
    if (existingWatermark) {
      existingWatermark.remove();
    }
    
    // 移除騎縫章相關元素（如果有的話）
    const existingSealStamp = elementToPrint.querySelector('.seal-stamp');
    if (existingSealStamp) {
      existingSealStamp.remove();
    }

    return elementToPrint;
  }

  private async addWatermark(
    pdf: any, 
    totalPages: number, 
    watermarkConfig: NonNullable<PDFExportOptions['watermark']>
  ): Promise<void> {
    for (let i = 1; i <= totalPages; i++) {
      pdf.setPage(i);
      
      // 設定透明度
      pdf.setGState(new pdf.GState({ opacity: watermarkConfig.opacity }));
      
      const { width, height } = pdf.internal.pageSize;
      const imgWidth = width * watermarkConfig.size.width;
      const imgHeight = height * watermarkConfig.size.height;
      const x = (width - imgWidth) / 2; // 水平置中
      const y = (height - imgHeight) / 2; // 垂直置中
      
      // 添加浮水印
      pdf.addImage(
        watermarkConfig.imagePath, 
        'PNG', 
        x, y, imgWidth, imgHeight, 
        undefined, 'FAST'
      );
      
      // 重設透明度
      pdf.setGState(new pdf.GState({ opacity: 1 }));
    }
  }

  private async addSealStamp(
    pdf: any, 
    totalPages: number, 
    sealStampConfig: SealStampConfig
  ): Promise<void> {
    const { width, height } = pdf.internal.pageSize;
    
    for (let i = 1; i <= totalPages; i++) {
      pdf.setPage(i);
      
      // 設定透明度
      pdf.setGState(new pdf.GState({ opacity: sealStampConfig.opacity }));
      
      // 計算騎縫章位置
      const stampSize = sealStampConfig.size;
      let x: number, y: number;
      
      if (sealStampConfig.position === 'right') {
        x = width - (stampSize / 2) + sealStampConfig.offsetX;
      } else {
        x = -(stampSize / 2) + sealStampConfig.offsetX;
      }
      
      // 垂直位置：根據頁數和跨頁重疊設定
      if (sealStampConfig.overlayPages && totalPages > 1) {
        // 跨頁重疊：每頁的Y位置略有偏移，形成連續的騎縫效果
        const pageOffset = (height / totalPages) * (i - 1);
        y = (height / 2) + sealStampConfig.offsetY - pageOffset * 0.1;
      } else {
        // 每頁相同位置
        y = (height / 2) + sealStampConfig.offsetY;
      }
      
      // 儲存當前狀態
      pdf.saveGraphicsState();
      
      // 如果有旋轉，設定旋轉中心點
      if (sealStampConfig.rotation !== 0) {
        pdf.setTransformationMatrix(
          Math.cos(sealStampConfig.rotation * Math.PI / 180),
          Math.sin(sealStampConfig.rotation * Math.PI / 180),
          -Math.sin(sealStampConfig.rotation * Math.PI / 180),
          Math.cos(sealStampConfig.rotation * Math.PI / 180),
          x,
          y
        );
        x = 0;
        y = 0;
      }
      
      // 添加騎縫章
      try {
        pdf.addImage(
          sealStampConfig.stampImage,
          'PNG',
          x - (stampSize / 2),
          y - (stampSize / 2),
          stampSize,
          stampSize,
          `seal-stamp-page-${i}`,
          'FAST'
        );
      } catch (error) {
        console.warn(`騎縫章添加失敗 (第${i}頁):`, error);
        // 使用預設印章圖片
        pdf.addImage(
          '/seals/default-seal.png',
          'PNG',
          x - (stampSize / 2),
          y - (stampSize / 2),
          stampSize,
          stampSize,
          `default-seal-stamp-page-${i}`,
          'FAST'
        );
      }
      
      // 恢復狀態
      pdf.restoreGraphicsState();
      
      // 重設透明度
      pdf.setGState(new pdf.GState({ opacity: 1 }));
    }
  }

  // 驗證印章圖片是否可用
  private async validateStampImage(imagePath: string): Promise<boolean> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = imagePath;
    });
  }

  // 生成騎縫章預覽
  async generateStampPreview(config: SealStampConfig): Promise<string> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('無法創建 Canvas 上下文'));
        return;
      }

      canvas.width = 400;
      canvas.height = 600;

      // 繪製頁面背景
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // 繪製頁面邊框
      ctx.strokeStyle = '#cccccc';
      ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);
      
      // 繪製頁面分割線（模擬多頁）
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = '#999999';
      ctx.strokeRect(20, canvas.height / 2 - 1, canvas.width - 40, 2);
      
      // 載入並繪製印章
      const img = new Image();
      img.onload = () => {
        ctx.save();
        
        // 設定透明度
        ctx.globalAlpha = config.opacity;
        
        // 計算印章位置
        const stampSize = config.size * 50; // 縮放到預覽大小
        let x = config.position === 'right' 
          ? canvas.width - stampSize/2 - 10 
          : stampSize/2 + 10;
        let y = canvas.height / 2;
        
        x += config.offsetX * 20;
        y += config.offsetY * 20;
        
        // 設定旋轉
        if (config.rotation !== 0) {
          ctx.translate(x, y);
          ctx.rotate(config.rotation * Math.PI / 180);
          x = 0;
          y = 0;
        }
        
        // 繪製印章
        ctx.drawImage(img, x - stampSize/2, y - stampSize/2, stampSize, stampSize);
        
        ctx.restore();
        
        // 返回 Base64 資料
        resolve(canvas.toDataURL('image/png'));
      };
      
      img.onerror = () => {
        reject(new Error('無法載入印章圖片'));
      };
      
      img.src = config.stampImage;
    });
  }
}

// 匯出單例
export const pdfGenerator = new EnhancedPDFGenerator();