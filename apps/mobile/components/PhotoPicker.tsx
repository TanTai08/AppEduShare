import React, { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { PhotoPickerProps, MAX_PHOTO_BYTES } from './photoTypes';
export default function PhotoPicker({ remaining, disabled, onFiles, onError }: PhotoPickerProps) {
  const [opening, setOpening] = useState(false);
  const choose = async () => {
    if (opening || disabled || remaining <= 0) return;
    setOpening(true);
    try {
      // Lazy loading keeps the app usable even if a stale Expo Go lacks ImagePicker.
      const picker = await import('expo-image-picker');
      const permission = await picker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        onError('Bạn chưa cấp quyền truy cập ảnh. Cho phép chọn ảnh trong Cài đặt của thiết bị.');
        return;
      }
      const result = await picker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        quality: 0.75,
        base64: true,
        exif: false,
      });
      if (result.canceled) return;
      const selected = result.assets.slice(0, remaining);
      if (
        selected.some(
          (asset) =>
            !asset.base64 ||
            (asset.base64.length * 3) / 4 -
              (asset.base64.endsWith('==') ? 2 : asset.base64.endsWith('=') ? 1 : 0) >
              MAX_PHOTO_BYTES,
        )
      ) {
        onError('Ảnh tối đa 5 MB. Hãy chọn ảnh nhỏ hơn.');
        return;
      }
      await onFiles(
        selected.map((asset, index) => ({
          uri: asset.uri,
          base64: asset.base64!,
          name: asset.fileName || `Ảnh ${index + 1}`,
        })),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      onError(
        /native module|ExpoImagePicker/i.test(message)
          ? 'Không mở được thư viện ảnh. Cập nhật Expo Go phù hợp hoặc đăng ảnh từ bản web.'
          : message || 'Không chọn được ảnh. Hãy thử lại.',
      );
    } finally {
      setOpening(false);
    }
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Chọn ảnh tài liệu"
      disabled={disabled || opening || remaining <= 0}
      onPress={() => void choose()}
      style={{
        padding: 13,
        borderRadius: 11,
        backgroundColor: '#E8F0DF',
        alignItems: 'center',
        opacity: disabled || remaining <= 0 ? 0.5 : 1,
      }}
    >
      <Text style={{ fontWeight: '700', color: '#174D3C' }}>
        {opening ? 'Đang mở ảnh…' : `+ Chọn ảnh tài liệu (còn ${remaining})`}
      </Text>
    </Pressable>
  );
}
