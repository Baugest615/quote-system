// src/components/pdf/ElectronicSealManager.tsx
'use client';

import React from 'react';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Stamp } from 'lucide-react';
import { SealStampConfig } from './SealStampManager'; // 我們可以重用相同的類型

interface ElectronicSealManagerProps {
  config: SealStampConfig;
  onChange: (config: SealStampConfig) => void;
}

// 您可以將此路徑改為您想預設使用的客戶印章圖片
const FIXED_STAMP_IMAGE = '/seals/approved-seal.png';

const defaultConfig: SealStampConfig = {
  enabled: false,
  stampImage: FIXED_STAMP_IMAGE,
  position: 'right', // 這個欄位在此元件中作用不大，但維持類型一致
  offsetX: 0,
  offsetY: 0,
  size: 1.0,
  opacity: 0.9,
  rotation: 0,
  overlayPages: false, // 電子用印不需要跨頁
};

export function ElectronicSealManager({
  config = defaultConfig,
  onChange,
}: ElectronicSealManagerProps) {

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
          <Stamp className="h-5 w-5 text-green-600" />
          <h3 className="text-lg font-semibold">電子用印設定</h3>
        </div>
        <Switch
          checked={config.enabled}
          onCheckedChange={(enabled) => onChange({ ...config, enabled })}
        />
      </div>

      {config.enabled && (
        <div className="space-y-4 animate-in fade-in duration-300">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>印章大小 ({config.size}吋)</Label>
              <Slider
                value={[config.size]}
                onValueChange={([size]) => onChange({ ...config, size })}
                min={0.5}
                max={2.5}
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
                min={-2.0}
                max={2.0}
                step={0.1}
                className="mt-2"
              />
            </div>
          </div>
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
        </div>
      )}
    </div>
  );
}