'use client'

import { useState, useRef } from 'react';
import supabase from '@/lib/supabase/client';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, Link as LinkIcon, Eye, Download, ExternalLink } from 'lucide-react';
import { useConfirm } from '@/components/ui/ConfirmDialog';

interface Attachment {
  name: string;
  url: string;
  path: string;
  uploadedAt: string;
}

interface FileModalProps {
  isOpen: boolean;
  onClose: () => void;
  quote: { id: string; project_name: string; attachments: Attachment[] | unknown[] | null; } | null;
  onUpdate: () => void;
}

export function FileModal({ isOpen, onClose, quote, onUpdate }: FileModalProps) {
  const confirm = useConfirm();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!quote) return null;

  const currentAttachment: Attachment | null = (
    quote.attachments &&
    Array.isArray(quote.attachments) &&
    quote.attachments.length > 0
  ) ? quote.attachments[0] as Attachment : null;

  // 徹底的檔名清理函數 - 只保留英數字和點
  const createSafeFileName = (originalName: string): string => {
    const timestamp = new Date().getTime();
    const extension = originalName.split('.').pop()?.toLowerCase() || 'file';

    // 移除所有非ASCII字符，只保留字母數字和基本符號
    const safeName = originalName
      .replace(/\.[^/.]+$/, '') // 移除副檔名
      .replace(/[^\x00-\x7F]/g, '') // 移除所有非ASCII字符（包括中文）
      .replace(/[^a-zA-Z0-9]/g, '_') // 將所有非字母數字字符替換為底線
      .replace(/_+/g, '_') // 將多個連續底線合併為一個
      .replace(/^_|_$/g, '') // 移除開頭和結尾的底線
      .substring(0, 20); // 限制長度

    // 如果處理後名稱為空，使用默認名稱
    const finalName = safeName || 'file';

    return `${timestamp}_${finalName}.${extension}`;
  };

  // 獲取檔案類型
  const getFileType = (filename: string): string => {
    const extension = filename.split('.').pop()?.toLowerCase() || '';
    const imageTypes = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
    const documentTypes = ['pdf', 'doc', 'docx', 'txt'];
    const spreadsheetTypes = ['xls', 'xlsx', 'csv'];

    if (imageTypes.includes(extension)) return 'image';
    if (documentTypes.includes(extension)) return 'document';
    if (spreadsheetTypes.includes(extension)) return 'spreadsheet';
    return 'file';
  };

  // 安全下載檔案
  const handleFileDownload = async () => {
    if (!currentAttachment?.path) return;

    setDownloadError(null);

    try {
      // 使用signed URL確保能下載
      const { data, error } = await supabase.storage
        .from('attachments')
        .createSignedUrl(currentAttachment.path, 60); // 60秒有效期

      if (error) {
        console.error('Create signed URL error:', error);
        setDownloadError('無法生成下載連結: ' + error.message);
        return;
      }

      if (data?.signedUrl) {
        // 創建下載連結
        const link = document.createElement('a');
        link.href = data.signedUrl;
        link.download = currentAttachment.name;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error) {
      console.error('Download error:', error);
      setDownloadError('下載失敗: ' + (error instanceof Error ? error.message : '未知錯誤'));
    }
  };

  // 在新視窗預覽檔案
  const handleFilePreview = async () => {
    if (!currentAttachment?.path) return;

    setDownloadError(null);

    try {
      // 使用signed URL確保能預覽
      const { data, error } = await supabase.storage
        .from('attachments')
        .createSignedUrl(currentAttachment.path, 60); // 60秒有效期

      if (error) {
        console.error('Create signed URL error:', error);
        setDownloadError('無法生成預覽連結: ' + error.message);
        return;
      }

      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank');
      }
    } catch (error) {
      console.error('Preview error:', error);
      setDownloadError('預覽失敗: ' + (error instanceof Error ? error.message : '未知錯誤'));
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setUploadError(null);

    if (!file) return;

    // MIME type 白名單驗證
    const ALLOWED_MIMES = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'text/plain',
    ];

    if (file.type && !ALLOWED_MIMES.includes(file.type)) {
      setUploadError(`不支援的檔案類型：${file.type}。僅接受 PDF、Word、Excel、圖片、純文字檔案。`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setUploadError('檔案大小不可超過 5MB');
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploading(true);

    try {
      // 使用徹底安全的檔名
      const safeFileName = createSafeFileName(file.name);
      const uploadPath = `quotations/${quote.id}/${safeFileName}`;

      console.log('Original filename:', file.name);
      console.log('Safe filename:', safeFileName);
      console.log('Upload path:', uploadPath);

      // 如果已有附件，先刪除舊的
      if (currentAttachment?.path) {
        console.log('Removing old attachment:', currentAttachment.path);
        const { error: deleteError } = await supabase.storage
          .from('attachments')
          .remove([currentAttachment.path]);

        if (deleteError) {
          console.warn('刪除舊檔案失敗:', deleteError.message);
        }
      }

      // 上傳新檔案
      console.log('Uploading file...');
      const { error: uploadError, data: uploadData } = await supabase.storage
        .from('attachments')
        .upload(uploadPath, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        setUploadError('檔案上傳失敗: ' + uploadError.message);
        return;
      }

      console.log('Upload successful:', uploadData);

      // 獲取公開URL（備用，主要使用signed URL）
      const { data: urlData } = supabase.storage
        .from('attachments')
        .getPublicUrl(uploadPath);

      console.log('Public URL:', urlData.publicUrl);

      const newAttachment = {
        name: file.name, // 保存原始檔名用於顯示
        url: urlData.publicUrl,
        path: uploadPath, // 使用安全路徑存儲
        uploadedAt: new Date().toISOString()
      };

      // 更新資料庫
      console.log('Updating database with:', newAttachment);
      const { error: dbError } = await supabase
        .from('quotations')
        .update({ attachments: [newAttachment] })
        .eq('id', quote.id);

      if (dbError) {
        console.error('Database update error:', dbError);
        // 如果資料庫更新失敗，清理已上傳的檔案
        await supabase.storage.from('attachments').remove([uploadPath]);
        setUploadError('更新報價單資料失敗: ' + dbError.message);
        return;
      }

      console.log('File upload completed successfully');
      toast.success('檔案已成功上傳');

      // 關閉modal並更新父組件
      onClose();

      // 延遲執行更新，避免狀態衝突
      setTimeout(() => {
        onUpdate();
      }, 100);

    } catch (error) {
      console.error('Upload process error:', error);
      setUploadError('上傳失敗: ' + (error instanceof Error ? error.message : '未知錯誤'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileDelete = async () => {
    if (!currentAttachment?.path) return;

    const ok = await confirm({
      title: '確認刪除',
      description: `確定要刪除檔案 "${currentAttachment.name}" 嗎？`,
      confirmLabel: '刪除',
      variant: 'destructive',
    });
    if (!ok) return;

    try {
      console.log('Deleting file:', currentAttachment.path);

      // 從儲存空間刪除檔案
      const { error: storageError } = await supabase.storage
        .from('attachments')
        .remove([currentAttachment.path]);

      if (storageError) {
        console.warn('從儲存空間刪除檔案失敗:', storageError.message);
      }

      // 更新資料庫
      const { error: dbError } = await supabase
        .from('quotations')
        .update({ attachments: [] })
        .eq('id', quote.id);

      if (dbError) {
        console.error('Database update error:', dbError);
        setUploadError('更新報價單資料失敗: ' + dbError.message);
        return;
      }

      console.log('File deletion completed successfully');
      toast.success('檔案已成功刪除');

      // 關閉modal並更新父組件
      onClose();

      // 延遲執行更新，避免狀態衝突
      setTimeout(() => {
        onUpdate();
      }, 100);

    } catch (error) {
      console.error('Delete process error:', error);
      setUploadError('刪除失敗: ' + (error instanceof Error ? error.message : '未知錯誤'));
    }
  };

  const handleClose = () => {
    // 清理狀態
    setUploadError(null);
    setDownloadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  };

  const fileType = currentAttachment ? getFileType(currentAttachment.name) : '';

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={`檔案管理 - ${quote.project_name}`}>
      <div className="space-y-6">
        <div>
          <h4 className="text-md font-semibold text-foreground/80 mb-3 flex items-center">
            <LinkIcon className="h-4 w-4 mr-2" />
            已上傳檔案
          </h4>
          {currentAttachment ? (
            <div className="bg-secondary p-4 rounded-lg border">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center flex-1 min-w-0">
                  <div className="flex-shrink-0 mr-3">
                    {fileType === 'image' && <div className="w-8 h-8 bg-success/15 rounded flex items-center justify-center">🖼️</div>}
                    {fileType === 'document' && <div className="w-8 h-8 bg-info/15 rounded flex items-center justify-center">📄</div>}
                    {fileType === 'spreadsheet' && <div className="w-8 h-8 bg-yellow-100 rounded flex items-center justify-center">📊</div>}
                    {fileType === 'file' && <div className="w-8 h-8 bg-muted rounded flex items-center justify-center">📎</div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground truncate" title={currentAttachment.name}>
                      {currentAttachment.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      上傳時間：{new Date(currentAttachment.uploadedAt).toLocaleString('zh-TW')}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive/80 hover:bg-destructive/10 ml-3"
                  onClick={handleFileDelete}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {/* 檔案操作按鈕 */}
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleFilePreview}
                  className="flex items-center"
                >
                  <Eye className="h-4 w-4 mr-1" />
                  預覽
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleFileDownload}
                  className="flex items-center"
                >
                  <Download className="h-4 w-4 mr-1" />
                  下載
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(currentAttachment.url, '_blank')}
                  className="flex items-center"
                >
                  <ExternalLink className="h-4 w-4 mr-1" />
                  新視窗開啟
                </Button>
              </div>

              {downloadError && (
                <div className="mt-3 bg-destructive/10 border border-destructive/30 rounded-md p-2">
                  <p className="text-sm text-destructive">{downloadError}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-secondary p-4 rounded-lg border border-dashed border-border text-center">
              <p className="text-muted-foreground italic text-sm">尚無檔案</p>
            </div>
          )}
        </div>

        <div className="border-t pt-4">
          <h4 className="text-md font-semibold text-foreground/80 mb-3">上傳新檔案</h4>
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-md p-3 mb-3">
            <p className="text-xs text-yellow-400">
              <strong>重要說明：</strong><br />
              • 上傳新檔將會覆蓋舊有檔案<br />
              • 檔案大小限制為 5MB<br />
              • 中文檔名會自動轉換為英文檔名（保留原始檔名顯示）<br />
              • 支援格式：PDF, Word, Excel, 圖片等常見格式
            </p>
          </div>
          <Input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            disabled={uploading}
            className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-emerald-500/10 file:text-primary hover:file:bg-emerald-500/20"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.txt,.zip,.rar"
          />
          {uploading && (
            <div className="mt-2 flex items-center text-sm text-primary">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-emerald-500 mr-2"></div>
              上傳中，請稍候...
            </div>
          )}
          {uploadError && (
            <div className="mt-2 bg-destructive/10 border border-destructive/30 rounded-md p-2">
              <p className="text-sm text-destructive">{uploadError}</p>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-4 border-t">
          <Button variant="outline" onClick={handleClose} disabled={uploading}>
            {uploading ? '處理中...' : '關閉'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}