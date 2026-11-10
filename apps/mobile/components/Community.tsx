import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { createClientMessageId } from '../lib/clientMessageId';
import { Socket } from 'socket.io-client';
import {
  api,
  Conversation,
  Listing,
  Message,
  PublicProfile,
  User,
  WalletData,
  Ticket,
  SupportMessage,
} from '../api';
export const theme = {
  green: '#174D3C',
  ink: '#17352B',
  muted: '#728078',
  line: '#DFE7DC',
  cream: '#F6F8F2',
  lime: '#DDF5A1',
};
export function Action({
  label,
  onPress,
  disabled = false,
  secondary = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[cs.action, secondary && cs.secondary, disabled && { opacity: 0.45 }]}
    >
      <Text style={{ color: secondary ? theme.green : 'white', fontWeight: '700', fontSize: 13 }}>
        {label}
      </Text>
    </Pressable>
  );
}
export function ErrorText({ message }: { message: string }) {
  return message ? (
    <Text accessibilityRole="alert" style={{ color: '#AB3838', lineHeight: 22 }}>
      {message}
    </Text>
  ) : null;
}
const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Đã có lỗi xảy ra.');
export function Wallet({ socket }: { socket: Socket | null }) {
  const [wallet, setWallet] = useState<WalletData | null>(null),
    [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      setWallet(await api<WalletData>('/wallet'));
      setError('');
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    void load();
    socket?.on('wallet:updated', load);
    socket?.on('connect', load);
    return () => {
      socket?.off('wallet:updated', load);
      socket?.off('connect', load);
    };
  }, [socket, load]);
  return (
    <View style={{ gap: 18 }}>
      <ErrorText message={error} />
      <View style={cs.wallet}>
        <Text style={{ color: theme.lime, fontSize: 11, fontWeight: '800', letterSpacing: 2 }}>
          ĐIỂM TRI THỨC CỦA BẠN
        </Text>
        <Text style={{ fontSize: 56, color: 'white', fontWeight: '900' }}>
          {wallet?.balance ?? '—'}
          <Text style={{ fontSize: 17 }}> điểm</Text>
        </Text>
        <Text style={{ color: '#D9E8D3', lineHeight: 23 }}>
          Mỗi lần mua bán hoàn thành, thêm một cơ hội nhận sách mới.
        </Text>
      </View>
      <View style={cs.panel}>
        <Text style={cs.heading}>Tích điểm từ những giao dịch thật</Text>
        <Text style={cs.copy}>
          +10 điểm cho mỗi bên khi mua bán được cả hai xác nhận.{'\n'}20 điểm để nhận một sách miễn
          phí, trừ khi người bán chấp nhận.{'\n'}Hủy giao dịch sẽ được hoàn điểm; đổi/tặng không
          cộng điểm.
        </Text>
        <Text style={cs.small}>
          Chống tích điểm lặp: mỗi cặp được thưởng một lần/24 giờ; tối đa 30 điểm/ngày UTC/người.
          Điểm không quy đổi thành tiền.
        </Text>
        <Action label="Cập nhật số dư" secondary onPress={() => void load()} />
      </View>
      <Text style={cs.heading}>Lịch sử điểm</Text>
      {wallet?.history.map((p) => (
        <View key={p.id} style={[cs.panel, { flexDirection: 'row', alignItems: 'center' }]}>
          <View style={{ flex: 1, gap: 5 }}>
            <Text style={cs.heading}>{p.note}</Text>
            <Text style={cs.small}>
              {new Date(p.created_at).toLocaleString('vi-VN')} · Số dư {p.balance_after}
            </Text>
          </View>
          <Text
            style={{
              fontSize: 22,
              fontWeight: '800',
              color: p.delta > 0 ? theme.green : '#AF623A',
            }}
          >
            {p.delta > 0 ? '+' : ''}
            {p.delta}
          </Text>
        </View>
      ))}
      {wallet && !wallet.history.length && (
        <Text style={cs.copy}>
          Chưa có lịch sử. Hoàn thành giao dịch mua bán để nhận điểm đầu tiên.
        </Text>
      )}
    </View>
  );
}
export function UserProfile({ id, onBook }: { id: string; onBook: (item: Listing) => void }) {
  const [profile, setProfile] = useState<PublicProfile | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    api<PublicProfile>(`/users/${id}`)
      .then((p) => {
        if (live) setProfile(p);
      })
      .catch((e) => {
        if (live) setError(errorMessage(e));
      });
    return () => {
      live = false;
    };
  }, [id]);
  if (!profile)
    return (
      <View>
        <ErrorText message={error} />
        {!error && <ActivityIndicator color={theme.green} />}
      </View>
    );
  return (
    <View style={{ gap: 17 }}>
      <View style={[cs.panel, { backgroundColor: '#F1F6E9', alignItems: 'center' }]}>
        <View style={cs.avatar}>
          <Text style={{ fontSize: 29, color: theme.green, fontWeight: '800' }}>
            {profile.name.trim().charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={[cs.heading, { fontSize: 24 }]}>{profile.name}</Text>
        <Text style={cs.copy}>
          {profile.school} · {profile.area}
        </Text>
        <Text style={{ fontWeight: '800', color: theme.green }}>
          ★ {profile.rating ?? 'Chưa có sao'} · {profile.review_count} đánh giá
        </Text>
        <Text style={cs.small}>
          {profile.completed_count} giao dịch hoàn thành · {profile.badge}
        </Text>
        {!!profile.bio && <Text style={[cs.copy, { textAlign: 'center' }]}>{profile.bio}</Text>}
        <Text style={cs.small}>
          Thành viên từ {new Date(profile.created_at).toLocaleDateString('vi-VN')}
        </Text>
      </View>
      <Text style={cs.heading}>Nhận xét từ giao dịch đã hoàn thành</Text>
      {profile.reviews.map((r) => (
        <View key={r.id} style={cs.panel}>
          <Text style={{ color: '#B17C1E', fontWeight: '800' }}>
            {'★'.repeat(r.rating)}
            {'☆'.repeat(5 - r.rating)}
          </Text>
          <Text style={cs.heading}>{r.author_name}</Text>
          <Text style={cs.copy}>{r.comment || 'Không có nhận xét bằng chữ.'}</Text>
          <Text style={cs.small}>
            {r.title} · {new Date(r.created_at).toLocaleDateString('vi-VN')}
          </Text>
        </View>
      ))}
      {!profile.reviews.length && (
        <Text style={cs.copy}>Thành viên chưa có đánh giá giao dịch.</Text>
      )}
      <Text style={cs.heading}>Sách đang chia sẻ · {profile.listings.length}</Text>
      {profile.listings.map((l) => (
        <Pressable accessibilityRole="button" key={l.id} onPress={() => onBook(l)} style={cs.panel}>
          <Text style={cs.heading}>{l.title}</Text>
          <Text style={cs.copy}>
            {l.kind === 'sell'
              ? l.price.toLocaleString('vi-VN') + 'đ'
              : l.kind === 'free'
                ? l.point_cost + ' điểm'
                : 'Trao đổi'}{' '}
            · {l.area}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
export function Inbox({
  user,
  socket,
  onOpen,
}: {
  user: User;
  socket: Socket | null;
  onOpen: (c: Conversation) => void;
}) {
  const [items, setItems] = useState<Conversation[]>([]),
    [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      setItems(await api<Conversation[]>('/conversations'));
      setError('');
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    void load();
    socket?.on('message:new', load);
    socket?.on('conversation:updated', load);
    socket?.on('connect', load);
    return () => {
      socket?.off('message:new', load);
      socket?.off('conversation:updated', load);
      socket?.off('connect', load);
    };
  }, [load, socket]);
  return (
    <View style={{ gap: 14 }}>
      <ErrorText message={error} />
      <Text style={cs.copy}>
        Hỏi tình trạng sách, thương lượng và hẹn nhận trước khi gửi yêu cầu mua.
      </Text>
      <Action label="Làm mới hộp thư" secondary onPress={() => void load()} />
      {items.map((c) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={'Mở chat ' + c.title}
          key={c.id}
          onPress={() => onOpen(c)}
          style={[cs.panel, { flexDirection: 'row', gap: 14 }]}
        >
          <View style={cs.avatar}>
            <Text style={{ color: theme.green, fontWeight: '800', fontSize: 22 }}>
              {(c.buyer_id === user.id ? c.seller_name : c.buyer_name).charAt(0)}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={cs.heading}>
              {c.buyer_id === user.id ? c.seller_name : c.buyer_name}
              {c.unread ? '  ● ' + c.unread : ''}
            </Text>
            <Text style={cs.small}>{c.title}</Text>
            <Text numberOfLines={2} style={cs.copy}>
              {c.last_message || 'Bắt đầu trao đổi về tài liệu này.'}
            </Text>
          </View>
        </Pressable>
      ))}
      {!items.length && (
        <View style={cs.panel}>
          <Text style={cs.heading}>Chưa có cuộc trò chuyện</Text>
          <Text style={cs.copy}>
            Mở một cuốn sách rồi chọn “Nhắn người bán”. Bạn chưa cần gửi yêu cầu mua.
          </Text>
        </View>
      )}
    </View>
  );
}
function mergeMessages(old: Message[], incoming: Message[]) {
  const map = new Map(old.map((m) => [m.id, m]));
  incoming.forEach((m) => map.set(m.id, m));
  return [...map.values()].sort((a, b) =>
    BigInt(a.seq) < BigInt(b.seq) ? -1 : BigInt(a.seq) > BigInt(b.seq) ? 1 : 0,
  );
}
export function RealtimeChat({
  conversation: c,
  user,
  socket,
  connected,
}: {
  conversation: Conversation;
  user: User;
  socket: Socket | null;
  connected: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>([]),
    [body, setBody] = useState(''),
    [error, setError] = useState(''),
    [sending, setSending] = useState(false),
    [hasOlder, setHasOlder] = useState(false),
    [typing, setTyping] = useState('');
  const latest = useRef<string | null>(null),
    typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    pending = useRef<{ body: string; client_id: string } | null>(null);
  const append = useCallback((incoming: Message[]) => {
    setMessages((old) => mergeMessages(old, incoming));
    for (const m of incoming)
      if (!latest.current || BigInt(m.seq) > BigInt(latest.current)) latest.current = m.seq;
  }, []);
  const read = useCallback(() => {
    void api(`/conversations/${c.id}/read`, 'POST').catch(() => {});
  }, [c.id]);
  const sync = useCallback(async () => {
    try {
      let cursor = latest.current;
      if (cursor) {
        let more = true;
        while (more) {
          const r: { items: Message[]; has_more: boolean } = await api<{
            items: Message[];
            has_more: boolean;
          }>(`/conversations/${c.id}/messages?after=${cursor}&limit=100`);
          append(r.items);
          if (r.items.length) cursor = r.items[r.items.length - 1]!.seq;
          more = r.has_more && r.items.length > 0;
        }
      } else {
        const r = await api<{ items: Message[]; has_more: boolean }>(
          `/conversations/${c.id}/messages`,
        );
        append(r.items);
        setHasOlder(r.has_more);
      }
      setError('');
      read();
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [c.id, append, read]);
  useEffect(() => {
    void sync();
    const receive = (m: Message) => {
      if (m.conversation_id === c.id) {
        append([m]);
        read();
      }
    };
    const receiveTyping = (d: { conversation_id: string; name: string }) => {
      if (d.conversation_id !== c.id) return;
      setTyping(d.name + ' đang soạn tin…');
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setTyping(''), 2200);
    };
    socket?.on('message:new', receive);
    socket?.on('connect', sync);
    socket?.on('typing', receiveTyping);
    return () => {
      socket?.off('message:new', receive);
      socket?.off('connect', sync);
      socket?.off('typing', receiveTyping);
      if (typingTimer.current) clearTimeout(typingTimer.current);
    };
  }, [socket, c.id, sync, append, read]);
  const send = async () => {
    if (sending || !body.trim()) return;
    setSending(true);
    setError('');
    try {
      if (!pending.current || pending.current.body !== body.trim())
        pending.current = { body: body.trim(), client_id: createClientMessageId() };
      const m = await api<Message>(`/conversations/${c.id}/messages`, 'POST', pending.current);
      append([m]);
      setBody('');
      pending.current = null;
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  };
  return (
    <View style={{ gap: 15 }}>
      <View style={[cs.panel, { backgroundColor: '#F0F5E8' }]}>
        <Text style={cs.heading}>{c.buyer_id === user.id ? c.seller_name : c.buyer_name}</Text>
        <Text style={cs.small}>{c.title}</Text>
        <Text style={{ color: connected ? theme.green : '#AF623A', fontSize: 12 }}>
          {connected ? '● Realtime đã kết nối' : '○ Đang kết nối lại — có thể tải lại lịch sử'}
        </Text>
      </View>
      <ErrorText message={error} />
      <Action label="Đồng bộ lịch sử" secondary onPress={() => void sync()} />
      {hasOlder && (
        <Action
          label="Tải tin nhắn cũ hơn"
          secondary
          onPress={() =>
            void (async () => {
              try {
                const r: { items: Message[]; has_more: boolean } = await api<{
                  items: Message[];
                  has_more: boolean;
                }>(`/conversations/${c.id}/messages?before=${messages[0]?.seq}`);
                append(r.items);
                setHasOlder(r.has_more);
              } catch (e) {
                setError(errorMessage(e));
              }
            })()
          }
        />
      )}
      <View style={{ gap: 10, minHeight: 180 }}>
        {messages.map((m) => (
          <View
            key={m.id}
            style={[
              cs.bubble,
              {
                alignSelf: m.sender_id === user.id ? 'flex-end' : 'flex-start',
                backgroundColor: m.sender_id === user.id ? '#E5F0D7' : '#F0F2EE',
              },
            ]}
          >
            <Text style={cs.small}>{m.sender_name}</Text>
            <Text style={{ color: theme.ink, lineHeight: 23 }}>{m.body}</Text>
            <Text style={[cs.small, { fontSize: 10 }]}>
              {new Date(m.created_at).toLocaleTimeString('vi-VN')}
            </Text>
          </View>
        ))}
        {!messages.length && (
          <Text style={cs.copy}>Chào hỏi người bán và hỏi về cuốn sách bạn quan tâm.</Text>
        )}
      </View>
      {!!typing && <Text style={cs.small}>{typing}</Text>}
      <TextInput
        accessibilityLabel="Nội dung tin nhắn"
        multiline
        placeholder="Nhắn về sách, giá hoặc điểm hẹn…"
        value={body}
        onChangeText={(v) => {
          setBody(v);
          socket?.emit('typing', { conversation_id: c.id });
        }}
        maxLength={2000}
        style={[cs.input, { minHeight: 75 }]}
      />
      <Action
        label={sending ? 'Đang gửi…' : 'Gửi tin nhắn'}
        disabled={sending || !body.trim() || c.listing_status === 'hidden'}
        onPress={() => void send()}
      />
      <Text style={cs.small}>
        Tin nhắn riêng giữa hai bên. Khi mất mạng, giữ nội dung và thử gửi lại; cùng mã tin sẽ không
        tạo bản trùng.
      </Text>
    </View>
  );
}
export function SupportBox({ user, socket }: { user: User | null; socket: Socket | null }) {
  const [messages, setMessages] = useState<{ role: string; body: string }[]>([
      {
        role: 'bot',
        body: 'Chào bạn! Mình hỗ trợ về điểm, mua bán, chat, bản đồ và đánh giá. Mình trả lời theo hướng dẫn có sẵn; bạn có thể gửi phiếu cho quản trị viên bên dưới.',
      },
    ]),
    [body, setBody] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [tickets, setTickets] = useState<Ticket[]>([]),
    [ticket, setTicket] = useState<Ticket | null>(null),
    [replies, setReplies] = useState<SupportMessage[]>([]),
    [subject, setSubject] = useState(''),
    [detail, setDetail] = useState(''),
    [reply, setReply] = useState('');
  const load = useCallback(async () => {
    if (user) {
      const items = await api<Ticket[]>('/support/tickets');
      setTickets(items);
      setTicket((current) => (current ? items.find((t) => t.id === current.id) || current : null));
    }
  }, [user?.id]);
  const read = useCallback(async () => {
    if (ticket) setReplies(await api<SupportMessage[]>(`/support/tickets/${ticket.id}/messages`));
  }, [ticket?.id]);
  useEffect(() => {
    void load().catch((e) => setError(errorMessage(e)));
    const update = () => {
      void load().catch(() => {});
      void read().catch(() => {});
    };
    socket?.on('support:new', update);
    socket?.on('connect', update);
    return () => {
      socket?.off('support:new', update);
      socket?.off('connect', update);
    };
  }, [load, read, socket]);
  useEffect(() => {
    void read().catch((e) => setError(errorMessage(e)));
  }, [read]);
  const act = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const ask = (message: string) =>
    void act(async () => {
      setMessages((old) => [...old, { role: 'you', body: message }]);
      setBody('');
      const r = await api<{ answer: string }>('/support/chat', 'POST', { message });
      setMessages((old) => [...old, { role: 'bot', body: r.answer }]);
    });
  return (
    <View style={{ gap: 17 }}>
      <ErrorText message={error} />
      <View style={cs.panel}>
        <Text style={cs.heading}>Trợ lý EduShare</Text>
        <Text style={cs.small}>Hướng dẫn tự động theo FAQ · Có chuyển tiếp tới người hỗ trợ</Text>
        {messages.map((m, i) => (
          <View
            key={i}
            style={[
              cs.bubble,
              {
                alignSelf: m.role === 'you' ? 'flex-end' : 'flex-start',
                backgroundColor: m.role === 'you' ? '#E3F0D4' : '#F2F4EE',
              },
            ]}
          >
            <Text style={cs.small}>{m.role === 'you' ? 'Bạn' : 'EduShare'}</Text>
            <Text style={{ lineHeight: 23, color: theme.ink }}>{m.body}</Text>
          </View>
        ))}
        <View style={cs.row}>
          {['Cách nhận điểm', 'Chat trước khi mua', 'Ghim vị trí', 'Đánh giá uy tín'].map((q) => (
            <Action key={q} label={q} secondary disabled={busy} onPress={() => ask(q)} />
          ))}
        </View>
        <TextInput
          accessibilityLabel="Hỏi trợ lý hỗ trợ"
          placeholder="Bạn cần hỗ trợ điều gì?"
          value={body}
          onChangeText={setBody}
          style={cs.input}
        />
        <Action label="Gửi câu hỏi" disabled={busy || !body.trim()} onPress={() => ask(body)} />
      </View>
      {!user ? (
        <Text style={cs.copy}>Đăng nhập để gửi phiếu hỗ trợ riêng cho quản trị viên.</Text>
      ) : (
        <>
          <View style={cs.panel}>
            <Text style={cs.heading}>Gửi yêu cầu cho người hỗ trợ</Text>
            <TextInput
              accessibilityLabel="Tiêu đề hỗ trợ"
              placeholder="Tiêu đề yêu cầu"
              value={subject}
              onChangeText={setSubject}
              style={cs.input}
            />
            <TextInput
              accessibilityLabel="Chi tiết yêu cầu hỗ trợ"
              placeholder="Mô tả sự việc và mã giao dịch nếu có"
              value={detail}
              onChangeText={setDetail}
              multiline
              style={[cs.input, { minHeight: 85 }]}
            />
            <Action
              label="Tạo phiếu hỗ trợ"
              disabled={busy || subject.trim().length < 3 || detail.trim().length < 5}
              onPress={() =>
                void act(async () => {
                  await api('/support/tickets', 'POST', { subject, body: detail });
                  setSubject('');
                  setDetail('');
                  await load();
                })
              }
            />
          </View>
          <Text style={cs.heading}>
            {user.role === 'admin' ? 'Phiếu của cộng đồng' : 'Phiếu hỗ trợ của bạn'}
          </Text>
          <Action
            label="Cập nhật phiếu"
            secondary
            onPress={() =>
              void act(async () => {
                await load();
                await read();
              })
            }
          />
          {tickets.map((t) => (
            <Pressable
              accessibilityRole="button"
              key={t.id}
              onPress={() => setTicket(t)}
              style={[cs.panel, ticket?.id === t.id && { borderColor: theme.green }]}
            >
              <Text style={cs.heading}>{t.subject}</Text>
              <Text style={cs.small}>
                {t.user_name} · {t.status === 'open' ? 'Đang hỗ trợ' : 'Đã xử lý'}
              </Text>
            </Pressable>
          ))}
          {ticket && (
            <View style={cs.panel}>
              <Text style={cs.heading}>{ticket.subject}</Text>
              {replies.map((m) => (
                <View key={m.id} style={cs.bubble}>
                  <Text style={cs.small}>
                    {m.sender_name}
                    {m.role === 'admin' ? ' · Quản trị viên' : ''}
                  </Text>
                  <Text style={cs.copy}>{m.body}</Text>
                </View>
              ))}
              {ticket.status === 'open' && (
                <>
                  <TextInput
                    accessibilityLabel="Trả lời phiếu hỗ trợ"
                    value={reply}
                    onChangeText={setReply}
                    placeholder="Nhập phản hồi"
                    multiline
                    style={cs.input}
                  />
                  <Action
                    label="Gửi phản hồi"
                    disabled={busy || !reply.trim()}
                    onPress={() =>
                      void act(async () => {
                        await api(`/support/tickets/${ticket.id}/messages`, 'POST', {
                          body: reply,
                        });
                        setReply('');
                        await read();
                      })
                    }
                  />
                  {user.role === 'admin' && (
                    <Action
                      label="Đánh dấu phiếu đã xử lý"
                      secondary
                      disabled={busy}
                      onPress={() =>
                        void act(async () => {
                          await api(`/admin/support/${ticket.id}/resolve`, 'POST');
                          setTicket({ ...ticket, status: 'resolved' });
                          await load();
                        })
                      }
                    />
                  )}
                </>
              )}
            </View>
          )}
        </>
      )}
    </View>
  );
}
const cs = StyleSheet.create({
  panel: {
    padding: 20,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: 'white',
    gap: 12,
  },
  heading: { fontSize: 16, fontWeight: '800', color: theme.ink, lineHeight: 23 },
  copy: { fontSize: 14, color: theme.muted, lineHeight: 24 },
  small: { fontSize: 12, color: theme.muted, lineHeight: 20 },
  action: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: theme.green,
    alignItems: 'center',
  },
  secondary: { backgroundColor: '#EFF4E9', borderWidth: 1, borderColor: theme.line },
  wallet: { padding: 28, gap: 16, borderRadius: 24, backgroundColor: theme.green },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.lime,
  },
  bubble: { maxWidth: '94%', gap: 6, padding: 14, borderRadius: 15, backgroundColor: '#F3F5EF' },
  input: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: '#FAFCF7',
    color: theme.ink,
    fontSize: 14,
  },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
});
