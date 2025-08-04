// src/lib/utils/seal-stamp-utils.ts
// 騎縫章相關工具函數

export interface SealStampTemplate {
  id: string;
  name: string;
  description: string;
  imagePath: string;
  category: 'company' | 'approval' | 'confirmation' | 'custom';
  defaultConfig: {
    position: 'left' | 'right';
    size: number;
    opacity: number;
    rotation: number;
  };
}

// ... (SEAL_STAMP_TEMPLATES and other functions remain the same) ...
export const SEAL_STAMP_TEMPLATES: SealStampTemplate[] = [
  {
    id: 'company-seal',
    name: '公司印章',
    description: '適用於正式文件的公司大印',
    imagePath: '/seals/company-seal.png',
    category: 'company',
    defaultConfig: {
      position: 'right',
      size: 1.2,
      opacity: 0.8,
      rotation: 0
    }
  },
  {
    id: 'approved-seal',
    name: '核准印章',
    description: '用於標示文件已通過審核',
    imagePath: '/seals/approved-seal.png',
    category: 'approval',
    defaultConfig: {
      position: 'right',
      size: 1.0,
      opacity: 0.7,
      rotation: -15
    }
  },
  {
    id: 'confirmed-seal',
    name: '確認印章',
    description: '用於確認文件內容無誤',
    imagePath: '/seals/confirmed-seal.png',
    category: 'confirmation',
    defaultConfig: {
      position: 'right',
      size: 1.1,
      opacity: 0.75,
      rotation: 0
    }
  },
  {
    id: 'bridge-seal',
    name: '騎縫專用章',
    description: '專為騎縫設計的長條形印章',
    imagePath: '/seals/bridge-seal.png',
    category: 'custom',
    defaultConfig: {
      position: 'right',
      size: 1.5,
      opacity: 0.8,
      rotation: 90
    }
  }
];

export function generateSealStampSVG(
  text: string, 
  options: {
    width?: number;
    height?: number;
    fontSize?: number;
    color?: string;
    backgroundColor?: string;
  } = {}
): string {
  const {
    width = 100,
    height = 100,
    fontSize = 14,
    color = '#cc0000',
    backgroundColor = 'transparent'
  } = options;

  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>
          .stamp-text { 
            font-family: 'Microsoft JhengHei', '微軟正黑體', Arial, sans-serif; 
            font-weight: bold;
            text-anchor: middle;
            dominant-baseline: middle;
          }
        </style>
      </defs>
      
      <circle 
        cx="${width/2}" 
        cy="${height/2}" 
        r="${Math.min(width, height)/2 - 2}" 
        fill="${backgroundColor}" 
        stroke="${color}" 
        stroke-width="3"
      />
      
      <text 
        x="${width/2}" 
        y="${height/2}" 
        font-size="${fontSize}" 
        fill="${color}" 
        class="stamp-text"
      >
        ${text}
      </text>
      
      <circle 
        cx="${width/2}" 
        cy="${height/2}" 
        r="${Math.min(width, height)/2 - 8}" 
        fill="none" 
        stroke="${color}" 
        stroke-width="1"
      />
    </svg>
  `;
}

export async function svgToPng(svgString: string, scale: number = 2): Promise<string> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('無法創建 Canvas 上下文'));
      return;
    }

    const img = new Image();
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      
      const pngDataUrl = canvas.toDataURL('image/png');
      URL.revokeObjectURL(url);
      resolve(pngDataUrl);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('SVG 轉換失敗'));
    };

    img.src = url;
  });
}

export async function createCustomSealStamp(
  companyName: string,
  stampType: 'circular' | 'rectangular' | 'bridge'
): Promise<string> {
  let svgContent: string;

  switch (stampType) {
    case 'circular':
      svgContent = generateSealStampSVG(companyName, {
        width: 120,
        height: 120,
        fontSize: 16,
        color: '#cc0000'
      });
      break;

    case 'rectangular':
      svgContent = `
        <svg width="150" height="60" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="2" width="146" height="56" fill="transparent" stroke="#cc0000" stroke-width="3"/>
          <rect x="8" y="8" width="134" height="44" fill="none" stroke="#cc0000" stroke-width="1"/>
          <text x="75" y="35" font-size="14" font-weight="bold" fill="#cc0000" text-anchor="middle" 
                font-family="Microsoft JhengHei, 微軟正黑體, Arial, sans-serif">
            ${companyName}
          </text>
        </svg>
      `;
      break;

    case 'bridge':
      svgContent = `
        <svg width="40" height="200" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="2" width="36" height="196" fill="transparent" stroke="#cc0000" stroke-width="3"/>
          <rect x="6" y="6" width="28" height="188" fill="none" stroke="#cc0000" stroke-width="1"/>
          
          ${companyName.split('').map((char, index) => `
            <text x="20" y="${30 + index * 25}" font-size="16" font-weight="bold" fill="#cc0000" 
                  text-anchor="middle" font-family="Microsoft JhengHei, 微軟正黑體, Arial, sans-serif">
              ${char}
            </text>
          `).join('')}
        </svg>
      `;
      break;

    default:
      throw new Error('不支援的印章類型');
  }

  return svgToPng(svgContent);
}

export function calculateSealStampPosition(
  pageSize: { width: number; height: number },
  stampConfig: {
    position: 'left' | 'right';
    size: number;
    offsetX: number;
    offsetY: number;
  },
  pageNumber: number,
  totalPages: number,
  overlayPages: boolean = true
): { x: number; y: number } {
  const { width, height } = pageSize;
  const { position, size, offsetX, offsetY } = stampConfig;

  let x: number, y: number;

  if (position === 'right') {
    x = width - (size / 2) + offsetX;
  } else {
    x = -(size / 2) + offsetX;
  }

  if (overlayPages && totalPages > 1) {
    const pageOffset = (height / totalPages) * (pageNumber - 1);
    y = (height / 2) + offsetY - pageOffset * 0.15;
  } else {
    y = (height / 2) + offsetY;
  }

  return { x, y };
}

export function validateSealStampConfig(config: any): string[] {
  const errors: string[] = [];
  if (!config.stampImage) errors.push('請選擇印章圖片');
  if (config.size < 0.5 || config.size > 3.0) errors.push('印章大小必須在 0.5 到 3.0 英吋之間');
  if (config.opacity < 0.1 || config.opacity > 1.0) errors.push('透明度必須在 10% 到 100% 之間');
  if (config.rotation < -90 || config.rotation > 90) errors.push('旋轉角度必須在 -90° 到 90° 之間');
  return errors;
}

export function exportSealStampConfig(config: any): string {
  return JSON.stringify({ version: '1.0', timestamp: new Date().toISOString(), config }, null, 2);
}

export function importSealStampConfig(jsonString: string): any {
  try {
    const importData = JSON.parse(jsonString);
    if (!importData.config) throw new Error('無效的設定檔格式');
    return importData.config;
  } catch (error) {
    throw new Error('設定檔解析失敗：' + (error as Error).message);
  }
}

// 上傳印章圖片到 Supabase
export async function uploadSealStampImage(
  file: File, // 【關鍵修正】明確指定 file 的類型為 File
  supabaseClient: any
): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('只能上傳圖片檔案');
  if (file.size > 5 * 1024 * 1024) throw new Error('檔案大小不得超過 5MB');

  const fileExt = file.name.split('.').pop();
  const fileName = `seal-stamps/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

  const { data, error } = await supabaseClient.storage.from('attachments').upload(fileName, file);
  if (error) throw new Error('上傳失敗：' + error.message);

  const { data: { publicUrl } } = supabaseClient.storage.from('attachments').getPublicUrl(data.path);
  return publicUrl;
}

// 清理舊的印章檔案
export async function cleanupOldSealStamps(
  supabaseClient: any,
  daysOld: number = 30
): Promise<void> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  try {
    const { data: files, error } = await supabaseClient.storage.from('attachments').list('seal-stamps');
    if (error) throw error;

    const oldFiles = files?.filter((file: any) => { // 【關鍵修正】明確指定 file 的類型為 any
      const fileDate = new Date(file.created_at);
      return fileDate < cutoffDate;
    });

    if (oldFiles && oldFiles.length > 0) {
      const filePaths = oldFiles.map((file: any) => `seal-stamps/${file.name}`); // 【關鍵修正】明確指定 file 的類型為 any
      const { error: deleteError } = await supabaseClient.storage.from('attachments').remove(filePaths);
      if (deleteError) throw deleteError;
      console.log(`清理了 ${oldFiles.length} 個舊的印章檔案`);
    }
  } catch (error) {
    console.error('清理舊印章檔案失敗:', error);
  }
}