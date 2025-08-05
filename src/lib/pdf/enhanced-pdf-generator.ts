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

      const worker = html2pdf().set({
        margin: config.pageOptions!.margin,
        filename: config.filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
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
        // 【已移除】電子簽章的後製邏輯已完全移除
      }).save();
    } catch (error) {
      console.error('PDF 生成失敗:', error);
      throw new Error(`PDF 生成失敗: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private prepareElementForPrint(element: HTMLElement): HTMLElement {
    const elementToPrint = element.cloneNode(true) as HTMLElement;
    elementToPrint.classList.remove('border', 'shadow-md', 'rounded-lg');
    const existingWatermark = elementToPrint.querySelector('img[alt="watermark"]');
    if (existingWatermark) existingWatermark.remove();
    return elementToPrint;
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
          pdf.addImage(stampImage, 'PNG', x_topLeft, y_topLeft, stampSize, stampImage.length); // Typo corrected
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