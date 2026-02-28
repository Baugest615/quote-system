'use client'

import { useState, useRef } from 'react';
import supabase from '@/lib/supabase/client';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, Link as LinkIcon, Eye, Download, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { PendingPaymentAttachment } from '@/lib/payments/types';

interface PendingPaymentFileModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemId: string;
  projectName: string;
  currentAttachments: PendingPaymentAttachment[];
  onUpdate: (itemId: string, attachments: PendingPaymentAttachment[]) => void;
}

export function PendingPaymentFileModal({
  isOpen,
  onClose,
  itemId,
  projectName,
  currentAttachments,
  onUpdate
}: PendingPaymentFileModalProps) {
  const confirm = useConfirm();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<PendingPaymentAttachment[]>(currentAttachments || []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 最大檔案數量和總大小限制
  const MAX_FILES = 5;
  const MAX_TOTAL_SIZE = 5 * 1024 * 1024; // 5MB

  // 徹底的檔名清理函數
  const createSafeFileName = (originalName: string): string => {
    const timestamp = new Date().getTime();
    const extension = originalName.split('.').pop()?.toLowerCase() || 'file';

    const safeName = originalName
      .replace(/\.[^/.]+$/, '') // 移除副檔名
      .replace(/[^\x00-\x7F]/g, '') // 移除所有非ASCII字符（包括中文）
      .replace(/[^a-zA-Z0-9]/g, '_') // 將所有非字母數字字符替換為底線
      .replace(/_+/g, '_') // 將多個連續底線合併為一個
      .replace(/^_|_$/g, '') // 移除開頭和結尾的底線
      .substring(0, 20); // 限制長度

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

  // 計算當前總檔案大小
  const getCurrentTotalSize = (): number => {
    return attachments.reduce((total, file) => total + file.size, 0);
  };

  // 格式化檔案大小
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // 檔案上傳處理
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setUploadError(null);

    if (!file) return;

    // 檢查單一檔案大小
    if (file.size > MAX_TOTAL_SIZE) {
      setUploadError('單一檔案大小不可超過 5MB');
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // 檢查總檔案大小
    const currentTotalSize = getCurrentTotalSize();
    if (currentTotalSize + file.size > MAX_TOTAL_SIZE) {
      setUploadError(`上傳後總檔案大小將超過限制 (${formatFileSize(currentTotalSize + file.size)} > 5MB)`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploading(true);

    try {
      // 如果已達到最大檔案數量，刪除最舊的檔案
      let updatedAttachments = [...attachments];
      if (updatedAttachments.length >= MAX_FILES) {
        // 按上傳時間排序，刪除最舊的
        updatedAttachments.sort((a, b) => new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime());
        const oldestFile = updatedAttachments[0];

        // 從 Supabase Storage 刪除最舊檔案
        await supabase.storage
          .from('attachments')
          .remove([oldestFile.path]);

        // 從陣列中移除
        updatedAttachments = updatedAttachments.slice(1);
      }

      // 使用安全的檔名
      const safeFileName = createSafeFileName(file.name);
      const uploadPath = `pending-payments/${itemId}/${safeFileName}`;

      console.log('Original filename:', file.name);
      console.log('Safe filename:', safeFileName);
      console.log('Upload path:', uploadPath);

      // 上傳新檔案
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

      // 獲取公開URL
      const { data: urlData } = supabase.storage
        .from('attachments')
        .getPublicUrl(uploadPath);

      const newAttachment: PendingPaymentAttachment = {
        name: file.name, // 保存原始檔名用於顯示
        url: urlData.publicUrl,
        path: uploadPath, // 使用安全路徑存儲
        uploadedAt: new Date().toISOString(),
        size: file.size
      };

      // 更新附件陣列
      const finalAttachments = [...updatedAttachments, newAttachment];
      setAttachments(finalAttachments);

      console.log('File upload completed successfully');
      toast.success('檔案已成功上傳！');

      // 通知父組件更新
      onUpdate(itemId, finalAttachments);

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

  // 安全下載檔案
  const handleFileDownload = async (attachment: PendingPaymentAttachment) => {
    setDownloadError(null);

    try {
      const { data, error } = await supabase.storage
        .from('attachments')
        .createSignedUrl(attachment.path, 60);

      if (error) {
        console.error('Create signed URL error:', error);
        setDownloadError('無法生成下載連結: ' + error.message);
        return;
      }

      if (data?.signedUrl) {
        const link = document.createElement('a');
        link.href = data.signedUrl;
        link.download = attachment.name;
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

  // 預覽檔案
  const handleFilePreview = async (attachment: PendingPaymentAttachment) => {
    setDownloadError(null);

    try {
      const { data, error } = await supabase.storage
        .from('attachments')
        .createSignedUrl(attachment.path, 60);

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

  // 刪除檔案
  const handleFileDelete = async (attachment: PendingPaymentAttachment) => {
    const ok = await confirm({
      title: '確認刪除',
      description: `確定要刪除檔案 "${attachment.name}" 嗎？`,
      confirmLabel: '刪除',
      variant: 'destructive',
    });
    if (!ok) return;

    try {
      console.log('Deleting file:', attachment.path);

      // 從儲存空間刪除檔案
      const { error: storageError } = await supabase.storage
        .from('attachments')
        .remove([attachment.path]);

      if (storageError) {
        console.warn('從儲存空間刪除檔案失敗:', storageError.message);
      }

      // 從陣列中移除
      const updatedAttachments = attachments.filter(a => a.path !== attachment.path);
      setAttachments(updatedAttachments);

      console.log('File deletion completed successfully');
      toast.success('檔案已成功刪除！');

      // 通知父組件更新
      onUpdate(itemId, updatedAttachments);

    } catch (error) {
      console.error('Delete process error:', error);
      setUploadError('刪除失敗: ' + (error instanceof Error ? error.message : '未知錯誤'));
    }
  };

  const handleClose = () => {
    setUploadError(null);
    setDownloadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  };

  const currentTotalSize = getCurrentTotalSize();

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={`檔案管理 - ${projectName}`}>
      <div className="space-y-6">
        {/* 檔案概況 */}
        <div className="bg-info/10 border border-info/30 rounded-md p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-info">
              已上傳檔案：{attachments.length}/{MAX_FILES}
            </span>
            <span className="text-info">
              總大小：{formatFileSize(currentTotalSize)}/5MB
            </span>
          </div>
          <div className="mt-2 bg-info/20 rounded-full h-2">
            <div
              className="bg-info h-2 rounded-full transition-all duration-300"
              style={{ width: `${Math.min((currentTotalSize / MAX_TOTAL_SIZE) * 100, 100)}%` }}
            />
          </div>
        </div>

        {/* 已上傳檔案列表 */}
        <div>
          <h4 className="text-md font-semibold text-foreground/80 mb-3 flex items-center">
            <LinkIcon className="h-4 w-4 mr-2" />
            已上傳檔案 ({attachments.length})
          </h4>

          {attachments.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {attachments.map((attachment, _index) => {
                const fileType = getFileType(attachment.name);
                return (
                  <div key={attachment.path} className="bg-secondary p-3 rounded-lg border">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center flex-1 min-w-0">
                        <div className="flex-shrink-0 mr-3">
                          {fileType === 'image' && <div className="w-6 h-6 bg-success/15 rounded flex items-center justify-center text-xs">🖼️</div>}
                          {fileType === 'document' && <div className="w-6 h-6 bg-info/15 rounded flex items-center justify-center text-xs">📄</div>}
                          {fileType === 'spreadsheet' && <div className="w-6 h-6 bg-warning/15 rounded flex items-center justify-center text-xs">📊</div>}
                          {fileType === 'file' && <div className="w-6 h-6 bg-muted rounded flex items-center justify-center text-xs">📎</div>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-foreground truncate text-sm" title={attachment.name}>
                            {attachment.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(attachment.size)} • {new Date(attachment.uploadedAt).toLocaleString('zh-TW')}
                          </p>
                        </div>
                      </div>

                      <div className="flex space-x-1 ml-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-info hover:text-info/80 hover:bg-info/10"
                          onClick={() => handleFilePreview(attachment)}
                          title="預覽"
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-success hover:text-success/80 hover:bg-success/10"
                          onClick={() => handleFileDownload(attachment)}
                          title="下載"
                        >
                          <Download className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive/80 hover:bg-destructive/10"
                          onClick={() => handleFileDelete(attachment)}
                          title="刪除"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="mx-auto h-8 w-8 mb-2" />
              <p>尚未上傳任何檔案</p>
            </div>
          )}
        </div>

        {/* 上傳新檔案 */}
        <div className="border-t pt-4">
          <h4 className="text-md font-semibold text-foreground/80 mb-3">上傳新檔案</h4>

          <div className="bg-warning/10 border border-warning/30 rounded-md p-3 mb-3">
            <p className="text-xs text-warning">
              <strong>重要說明：</strong><br />
              • 最多可上傳 5 個檔案，總大小不可超過 5MB<br />
              • 上傳第 6 個檔案時會自動刪除最舊的檔案<br />
              • 中文檔名會自動轉換為英文檔名（保留原始檔名顯示）<br />
              • 支援格式：PDF, Word, Excel, 圖片等常見格式
            </p>
          </div>

          <Input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            disabled={uploading || currentTotalSize >= MAX_TOTAL_SIZE}
            className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.txt,.zip,.rar"
          />

          {currentTotalSize >= MAX_TOTAL_SIZE && (
            <div className="mt-2 bg-destructive/10 border border-destructive/30 rounded-md p-2">
              <p className="text-sm text-destructive">
                已達檔案大小上限，請刪除部分檔案後再上傳
              </p>
            </div>
          )}

          {uploading && (
            <div className="mt-2 flex items-center text-sm text-primary">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary mr-2"></div>
              上傳中，請稍候...
            </div>
          )}

          {uploadError && (
            <div className="mt-2 bg-destructive/10 border border-destructive/30 rounded-md p-2">
              <p className="text-sm text-destructive">{uploadError}</p>
            </div>
          )}

          {downloadError && (
            <div className="mt-2 bg-destructive/10 border border-destructive/30 rounded-md p-2">
              <p className="text-sm text-destructive">{downloadError}</p>
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