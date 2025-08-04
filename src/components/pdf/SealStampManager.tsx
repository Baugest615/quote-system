// src/components/pdf/SealStampManager.tsx
'use client';

import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Upload, Download, Eye, Settings, Stamp } from 'lucide-react';
import supabase from '@/lib/supabase/client';

export interface SealStampConfig {
  enabled: boolean;
  stampImage: string; // 印章圖片路徑
  position: 'left' | 'right';
  offsetX: number; // X軸偏移（英吋）
  offsetY: number; // Y軸偏移（英吋）
  size: number; // 印章大小（英吋）
  opacity: number; // 透明度 (0-1)
  rotation: number; // 旋轉角度
  overlayPages: boolean; // 是否跨頁重疊
}

interface SealStampManagerProps {
  config: SealStampConfig;
  onChange: (config: SealStampConfig) => void;
  onPreview?: () => void;
}

const defaultConfig: SealStampConfig = {
  enabled: true,
  stampImage: '/seal-stamp-default.png',
  position: 'right',
  offsetX: -0.3,
  offsetY: 0,
  size: 1.2,
  opacity: 0.8,
  rotation: 0,
  overlayPages: true,
};

export function SealStampManager({ 
  config = defaultConfig, 
  onChange, 
  onPreview 
}: SealStampManagerProps) {
  const [uploading, setUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // 上傳自訂印章圖片
  const handleImageUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // 檔案大小限制 (2MB)
    if (file.size > 2 * 1024 * 1024) {
      alert('檔案大小不得超過 2MB');
      return;
    }

    // 檔案類型檢查
    if (!file.type.startsWith('image/')) {
      alert('請選擇圖片檔案');
      return;
    }

    setUploading(true);
    try {
      // 生成唯一檔名
      const fileExt = file.name.split('.').pop();
      const fileName = `seal-stamps/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

      // 上傳到 Supabase Storage
      const { data, error } = await supabase.storage
        .from('attachments')
        .upload(fileName, file);

      if (error) throw error;

      // 獲取公開 URL
      const { data: { publicUrl } } = supabase.storage
        .from('attachments')
        .getPublicUrl(data.path);

      onChange({
        ...config,
        stampImage: publicUrl
      });

      alert('印章上傳成功！');
    } catch (error) {
      console.error('上傳失敗:', error);
      alert('上傳失敗，請稍後再試');
    } finally {
      setUploading(false);
    }
  }, [config, onChange]);

  // 預覽印章效果
  const handlePreview = useCallback(() => {
    if (previewImage || config.stampImage) {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = 300;
        canvas.height = 200;
        
        // 背景
        ctx.fillStyle = '#f8f9fa';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // 模擬頁面邊緣
        ctx.strokeStyle = '#dee2e6';
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);
        
        // 繪製印章
        ctx.save();
        ctx.globalAlpha = config.opacity;
        ctx.translate(canvas.width - 50, canvas.height / 2);
        ctx.rotate((config.rotation * Math.PI) / 180);
        
        const stampSize = config.size * 30; // 縮放到預覽大小
        ctx.drawImage(img, -stampSize/2, -stampSize/2, stampSize, stampSize);
        
        ctx.restore();
        
        // 顯示預覽
        const previewWindow = window.open('', '_blank', 'width=320,height=240');
        if (previewWindow) {
          previewWindow.document.write(`
            <html>
              <head><title>騎縫章預覽</title></head>
              <body style="margin:0; display:flex; justify-content:center; align-items:center;">
                <img src="${canvas.toDataURL()}" alt="騎縫章預覽" />
              </body>
            </html>
          `);
        }
      };
      img.src = previewImage || config.stampImage;
    }
    
    if (onPreview) onPreview();
  }, [config, previewImage, onPreview]);

  return (
    <div className="space-y-6 p-6 bg-white rounded-lg border">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Stamp className="h-5 w-5 text-indigo-600" />
          <h3 className="text-lg font-semibold">騎縫章設定</h3>
        </div>
        <Switch
          checked={config.enabled}
          onCheckedChange={(enabled) => onChange({ ...config, enabled })}
        />
      </div>

      {config.enabled && (
        <div className="space-y-4">
          {/* 印章圖片上傳 */}
          <div>
            <Label htmlFor="stamp-upload">印章圖片</Label>
            <div className="mt-2 flex items-center space-x-4">
              <div className="flex-1">
                <Input
                  id="stamp-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  disabled={uploading}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handlePreview}
                disabled={!config.stampImage}
              >
                <Eye className="h-4 w-4 mr-1" />
                預覽
              </Button>
            </div>
            {config.stampImage && (
              <div className="mt-2">
                <img 
                  src={config.stampImage} 
                  alt="當前印章" 
                  className="h-16 w-16 object-contain border rounded"
                />
              </div>
            )}
          </div>

          {/* 位置設定 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>騎縫位置</Label>
              <select
                value={config.position}
                onChange={(e) => onChange({ 
                  ...config, 
                  position: e.target.value as 'left' | 'right' 
                })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
              >
                <option value="right">右側邊緣</option>
                <option value="left">左側邊緣</option>
              </select>
            </div>
            
            <div>
              <Label>印章大小 ({config.size}吋)</Label>
              <Slider
                value={[config.size]}
                onValueChange={([size]) => onChange({ ...config, size })}
                min={0.5}
                max={2.0}
                step={0.1}
                className="mt-2"
              />
            </div>
          </div>

          {/* 進階設定 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>透明度 ({Math.round(config.opacity * 100)}%)</Label>
              <Slider
                value={[config.opacity]}
                onValueChange={([opacity]) => onChange({ ...config, opacity })}
                min={0.1}
                max={1.0}
                step={0.1}
                className="mt-2"
              />
            </div>
            
            <div>
              <Label>旋轉角度 ({config.rotation}°)</Label>
              <Slider
                value={[config.rotation]}
                onValueChange={([rotation]) => onChange({ ...config, rotation })}
                min={-45}
                max={45}
                step={5}
                className="mt-2"
              />
            </div>
          </div>

          {/* 微調設定 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>水平偏移 ({config.offsetX}吋)</Label>
              <Slider
                value={[config.offsetX]}
                onValueChange={([offsetX]) => onChange({ ...config, offsetX })}
                min={-1.0}
                max={1.0}
                step={0.1}
                className="mt-2"
              />
            </div>
            
            <div>
              <Label>垂直偏移 ({config.offsetY}吋)</Label>
              <Slider
                value={[config.offsetY]}
                onValueChange={([offsetY]) => onChange({ ...config, offsetY })}
                min={-2.0}
                max={2.0}
                step={0.1}
                className="mt-2"
              />
            </div>
          </div>

          {/* 額外選項 */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="overlay-pages"
                checked={config.overlayPages}
                onCheckedChange={(overlayPages) => onChange({ ...config, overlayPages })}
              />
              <Label htmlFor="overlay-pages">跨頁重疊效果</Label>
            </div>
          </div>

          {/* 預設印章範本 */}
          <div>
            <Label>預設印章範本</Label>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {[
                { name: '公司印章', path: '/seals/company-seal.png' },
                { name: '確認印章', path: '/seals/confirm-seal.png' },
                { name: '騎縫章', path: '/seals/bridge-seal.png' },
                { name: '核准印章', path: '/seals/approved-seal.png' },
              ].map((template) => (
                <button
                  key={template.name}
                  type="button"
                  onClick={() => onChange({ ...config, stampImage: template.path })}
                  className="p-2 border rounded hover:bg-gray-50 text-sm"
                >
                  {template.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SealStampManager;