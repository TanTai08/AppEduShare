import React, { useState } from 'react';
import { View, Text, Pressable, Linking, StyleSheet } from 'react-native';
import { API_ADDRESS, API_URL, DEVICE_LABEL, checkApiHealth } from '../api';
export default function ConnectionPanel() {
  const [busy, setBusy] = useState(false),
    [result, setResult] = useState(''),
    [ok, setOk] = useState(false);
  const test = async () => {
    setBusy(true);
    setResult('');
    try {
      await checkApiHealth();
      setOk(true);
      setResult('Đã kết nối API và PostgreSQL. Bạn có thể đăng nhập.');
    } catch (e) {
      setOk(false);
      setResult(e instanceof Error ? e.message : 'Không kiểm tra được kết nối.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={s.panel}>
      <Text style={s.title}>Kết nối máy chủ</Text>
      <Text style={s.small}>
        {DEVICE_LABEL} · {API_ADDRESS.source}
      </Text>
      <Text selectable style={s.url}>
        {API_URL || 'Chưa có URL API hợp lệ'}
      </Text>
      {API_ADDRESS.warnings.map((w) => (
        <Text key={w} style={s.small}>
          {w}
        </Text>
      ))}
      {!!API_ADDRESS.error && <Text style={s.error}>{API_ADDRESS.error}</Text>}
      <View style={s.row}>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void test()}
          style={[s.button, busy && { opacity: 0.5 }]}
        >
          <Text style={s.buttonText}>{busy ? 'Đang kiểm tra…' : 'Kiểm tra API'}</Text>
        </Pressable>
        {!!API_URL && (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              void Linking.openURL(API_URL + '/api/health').catch(() => {
                setOk(false);
                setResult(
                  'Không mở được trình duyệt. Sao chép URL API ở trên và thêm /api/health.',
                );
              })
            }
            style={s.secondary}
          >
            <Text style={s.title}>Mở trang health</Text>
          </Pressable>
        )}
      </View>
      {!!result && (
        <Text accessibilityRole="alert" style={ok ? s.success : s.error}>
          {result}
        </Text>
      )}
      <Text style={s.small}>
        URL ứng dụng nằm trong apps/mobile/.env. server/.env chỉ cấu hình backend. Sau khi sửa .env,
        dừng và chạy lại Expo với --clear.
      </Text>
    </View>
  );
}
const s = StyleSheet.create({
  panel: {
    padding: 15,
    gap: 9,
    borderWidth: 1,
    borderColor: '#D9E5D5',
    borderRadius: 13,
    backgroundColor: '#F4F8ED',
  },
  title: { fontSize: 12, color: '#174D3C', fontWeight: '700' },
  small: { fontSize: 11, lineHeight: 18, color: '#69776F' },
  url: { fontSize: 13, color: '#174D3C', fontWeight: '700' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  button: { backgroundColor: '#174D3C', borderRadius: 9, padding: 11 },
  buttonText: { color: 'white', fontSize: 12, fontWeight: '700' },
  secondary: { backgroundColor: '#E7EFDF', borderRadius: 9, padding: 11 },
  error: { color: '#A73434', lineHeight: 21, fontSize: 12 },
  success: { color: '#174D3C', lineHeight: 21, fontSize: 12 },
});
