// src/components/pdf/SealStampManager.tsx
'use client';

import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Upload, Eye, Stamp } from 'lucide-react';
import supabase from '@/lib/supabase/client';

export interface SealStampConfig {
  enabled: boolean;
  stampImage: string;
  position: 'left' | 'right' | 'top' | 'bottom';
  offsetX: number;
  offsetY: number;
  size: number;
  opacity: number;
  rotation: number;
  overlayPages: boolean;
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

  const handleImageUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('檔案大小不得超過 2MB');
      return;
    }
    if (!file.type.startsWith('image/')) {
      alert('請選擇圖片檔案');
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `seal-stamps/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const { data, error } = await supabase.storage.from('attachments').upload(fileName, file);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('attachments').getPublicUrl(data.path);
      onChange({ ...config, stampImage: publicUrl });
      alert('印章上傳成功！');
    } catch (error) {
      console.error('上傳失敗:', error);
      alert('上傳失敗，請稍後再試');
    } finally {
      setUploading(false);
    }
  }, [config, onChange]);

  const handlePreview = useCallback(() => {
    if (onPreview) onPreview();
    else alert('預覽功能將在PDF匯出時體現。');
  }, [onPreview]);

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
          <div>
            <Label htmlFor="stamp-upload">印章圖片</Label>
            <div className="mt-2 flex items-center space-x-4">
              <div className="flex-1">
                <Input id="stamp-upload" type="file" accept="image/*" onChange={handleImageUpload} disabled={uploading} />
              </div>
              <Button type="button" variant="outline" size="sm" onClick={handlePreview} disabled={!config.stampImage}>
                <Eye className="h-4 w-4 mr-1" />預覽
              </Button>
            </div>
            {config.stampImage && (
              <div className="mt-2"><img src={config.stampImage} alt="當前印章" className="h-16 w-16 object-contain border rounded" /></div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              {/* 【關鍵修正】將 Label 與 select 關聯 */}
              <Label htmlFor="stamp-position">騎縫位置</Label>
              <select
                id="stamp-position" // 添加 id
                value={config.position}
                onChange={(e) => onChange({ ...config, position: e.target.value as any })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
              >
                <option value="right">右側騎縫</option>
                <option value="left">左側騎縫</option>
                <option value="bottom">上下騎縫</option>
              </select>
            </div>
            <div>
              <Label>印章大小 ({config.size}吋)</Label>
              <Slider value={[config.size]} onValueChange={([size]) => onChange({ ...config, size })} min={0.5} max={3.0} step={0.1} className="mt-2" />
            </div>
          </div>
          
          {/* ... 其他程式碼保持不變 ... */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>透明度 ({Math.round(config.opacity * 100)}%)</Label>
              <Slider value={[config.opacity]} onValueChange={([opacity]) => onChange({ ...config, opacity })} min={0.1} max={1.0} step={0.1} className="mt-2" />
            </div>
            <div>
              <Label>旋轉角度 ({config.rotation}°)</Label>
              <Slider value={[config.rotation]} onValueChange={([rotation]) => onChange({ ...config, rotation })} min={-90} max={90} step={5} className="mt-2" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>水平偏移 ({config.offsetX}吋)</Label>
              <Slider value={[config.offsetX]} onValueChange={([offsetX]) => onChange({ ...config, offsetX })} min={-2.0} max={2.0} step={0.1} className="mt-2" />
            </div>
            <div>
              <Label>垂直偏移 ({config.offsetY}吋)</Label>
              <Slider value={[config.offsetY]} onValueChange={([offsetY]) => onChange({ ...config, offsetY })} min={-4.0} max={4.0} step={0.1} className="mt-2" />
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Switch id="overlay-pages" checked={config.overlayPages} onCheckedChange={(overlayPages) => onChange({ ...config, overlayPages })} />
            <Label htmlFor="overlay-pages">啟用跨頁連續效果</Label>
          </div>
        </div>
      )}
    </div>
  );
}

export default SealStampManager;