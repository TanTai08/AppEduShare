import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { api } from '../api';
import categories from '../../../ai/categories.json';

type Suggestion = { category: string; label: string; score: number };
interface Classification {
  classification_id: string;
  model_version: string;
  abstained: boolean;
  suggestions: Suggestion[];
}
export const categoryLabel = (id?: string) => categories.find((c) => c.id === id)?.label || '';

export default function AiSuggestion({
  title,
  description,
  category,
  disabled,
  onCategoryChange,
  onClassificationChange,
}: {
  title: string;
  description: string;
  category: string;
  disabled: boolean;
  onCategoryChange: (category: string) => void;
  onClassificationChange: (id: string | undefined) => void;
}) {
  const [result, setResult] = useState<Classification | null>(null);
  const [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  const [manual, setManual] = useState(false);
  const revision = useRef(0);
  useEffect(() => {
    revision.current++;
    setResult(null);
    setError('');
    setLoading(false);
    onClassificationChange(undefined);
    return () => {
      revision.current++;
    };
  }, [title, description, onClassificationChange]);
  const classify = async () => {
    const current = ++revision.current;
    setLoading(true);
    setError('');
    setResult(null);
    onClassificationChange(undefined);
    try {
      const response = await api<Classification>('/ai/classify', 'POST', { title, description });
      if (current !== revision.current) return;
      setResult(response);
      onClassificationChange(response.classification_id);
    } catch (e) {
      if (current === revision.current) {
        setError(
          e instanceof Error ? e.message : 'Chưa lấy được gợi ý AI. Bạn có thể chọn nhóm thủ công.',
        );
        setManual(true);
      }
    } finally {
      if (current === revision.current) setLoading(false);
    }
  };
  const canClassify = title.trim().length >= 3 && (title.trim() + description.trim()).length >= 10;
  return (
    <View
      style={{
        borderRadius: 14,
        padding: 15,
        gap: 12,
        backgroundColor: '#F0F5E9',
        borderWidth: 1,
        borderColor: '#DFE7D8',
      }}
    >
      <Text style={{ color: '#174D3C', fontWeight: '800', fontSize: 16 }}>Nhóm tài liệu</Text>
      <Text style={{ color: '#52665B', lineHeight: 21 }}>
        AI gợi ý từ tên và mô tả. Bạn kiểm tra và chọn nhóm phù hợp trước khi đăng.
      </Text>
      <Text accessibilityLiveRegion="polite" style={{ fontWeight: '700', color: '#174D3C' }}>
        Đã chọn: {categoryLabel(category) || 'Chưa phân loại'}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="AI gợi ý phân loại"
        disabled={disabled || loading || !canClassify}
        onPress={() => void classify()}
        style={{
          backgroundColor: '#174D3C',
          borderRadius: 10,
          padding: 13,
          opacity: disabled || loading || !canClassify ? 0.5 : 1,
        }}
      >
        {loading ? (
          <View style={{ flexDirection: 'row', gap: 9, justifyContent: 'center' }}>
            <ActivityIndicator color="#FFFFFF" />
            <Text style={{ color: '#FFFFFF' }}>Đang phân loại…</Text>
          </View>
        ) : (
          <Text style={{ color: '#FFFFFF', fontWeight: '700', textAlign: 'center' }}>
            ✦ AI gợi ý phân loại
          </Text>
        )}
      </Pressable>
      {!canClassify && (
        <Text style={{ color: '#69776F', fontSize: 12 }}>
          Nhập tên và mô tả rõ hơn để nhận gợi ý.
        </Text>
      )}
      {!!error && (
        <Text accessibilityRole="alert" style={{ color: '#A73434' }}>
          {error}
        </Text>
      )}
      {result && (
        <View style={{ gap: 9 }}>
          <Text style={{ color: '#52665B', lineHeight: 21 }}>
            {result.abstained
              ? 'Chưa đủ chắc chắn để đề xuất một nhóm. Bạn có thể chọn trong các nhóm tham khảo hoặc chọn thủ công.'
              : 'Gợi ý theo thứ tự phù hợp. Nhấn một nhóm để áp dụng:'}
          </Text>
          {result.suggestions.map((s, index) => (
            <Pressable
              key={s.category}
              accessibilityRole="button"
              accessibilityLabel={`Áp dụng ${s.label}`}
              disabled={disabled}
              onPress={() => onCategoryChange(s.category)}
              style={{
                padding: 12,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: category === s.category ? '#174D3C' : '#DCE5D5',
                backgroundColor: category === s.category ? '#DDF5A1' : '#FFFFFF',
              }}
            >
              <Text style={{ color: '#174D3C', fontWeight: '700' }}>
                {index + 1}. {s.label}
                {category === s.category ? ' · Đã chọn' : ''}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: manual }}
        disabled={disabled}
        onPress={() => setManual(!manual)}
      >
        <Text style={{ color: '#174D3C', fontWeight: '700', paddingVertical: 5 }}>
          {manual ? 'Ẩn danh sách nhóm' : 'Chọn nhóm thủ công'}
        </Text>
      </Pressable>
      {manual && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {[{ id: '', label: 'Chưa phân loại' }, ...categories].map((c) => (
            <Pressable
              key={c.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: category === c.id }}
              accessibilityLabel={`Chọn nhóm ${c.label}`}
              disabled={disabled}
              onPress={() => onCategoryChange(c.id)}
              style={{
                padding: 10,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: '#DCE5D5',
                backgroundColor: category === c.id ? '#DDF5A1' : '#FFFFFF',
              }}
            >
              <Text style={{ color: '#174D3C' }}>{c.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
