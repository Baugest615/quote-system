'use client'

import { useState, useRef, useEffect } from 'react';
import supabase from '@/lib/supabase/client';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, Link as LinkIcon } from 'lucide-react';

interface Attachment { name: string; url: string; path: string; }

interface FileModalProps {
  isOpen: boolean;
  onClose: () => void;
  quote: { id: string; project_name: string; attachments: any; } | null;
  onUpdate: () => void;
}

export function FileModal({ isOpen, onClose, quote, onUpdate }: FileModalProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [needsUpdate, setNeedsUpdate] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // **CRASH FIX**: This useEffect waits for the modal to be closed BEFORE refreshing the parent page.
  useEffect(() => {
  try {
    if (!isOpen && needsUpdate) {
      onUpdate();
      setNeedsUpdate(false);
    }
  } catch (err) {
    console.error('[FileModal Update Error]', err);
  }
}, [isOpen, needsUpdate, onUpdate]);

  if (!quote) return null;

  const currentAttachment: Attachment | null = (quote.attachments && Array.isArray(quote.attachments) && quote.attachments.length > 0) ? quote.attachments[0] : null;

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setUploadError(null);

    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setUploadError('檔案大小不可超過 5MB');
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploading(true);
    // **400 ERROR FIX**: Properly encode the filename for the URL.
    const encodedFileName = encodeURIComponent(file.name);
    const uploadPath = `quotations/${quote.id}/${encodedFileName}`;

    if (currentAttachment?.path && currentAttachment.path !== uploadPath) {
      await supabase.storage.from('attachments').remove([currentAttachment.path]);
    }

    const { error: uploadError } = await supabase.storage
      .from('attachments')
      .upload(uploadPath, file, { cacheControl: '3600', upsert: true });

    if (uploadError) {
      setUploadError('檔案上傳失敗: ' + uploadError.message);
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(uploadPath);
    const newAttachment = {
      name: file.name, // Save the original name for display
      url: urlData.publicUrl,
      path: uploadPath,
      uploadedAt: new Date().toISOString()
    };
    
    const { error: dbError } = await supabase
      .from('quotations')
      .update({ attachments: [newAttachment] })
      .eq('id', quote.id);

    setUploading(false);
    
    if (dbError) {
      setUploadError('更新報價單資料失敗: ' + dbError.message);
    } else {
      alert('檔案已成功上傳！');
      // **CRASH FIX**: Mark that an update is needed, then close the modal.
      setNeedsUpdate(true);
      onClose();
    }
  };

  const handleFileDelete = async () => {
    if (!currentAttachment?.path) return;
    if (window.confirm(`確定要刪除檔案 "${currentAttachment.name}" 嗎？`)) {
      await supabase.storage.from('attachments').remove([currentAttachment.path]);
      await supabase.from('quotations').update({ attachments: [] }).eq('id', quote.id);
      alert('檔案已成功刪除！');
      // **CRASH FIX**: Mark that an update is needed, then close the modal.
      setNeedsUpdate(true);
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`檔案管理 - ${quote.project_name}`}>
      <div className="space-y-4">
        <div>
          <h4 className="text-md font-semibold text-gray-700 mb-2">已上傳檔案</h4>
          {currentAttachment ? (
            <div className="flex items-center justify-between bg-gray-50 p-3 rounded">
              <a href={currentAttachment.url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline truncate flex items-center">
                <LinkIcon className="h-4 w-4 mr-2" />
                {currentAttachment.name}
              </a>
              <Button variant="ghost" size="icon" className="text-red-500" onClick={handleFileDelete}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ) : ( <p className="text-gray-500 italic text-sm">尚無檔案</p> )}
        </div>
        <div className="border-t pt-4">
            <h4 className="text-md font-semibold text-gray-700 mb-2">上傳新檔案</h4>
            <p className="text-xs text-gray-500 mb-2">注意：上傳新檔將會覆蓋舊有檔案。檔案大小限制為 5MB。</p>
            <Input type="file" ref={fileInputRef} onChange={handleFileUpload} disabled={uploading} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"/>
            {uploading && <p className="text-sm text-indigo-600 mt-2">上傳中，請稍候...</p>}
            {uploadError && <p className="text-sm text-red-500 mt-2">{uploadError}</p>}
        </div>
        <div className="flex justify-end pt-4">
          <Button variant="outline" onClick={onClose}>關閉</Button>
        </div>
      </div>
    </Modal>
  );
}