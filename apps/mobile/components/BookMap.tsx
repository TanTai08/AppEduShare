import React, { useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { mapHtml, validPin, MapProps } from './mapHtml';
export default function BookMap({ pin, editable = false, onChange }: MapProps) {
  const [error, setError] = useState(false);
  const html = useMemo(() => mapHtml(pin, editable), [editable]);
  return (
    <View
      style={{
        height: 260,
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#D9E5DC',
      }}
    >
      {error ? (
        <Text>Bản đồ cần kết nối Internet. Bạn có thể nhập tọa độ thủ công.</Text>
      ) : (
        <WebView
          source={{ html }}
          originWhitelist={['*']}
          userAgent="EduShare/2.0 (+https://github.com/TanTai08/AppEduShare) Mobile"
          javaScriptEnabled
          onError={() => setError(true)}
          onMessage={(e) => {
            try {
              const data = JSON.parse(e.nativeEvent.data);
              if (editable && data.type === 'edushare:pin' && validPin(data.pin))
                onChange?.(data.pin);
            } catch {}
          }}
          onShouldStartLoadWithRequest={(r) =>
            !r.isTopFrame ||
            r.url === 'about:blank' ||
            r.url.startsWith('about:blank#') ||
            r.url.startsWith('data:text/html') ||
            r.url.startsWith('file://')
          }
        />
      )}
    </View>
  );
}
