import React, { useState } from 'react';
import { Image, View, Text, Pressable, ScrollView } from 'react-native';
import { MediaImage, imageUri } from '../api';
export default function PhotoGallery({ images }: { images: MediaImage[] }) {
  const [selected, setSelected] = useState(0);
  const photo = images[selected] || images[0];
  if (!photo) return null;
  return (
    <View style={{ gap: 10 }}>
      <Image
        accessibilityLabel="Ảnh tài liệu chi tiết"
        source={{ uri: imageUri(photo) }}
        resizeMode="contain"
        style={{ width: '100%', height: 280, borderRadius: 13, backgroundColor: '#F3F5EE' }}
      />
      <Text style={{ fontSize: 12, color: '#69776F' }}>
        Ảnh {Math.min(selected + 1, images.length)}/{images.length}
      </Text>
      {images.length > 1 && (
        <ScrollView horizontal contentContainerStyle={{ gap: 9 }}>
          {images.map((p, index) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Xem ảnh ${index + 1}`}
              key={p.id}
              onPress={() => setSelected(index)}
              style={{
                borderRadius: 10,
                borderWidth: 2,
                borderColor: index === selected ? '#174D3C' : 'transparent',
                padding: 2,
              }}
            >
              <Image
                source={{ uri: imageUri(p, true) }}
                style={{ width: 64, height: 64, borderRadius: 7 }}
              />
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
