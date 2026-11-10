import React, { useRef, useState } from 'react';
import { PhotoPickerProps, PickedPhoto, MAX_PHOTO_BYTES } from './photoTypes';
export default function PhotoPicker({ remaining, disabled, onFiles, onError }: PhotoPickerProps) {
  const input = useRef<HTMLInputElement>(null),
    [busy, setBusy] = useState(false);
  const read = async (files: File[]) => {
    setBusy(true);
    try {
      if (files.length > remaining) {
        onError(`Chỉ thêm được ${remaining} ảnh. Mỗi tin tối đa 5 ảnh.`);
        return;
      }
      if (files.some((f) => f.size > MAX_PHOTO_BYTES)) {
        onError('Ảnh tối đa 5 MB. Hãy chọn ảnh nhỏ hơn.');
        return;
      }
      if (files.some((f) => !['image/jpeg', 'image/png', 'image/webp'].includes(f.type))) {
        onError('Chọn JPG, PNG hoặc WebP.');
        return;
      }
      const selected = await Promise.all(
        files.map(
          (file) =>
            new Promise<PickedPhoto>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                const uri = String(reader.result);
                resolve({ uri, base64: uri.slice(uri.indexOf(',') + 1), name: file.name });
              };
              reader.onerror = () => reject(new Error('Không đọc được ảnh.'));
              reader.readAsDataURL(file);
            }),
        ),
      );
      await onFiles(selected);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Không chọn được ảnh.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  return (
    <div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        aria-label="Chọn ảnh tài liệu"
        disabled={disabled || busy || remaining <= 0}
        onChange={(e) => void read(Array.from(e.currentTarget.files || []))}
        style={{ display: 'none' }}
      />
      <button
        type="button"
        disabled={disabled || busy || remaining <= 0}
        onClick={() => input.current?.click()}
        style={{
          width: '100%',
          padding: 13,
          borderRadius: 11,
          border: '1px solid #DFE7DC',
          background: '#E8F0DF',
          color: '#174D3C',
          fontWeight: 700,
          cursor: 'pointer',
          opacity: disabled || remaining <= 0 ? 0.5 : 1,
        }}
      >
        {busy ? 'Đang đọc ảnh…' : `+ Chọn ảnh tài liệu (còn ${remaining})`}
      </button>
    </div>
  );
}
