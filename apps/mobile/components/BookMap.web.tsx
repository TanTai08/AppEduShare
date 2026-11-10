import React, { useMemo, useEffect, useRef } from 'react';
import { mapHtml, validPin, MapProps } from './mapHtml';
export default function BookMap({ pin, editable = false, onChange }: MapProps) {
  const ref = useRef<HTMLIFrameElement>(null);
  const html = useMemo(() => mapHtml(pin, editable), [editable]);
  useEffect(() => {
    const receive = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow || !editable) return;
      const d = e.data;
      if (d?.type === 'edushare:pin' && validPin(d.pin)) onChange?.(d.pin);
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [editable, onChange]);
  return (
    <iframe
      ref={ref}
      title={editable ? 'Chọn điểm hẹn trên bản đồ' : 'Bản đồ điểm hẹn nhận sách'}
      srcDoc={html}
      sandbox="allow-scripts"
      style={{ width: '100%', height: 260, border: '1px solid #D9E5DC', borderRadius: 16 }}
    />
  );
}
