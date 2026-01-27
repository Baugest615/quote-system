// src/components/pdf/SealStampManager.tsx - 固定騎縫章版本
'use client';

import React from 'react';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Stamp } from 'lucide-react';

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

// 固定使用的印章圖片路徑 - 您可以更改此路徑為您想要固定使用的圖片
const FIXED_STAMP_IMAGE = '/seals/company-seal.png';

const defaultConfig: SealStampConfig = {
  enabled: true,
  stampImage: FIXED_STAMP_IMAGE, // 固定使用指定圖片
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

  // 移除強制圖檔邏輯，允許外部傳入的設定生效
  // React.useEffect(() => {
  //   if (config.stampImage !== FIXED_STAMP_IMAGE) {
  //     onChange({ ...config, stampImage: FIXED_STAMP_IMAGE });
  //   }
  // }, [config, onChange]);

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
          {/* 移除了印章圖片上傳、預覽和顯示功能 */}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="stamp-position">騎縫位置</Label>
              <select
                id="stamp-position"
                title="選擇騎縫章的位置"
                aria-label="騎縫位置選擇"
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
              <Slider
                value={[config.size]}
                onValueChange={([size]) => onChange({ ...config, size })}
                min={0.5}
                max={3.0}
                step={0.1}
                className="mt-2"
              />
            </div>
          </div>

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
                min={-90}
                max={90}
                step={5}
                className="mt-2"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>水平偏移 ({config.offsetX}吋)</Label>
              <Slider
                value={[config.offsetX]}
                onValueChange={([offsetX]) => onChange({ ...config, offsetX })}
                min={-2.0}
                max={2.0}
                step={0.1}
                className="mt-2"
              />
            </div>
            <div>
              <Label>垂直偏移 ({config.offsetY}吋)</Label>
              <Slider
                value={[config.offsetY]}
                onValueChange={([offsetY]) => onChange({ ...config, offsetY })}
                min={-4.0}
                max={4.0}
                step={0.1}
                className="mt-2"
              />
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="overlay-pages"
              checked={config.overlayPages}
              onCheckedChange={(overlayPages) => onChange({ ...config, overlayPages })}
            />
            <Label htmlFor="overlay-pages">啟用跨頁連續效果</Label>
          </div>
        </div>
      )}
    </div>
  );
}

export default SealStampManager;