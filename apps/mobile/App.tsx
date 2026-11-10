import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Modal,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  api,
  restoreToken,
  saveToken,
  User,
  Listing,
  Transaction,
  Message,
  Notice,
  AdminData,
} from './api';

const C = {
  green: '#174D3C',
  lime: '#DDF5A1',
  bg: '#F6F7F2',
  ink: '#172F26',
  muted: '#69776F',
  line: '#DFE5DC',
  white: '#FFFFFF',
};
const kinds = { sell: 'Mua bán', exchange: 'Trao đổi', free: 'Miễn phí' };
const statuses: Record<string, string> = {
  active: 'Đang đăng',
  reserved: 'Đang giữ chỗ',
  completed: 'Hoàn thành',
  hidden: 'Đã ẩn',
  pending: 'Chờ chấp nhận',
  accepted: 'Đang giao nhận',
  cancelled: 'Đã hủy',
};
const money = (n: number) => new Intl.NumberFormat('vi-VN').format(n) + 'đ';
type Tab = 'home' | 'saved' | 'mine' | 'transactions' | 'notifications' | 'profile' | 'admin';
type Overlay =
  | { type: 'auth' }
  | { type: 'listing'; item?: Listing }
  | { type: 'detail'; item: Listing }
  | { type: 'chat'; tx: Transaction }
  | { type: 'review'; tx: Transaction }
  | { type: 'report'; item: Listing }
  | null;
function Button({
  label,
  onPress,
  secondary = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondary,
        { opacity: disabled ? 0.45 : pressed ? 0.75 : 1 },
      ]}
    >
      <Text style={[s.buttonText, secondary && { color: C.green }]}>{label}</Text>
    </Pressable>
  );
}
function Field({
  label,
  value,
  onChange,
  secure = false,
  multiline = false,
  number = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  secure?: boolean;
  multiline?: boolean;
  number?: boolean;
}) {
  return (
    <View style={{ gap: 7 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        secureTextEntry={secure}
        multiline={multiline}
        keyboardType={number ? 'numeric' : 'default'}
        autoCapitalize={secure || label.includes('Email') ? 'none' : 'sentences'}
        style={[s.input, multiline && { minHeight: 95, textAlignVertical: 'top' }]}
      />
    </View>
  );
}
function Choices({
  values,
  value,
  onChange,
}: {
  values: Record<string, string>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={s.row}>
      {Object.entries(values).map(([key, label]) => (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: key === value }}
          key={key}
          onPress={() => onChange(key)}
          style={[s.chip, key === value && s.chipActive]}
        >
          <Text style={[s.chipText, key === value && { color: C.white }]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function App() {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [user, setUser] = useState<User | null>(null),
    [tab, setTab] = useState<Tab>('home'),
    [overlay, setOverlay] = useState<Overlay>(null);
  const [items, setItems] = useState<Listing[]>([]),
    [mine, setMine] = useState<Listing[]>([]),
    [saved, setSaved] = useState<Listing[]>([]),
    [transactions, setTransactions] = useState<Transaction[]>([]),
    [notices, setNotices] = useState<Notice[]>([]),
    [admin, setAdmin] = useState<AdminData | null>(null);
  const [query, setQuery] = useState(''),
    [area, setArea] = useState(''),
    [school, setSchool] = useState(''),
    [kind, setKind] = useState(''),
    [sort, setSort] = useState('new');
  const [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState(''),
    [error, setError] = useState(''),
    [ready, setReady] = useState(false);
  const showError = (e: unknown) => setError(e instanceof Error ? e.message : 'Đã xảy ra lỗi.');
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'home') {
        const params = new URLSearchParams({
          q: query,
          area,
          school,
          sort,
          ...(kind ? { kind } : {}),
        });
        setItems((await api<{ items: Listing[] }>(`/listings?${params}`)).items);
      } else if (user) {
        if (tab === 'mine') setMine(await api<Listing[]>('/my/listings'));
        if (tab === 'saved') setSaved(await api<Listing[]>('/favorites'));
        if (tab === 'transactions') setTransactions(await api<Transaction[]>('/transactions'));
        if (tab === 'notifications') setNotices(await api<Notice[]>('/notifications'));
        if (tab === 'admin') setAdmin(await api<AdminData>('/admin'));
      }
    } catch (e) {
      showError(e);
    } finally {
      setLoading(false);
    }
  }, [tab, user, query, area, school, kind, sort]);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        if (await restoreToken()) {
          const me = await api<User>('/me');
          if (live) setUser(me);
        }
      } catch (e) {
        await saveToken('');
        if (live) showError(e);
      } finally {
        if (live) setReady(true);
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      void refresh();
    }, 250);
    return () => clearTimeout(timer);
  }, [ready, refresh]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  const act = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };
  const guarded = (fn: () => void) => {
    if (user) fn();
    else setOverlay({ type: 'auth' });
  };
  const go = (next: Tab) => {
    setError('');
    if (next === 'home') setTab(next);
    else guarded(() => setTab(next));
  };
  const openDetail = async (item: Listing) => {
    await act(async () =>
      setOverlay({ type: 'detail', item: await api<Listing>(`/listings/${item.id}`) }),
    );
  };
  const tabs: [Tab, string, string][] = [
    ['home', '⌂', 'Khám phá'],
    ['saved', '♡', 'Đã lưu'],
    ['mine', '▤', 'Tin của tôi'],
    ['transactions', '⇄', 'Giao dịch'],
    ['notifications', '○', 'Thông báo'],
    ['profile', '◎', 'Tài khoản'],
  ];
  if (user?.role === 'admin') tabs.push(['admin', '⚙', 'Quản trị']);
  const list = tab === 'home' ? items : tab === 'saved' ? saved : mine;
  const txAction = (tx: Transaction, action: string) =>
    act(async () => {
      await api(`/transactions/${tx.id}/action`, 'POST', { action });
      await refresh();
      setToast('Đã cập nhật giao dịch.');
    });

  return (
    <View style={s.app}>
      <StatusBar style="dark" />
      <View style={[s.header, { paddingHorizontal: wide ? 36 : 18 }]}>
        <Pressable onPress={() => go('home')} style={s.brand}>
          <View style={s.logo}>
            <Text style={{ color: C.lime, fontSize: 25, fontWeight: '900' }}>e</Text>
          </View>
          <Text style={s.brandText}>
            edu<Text style={{ color: '#5E8D60' }}>share</Text>
            <Text style={{ fontSize: 13 }}> ●</Text>
          </Text>
        </Pressable>
        <View style={s.row}>
          {wide && <Text style={s.muted}>Tài liệu cũ · Hành trình mới</Text>}
          <Button
            label={user ? user.name : 'Đăng nhập'}
            secondary
            onPress={() => (user ? go('profile') : setOverlay({ type: 'auth' }))}
          />
        </View>
      </View>
      <View style={{ flex: 1, flexDirection: wide ? 'row' : 'column' }}>
        {wide && (
          <View style={s.sidebar}>
            <Text style={s.overline}>KHÔNG GIAN SINH VIÊN</Text>
            {tabs.map(([key, icon, label]) => (
              <Pressable
                key={key}
                onPress={() => go(key)}
                style={[s.nav, tab === key && s.navActive]}
              >
                <Text style={[s.navText, tab === key && { color: C.green, fontWeight: '800' }]}>
                  {icon} {label}
                </Text>
              </Pressable>
            ))}
            <View style={s.sidebarTip}>
              <Text style={s.subtitle}>Chia sẻ tri thức.</Text>
              <Text style={s.muted}>Một cuốn sách trao đi, một cơ hội học tập mở ra.</Text>
              <Button
                label="+ Đăng tài liệu"
                onPress={() => guarded(() => setOverlay({ type: 'listing' }))}
              />
            </View>
            <Text style={[s.muted, { marginTop: 'auto', fontSize: 11 }]}>
              EDUSHARE · ĐỒ ÁN SINH VIÊN
            </Text>
          </View>
        )}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            padding: wide ? 32 : 18,
            paddingBottom: 45,
            gap: 22,
            maxWidth: 1300,
            width: '100%',
            alignSelf: 'center',
          }}
          keyboardShouldPersistTaps="handled"
        >
          {!!error && (
            <View accessibilityRole="alert" style={s.error}>
              <Text style={{ color: '#9C2D2D', flex: 1 }}>{error}</Text>
              <Pressable onPress={() => setError('')}>
                <Text>Đóng</Text>
              </Pressable>
            </View>
          )}
          {!!toast && (
            <View accessibilityRole="alert" style={s.success}>
              <Text style={{ color: C.green }}>{toast}</Text>
            </View>
          )}
          {tab === 'home' && (
            <>
              <View style={[s.hero, { padding: wide ? 34 : 23 }]}>
                <View style={{ flex: 1, gap: 15 }}>
                  <Text style={[s.overline, { color: C.lime }]}>CỘNG ĐỒNG HỌC TẬP QUANH BẠN</Text>
                  <Text style={[s.heroTitle, { fontSize: wide ? 43 : 32 }]}>
                    Tri thức tiếp nối,{'\n'}chi phí nhẹ hơn.
                  </Text>
                  <Text style={{ color: '#DCE9DA', fontSize: 15, lineHeight: 24, maxWidth: 460 }}>
                    Mua, bán và trao đổi tài liệu cùng sinh viên trong khu vực. Tìm đúng tài liệu,
                    kết nối đúng người.
                  </Text>
                  <View style={s.row}>
                    <Pressable
                      style={[s.button, { backgroundColor: C.lime }]}
                      onPress={() => guarded(() => setOverlay({ type: 'listing' }))}
                    >
                      <Text style={{ color: C.green, fontWeight: '800' }}>+ Chia sẻ tài liệu</Text>
                    </Pressable>
                    <Text style={{ color: '#DCE9DA', fontSize: 12 }}>
                      Học cùng nhau. Đi xa hơn.
                    </Text>
                  </View>
                </View>
                {wide && (
                  <View style={s.bookStack}>
                    <View
                      style={[
                        s.heroBook,
                        { backgroundColor: '#BADD94', transform: [{ rotate: '-12deg' }] },
                      ]}
                    >
                      <Text style={s.heroBookText}>
                        HỌC{'\n'}HỎI{'\n'}MỖI NGÀY.
                      </Text>
                      <Text style={{ color: C.green }}>EDUSHARE / 01</Text>
                    </View>
                    <View
                      style={[
                        s.heroBook,
                        {
                          backgroundColor: '#F2E5B1',
                          transform: [{ rotate: '10deg' }],
                          marginLeft: -15,
                          marginTop: 35,
                        },
                      ]}
                    >
                      <Text style={s.heroBookText}>
                        CHIA SẺ{'\n'}ĐỂ{'\n'}TIẾN XA.
                      </Text>
                      <Text style={{ color: C.green }}>EDUSHARE / 02</Text>
                    </View>
                  </View>
                )}
              </View>
              <View style={s.panel}>
                <Text style={s.subtitle}>Bạn đang tìm tài liệu gì?</Text>
                <TextInput
                  accessibilityLabel="Tìm tài liệu"
                  placeholder="Tìm theo tên tài liệu, môn học…"
                  value={query}
                  onChangeText={setQuery}
                  style={s.input}
                />
                <View style={s.row}>
                  <TextInput
                    accessibilityLabel="Khu vực"
                    placeholder="Khu vực, ví dụ Đà Nẵng"
                    value={area}
                    onChangeText={setArea}
                    style={[s.input, { flex: 1, minWidth: 160 }]}
                  />
                  <TextInput
                    accessibilityLabel="Trường học"
                    placeholder="Trường học, ví dụ VKU"
                    value={school}
                    onChangeText={setSchool}
                    style={[s.input, { flex: 1, minWidth: 160 }]}
                  />
                </View>
                <View style={[s.row, { justifyContent: 'space-between' }]}>
                  <Choices values={{ '': 'Tất cả', ...kinds }} value={kind} onChange={setKind} />
                  <Choices
                    values={{ new: 'Mới nhất', price: 'Giá tăng dần' }}
                    value={sort}
                    onChange={setSort}
                  />
                </View>
              </View>
            </>
          )}
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <View style={{ gap: 6 }}>
              <Text style={s.title}>
                {
                  {
                    home: 'Tài liệu dành cho bạn',
                    saved: 'Tủ sách đã lưu',
                    mine: 'Tài liệu của tôi',
                    transactions: 'Giao dịch & tin nhắn',
                    notifications: 'Thông báo của bạn',
                    profile: 'Hồ sơ sinh viên',
                    admin: 'Bảng quản trị',
                  }[tab]
                }
              </Text>
              <Text style={s.muted}>
                {tab === 'home'
                  ? 'Khám phá những tài liệu đang sẵn sàng trong cộng đồng.'
                  : 'Quản lý hoạt động và kết nối của bạn trên EduShare.'}
              </Text>
            </View>
            <Button
              label={tab === 'mine' ? '+ Đăng tin' : 'Làm mới'}
              secondary
              onPress={() => (tab === 'mine' ? setOverlay({ type: 'listing' }) : void refresh())}
            />
          </View>
          {loading && <ActivityIndicator color={C.green} />}
          {['home', 'saved', 'mine'].includes(tab) && (
            <View style={s.grid}>
              {list.map((item, index) => (
                <View
                  key={item.id}
                  style={[s.card, { width: wide ? '31.8%' : width >= 600 ? '48%' : '100%' }]}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Xem ${item.title}`}
                    onPress={() => void openDetail(item)}
                  >
                    <View
                      style={[
                        s.cover,
                        {
                          backgroundColor: ['#E9EEDC', '#F1E5D7', '#DFE9E4', '#E5E3EE'][index % 4],
                        },
                      ]}
                    >
                      <View
                        style={[
                          s.book,
                          {
                            backgroundColor: ['#36594A', '#AA6A3B', '#46746E', '#666287'][
                              index % 4
                            ],
                          },
                        ]}
                      >
                        <Text style={{ color: '#DCE8CF', fontSize: 9, letterSpacing: 2 }}>
                          TỦ SÁCH SINH VIÊN
                        </Text>
                        <Text numberOfLines={4} style={s.bookTitle}>
                          {item.title}
                        </Text>
                        <View style={{ height: 2, backgroundColor: '#FFFFFF55', width: 35 }} />
                        <Text style={{ color: '#FFFFFFBB', fontSize: 10 }}>{item.subject}</Text>
                      </View>
                      <View style={s.coverBadge}>
                        <Text style={{ fontSize: 11, color: C.green, fontWeight: '700' }}>
                          {kinds[item.kind]}
                        </Text>
                      </View>
                    </View>
                    <View style={{ padding: 17, gap: 9 }}>
                      <Text style={s.overline}>{item.subject.toUpperCase()}</Text>
                      <Text numberOfLines={2} style={s.subtitle}>
                        {item.title}
                      </Text>
                      <Text style={{ fontSize: 20, fontWeight: '800', color: C.green }}>
                        {item.kind === 'sell'
                          ? money(item.price)
                          : item.kind === 'free'
                            ? 'Tặng miễn phí'
                            : 'Cùng trao đổi'}
                      </Text>
                      <Text numberOfLines={1} style={s.muted}>
                        ⌖ {item.area} · {item.school}
                      </Text>
                      <View
                        style={[
                          s.row,
                          {
                            justifyContent: 'space-between',
                            borderTopWidth: 1,
                            borderColor: C.line,
                            paddingTop: 12,
                          },
                        ]}
                      >
                        <Text style={s.muted}>{item.owner_name}</Text>
                        <Text style={{ color: C.green, fontSize: 12 }}>
                          {item.owner_rating ? `★ ${item.owner_rating}` : item.condition}
                        </Text>
                      </View>
                      {tab === 'mine' && <Text style={s.label}>{statuses[item.status]}</Text>}
                    </View>
                  </Pressable>
                  {tab === 'mine' && (
                    <View style={[s.row, { padding: 12, paddingTop: 0 }]}>
                      <Button
                        label="Sửa"
                        secondary
                        disabled={!['active', 'hidden'].includes(item.status)}
                        onPress={() => setOverlay({ type: 'listing', item })}
                      />
                      <Button
                        label={item.status === 'hidden' ? 'Hiện tin' : 'Ẩn tin'}
                        secondary
                        disabled={!['active', 'hidden'].includes(item.status)}
                        onPress={() =>
                          void act(async () => {
                            await api(`/listings/${item.id}/visibility`, 'POST');
                            await refresh();
                          })
                        }
                      />
                    </View>
                  )}
                </View>
              ))}
              {!loading && list.length === 0 && (
                <Empty text="Chưa có tài liệu phù hợp. Thử đổi bộ lọc hoặc đăng tài liệu đầu tiên." />
              )}
            </View>
          )}
          {tab === 'transactions' && (
            <View style={{ gap: 14 }}>
              {transactions.map((tx) => (
                <View key={tx.id} style={s.panel}>
                  <View style={[s.row, { justifyContent: 'space-between' }]}>
                    <Text style={s.subtitle}>{tx.title}</Text>
                    <Text style={s.badge}>{statuses[tx.status]}</Text>
                  </View>
                  <Text style={s.muted}>
                    {tx.buyer_name} ⇄ {tx.seller_name}
                  </Text>
                  {!!tx.offered_title && <Text>Đổi với: {tx.offered_title}</Text>}
                  {!!tx.note && <Text style={s.muted}>Lời nhắn: {tx.note}</Text>}
                  <View style={s.row}>
                    <Button
                      label="Tin nhắn"
                      secondary
                      onPress={() => setOverlay({ type: 'chat', tx })}
                    />
                    {tx.status === 'pending' && tx.seller_id === user?.id && (
                      <Button
                        label="Chấp nhận"
                        disabled={busy}
                        onPress={() => void txAction(tx, 'accept')}
                      />
                    )}
                    {['pending', 'accepted'].includes(tx.status) && (
                      <Button
                        label="Hủy yêu cầu"
                        secondary
                        disabled={busy}
                        onPress={() => void txAction(tx, 'cancel')}
                      />
                    )}
                    {tx.status === 'accepted' && (
                      <Button
                        label={
                          (tx.buyer_id === user?.id ? tx.buyer_confirmed : tx.seller_confirmed)
                            ? 'Đã xác nhận · Chờ bên kia'
                            : 'Xác nhận giao nhận'
                        }
                        disabled={
                          busy ||
                          !!(tx.buyer_id === user?.id ? tx.buyer_confirmed : tx.seller_confirmed)
                        }
                        onPress={() => void txAction(tx, 'confirm')}
                      />
                    )}
                    {tx.status === 'completed' && (
                      <Button
                        label={tx.my_rating ? `Đã đánh giá ${tx.my_rating}★` : 'Đánh giá'}
                        disabled={!!tx.my_rating}
                        onPress={() => setOverlay({ type: 'review', tx })}
                      />
                    )}
                  </View>
                </View>
              ))}
              {!loading && !transactions.length && (
                <Empty text="Chưa có giao dịch. Hãy mở một tài liệu để gửi yêu cầu mua hoặc trao đổi." />
              )}
            </View>
          )}
          {tab === 'notifications' && (
            <View style={{ gap: 12 }}>
              <Button
                label="Đánh dấu tất cả đã đọc"
                secondary
                onPress={() =>
                  void act(async () => {
                    await api('/notifications/read', 'POST');
                    await refresh();
                  })
                }
              />
              {notices.map((n) => (
                <Pressable
                  key={n.id}
                  onPress={() => go('transactions')}
                  style={[s.panel, { backgroundColor: n.read_at ? C.white : '#EDF5E5' }]}
                >
                  <Text style={s.subtitle}>{n.body}</Text>
                  <Text style={s.muted}>{new Date(n.created_at).toLocaleString('vi-VN')}</Text>
                </Pressable>
              ))}
              {!notices.length && <Empty text="Bạn chưa có thông báo mới." />}
            </View>
          )}
          {tab === 'profile' && user && (
            <View style={s.panel}>
              <Text style={s.subtitle}>{user.email}</Text>
              <Text style={s.muted}>
                {user.role === 'admin'
                  ? 'Quản trị viên'
                  : 'Tài khoản sinh viên · Email chưa xác minh'}
              </Text>
              <Profile
                user={user}
                busy={busy}
                onSave={(body) =>
                  void act(async () => {
                    setUser(await api<User>('/me', 'PATCH', body));
                    setToast('Đã cập nhật hồ sơ.');
                  })
                }
              />
              <Button
                label="Đăng xuất"
                secondary
                onPress={() =>
                  void act(async () => {
                    await api('/auth/logout', 'POST');
                    await saveToken('');
                    setUser(null);
                    setTab('home');
                    setMine([]);
                    setSaved([]);
                    setTransactions([]);
                    setNotices([]);
                    setAdmin(null);
                    setOverlay(null);
                  })
                }
              />
            </View>
          )}
          {tab === 'admin' && admin && (
            <View style={{ gap: 18 }}>
              <View style={s.row}>
                {Object.entries(admin.stats).map(([k, v]) => (
                  <View key={k} style={[s.panel, { flex: 1, minWidth: 120 }]}>
                    <Text style={{ fontSize: 30, fontWeight: '800', color: C.green }}>{v}</Text>
                    <Text style={s.muted}>
                      {
                        {
                          users: 'Người dùng',
                          listings: 'Tin đăng',
                          completed: 'Giao dịch xong',
                          reports: 'Báo cáo mở',
                        }[k]
                      }
                    </Text>
                  </View>
                ))}
              </View>
              <Text style={s.subtitle}>Báo cáo vi phạm</Text>
              {admin.reports.map((r) => (
                <View key={r.id} style={s.panel}>
                  <Text style={s.subtitle}>{r.title}</Text>
                  <Text>{r.reason}</Text>
                  <Text style={s.muted}>
                    {r.reporter_name} · {r.status === 'open' ? 'Chưa xử lý' : 'Đã xử lý'}
                  </Text>
                  <View style={s.row}>
                    <Button
                      label="Ẩn tin đăng"
                      secondary
                      disabled={busy}
                      onPress={() =>
                        void act(async () => {
                          await api(`/admin/listings/${r.listing_id}/hide`, 'POST');
                          await refresh();
                        })
                      }
                    />
                    <Button
                      label="Đánh dấu đã xử lý"
                      disabled={busy || r.status === 'resolved'}
                      onPress={() =>
                        void act(async () => {
                          await api(`/admin/reports/${r.id}/resolve`, 'POST');
                          await refresh();
                        })
                      }
                    />
                  </View>
                </View>
              ))}
              {!admin.reports.length && <Empty text="Chưa có báo cáo vi phạm." />}
              <Text style={s.subtitle}>Kiểm duyệt tin đăng</Text>
              {admin.listings.map((l) => (
                <View key={l.id} style={s.panel}>
                  <Text style={s.subtitle}>{l.title}</Text>
                  <Text style={s.muted}>
                    {l.owner_name} · {statuses[l.status]}
                  </Text>
                  <Button
                    label="Ẩn tin vi phạm"
                    secondary
                    disabled={busy || l.status === 'hidden'}
                    onPress={() =>
                      void act(async () => {
                        await api(`/admin/listings/${l.id}/hide`, 'POST');
                        await refresh();
                      })
                    }
                  />
                </View>
              ))}
            </View>
          )}
          <Text style={{ color: C.muted, fontSize: 11, textAlign: 'center', marginTop: 18 }}>
            EduShare — Kết nối tri thức trong cộng đồng sinh viên.{'\n'}Giao nhận trực tiếp · Không
            thu tiền trong ứng dụng
          </Text>
        </ScrollView>
        {!wide && (
          <View style={s.bottomNav}>
            {tabs.map(([key, icon, label]) => (
              <Pressable
                key={key}
                onPress={() => go(key)}
                style={{ alignItems: 'center', padding: 8, flex: 1 }}
              >
                <Text style={{ fontSize: 21, color: tab === key ? C.green : C.muted }}>{icon}</Text>
                <Text style={{ fontSize: 9, color: tab === key ? C.green : C.muted }}>{label}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
      <Modal
        visible={!!overlay}
        transparent
        animationType="fade"
        onRequestClose={() => setOverlay(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={s.backdrop}
        >
          <View style={[s.modal, { maxHeight: '92%', width: wide ? 600 : '95%' }]}>
            <View
              style={[
                s.row,
                {
                  justifyContent: 'space-between',
                  padding: 20,
                  borderBottomWidth: 1,
                  borderColor: C.line,
                },
              ]}
            >
              <Text style={s.subtitle}>
                {
                  {
                    auth: 'Chào mừng đến EduShare',
                    listing: 'Thông tin tài liệu',
                    detail: 'Chi tiết tài liệu',
                    chat: 'Trao đổi giao nhận',
                    review: 'Đánh giá giao dịch',
                    report: 'Báo cáo tin đăng',
                  }[overlay?.type || 'auth']
                }
              </Text>
              <Button
                label="Đóng"
                secondary
                onPress={() => {
                  setOverlay(null);
                  setError('');
                }}
              />
            </View>
            <ScrollView
              contentContainerStyle={{ padding: 22, gap: 17 }}
              keyboardShouldPersistTaps="handled"
            >
              {!!error && (
                <Text accessibilityRole="alert" style={{ color: '#A73434' }}>
                  {error}
                </Text>
              )}
              {overlay?.type === 'auth' && (
                <AuthForm
                  busy={busy}
                  onSubmit={(body, register) =>
                    void act(async () => {
                      const result = await api<{ token: string; user: User }>(
                        register ? '/auth/register' : '/auth/login',
                        'POST',
                        body,
                      );
                      await saveToken(result.token);
                      setUser(result.user);
                      setOverlay(null);
                      setToast('Đăng nhập thành công.');
                    })
                  }
                />
              )}
              {overlay?.type === 'listing' && user && (
                <ListingForm
                  item={overlay.item}
                  user={user}
                  busy={busy}
                  onSave={(body) =>
                    void act(async () => {
                      await api(
                        overlay.item ? `/listings/${overlay.item.id}` : '/listings',
                        overlay.item ? 'PATCH' : 'POST',
                        body,
                      );
                      setOverlay(null);
                      setTab('mine');
                      setMine(await api<Listing[]>('/my/listings'));
                      setToast('Đã lưu tài liệu.');
                    })
                  }
                />
              )}
              {overlay?.type === 'detail' && (
                <Detail
                  item={overlay.item}
                  user={user}
                  busy={busy}
                  onSave={() =>
                    guarded(
                      () =>
                        void act(async () => {
                          const r = await api<{ saved: boolean }>(
                            `/favorites/${overlay.item.id}`,
                            'POST',
                          );
                          setToast(r.saved ? 'Đã lưu vào tủ sách.' : 'Đã bỏ lưu.');
                        }),
                    )
                  }
                  onReport={() => guarded(() => setOverlay({ type: 'report', item: overlay.item }))}
                  onRequest={(offered, note) =>
                    guarded(
                      () =>
                        void act(async () => {
                          await api('/transactions', 'POST', {
                            listing_id: overlay.item.id,
                            ...(offered ? { offered_listing_id: offered } : {}),
                            note,
                          });
                          setOverlay(null);
                          setTab('transactions');
                          setToast('Đã gửi yêu cầu. Hãy nhắn tin để hẹn giao nhận.');
                        }),
                    )
                  }
                />
              )}
              {overlay?.type === 'chat' && user && (
                <Chat tx={overlay.tx} user={user} onError={showError} />
              )}
              {overlay?.type === 'review' && (
                <ReviewForm
                  busy={busy}
                  onSubmit={(body) =>
                    void act(async () => {
                      await api(`/transactions/${overlay.tx.id}/reviews`, 'POST', body);
                      setOverlay(null);
                      await refresh();
                      setToast('Cảm ơn bạn đã đánh giá.');
                    })
                  }
                />
              )}
              {overlay?.type === 'report' && (
                <ReportForm
                  busy={busy}
                  onSubmit={(reason) =>
                    void act(async () => {
                      await api('/reports', 'POST', { listing_id: overlay.item.id, reason });
                      setOverlay(null);
                      setToast('Đã gửi báo cáo cho quản trị viên.');
                    })
                  }
                />
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <View style={[s.panel, { width: '100%', padding: 35, alignItems: 'center' }]}>
      <Text style={{ fontSize: 30, color: C.green }}>▤</Text>
      <Text style={[s.muted, { textAlign: 'center', lineHeight: 24 }]}>{text}</Text>
    </View>
  );
}
function AuthForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (b: Record<string, string>, register: boolean) => void;
}) {
  const [register, setRegister] = useState(false),
    [name, setName] = useState(''),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [school, setSchool] = useState('VKU'),
    [area, setArea] = useState('Đà Nẵng');
  return (
    <View style={{ gap: 15 }}>
      <Choices
        values={{ login: 'Đăng nhập', register: 'Tạo tài khoản' }}
        value={register ? 'register' : 'login'}
        onChange={(v) => setRegister(v === 'register')}
      />
      {register && <Field label="Họ tên" value={name} onChange={setName} />}
      <Field label="Email" value={email} onChange={setEmail} />
      <Field label="Mật khẩu (tối thiểu 8 ký tự)" value={password} onChange={setPassword} secure />
      {register && (
        <>
          <Field label="Trường học" value={school} onChange={setSchool} />
          <Field label="Khu vực" value={area} onChange={setArea} />
        </>
      )}
      <Button
        label={busy ? 'Đang xử lý…' : register ? 'Tạo tài khoản' : 'Đăng nhập'}
        disabled={busy || !email || !password || (register && (!name || !school || !area))}
        onPress={() =>
          onSubmit(
            register ? { name, email, password, school, area } : { email, password },
            register,
          )
        }
      />
      <Text style={s.muted}>
        Bản đồ án dùng tài khoản cục bộ. Thông tin tài khoản demo nằm trong README.
      </Text>
    </View>
  );
}
function ListingForm({
  item,
  user,
  busy,
  onSave,
}: {
  item?: Listing;
  user: User;
  busy: boolean;
  onSave: (b: unknown) => void;
}) {
  const [title, setTitle] = useState(item?.title || ''),
    [description, setDescription] = useState(item?.description || ''),
    [subject, setSubject] = useState(item?.subject || ''),
    [school, setSchool] = useState(item?.school || user.school),
    [area, setArea] = useState(item?.area || user.area),
    [kind, setKind] = useState(item?.kind || 'sell'),
    [price, setPrice] = useState(String(item?.price || '')),
    [condition, setCondition] = useState(item?.condition || 'Như mới');
  return (
    <View style={{ gap: 15 }}>
      <Text style={s.muted}>
        Đăng sách hoặc tài liệu bản giấy bạn có quyền chuyển nhượng. Không đăng bản sao vi phạm bản
        quyền.
      </Text>
      <Field label="Tên tài liệu" value={title} onChange={setTitle} />
      <Field label="Môn học" value={subject} onChange={setSubject} />
      <Field
        label="Mô tả, địa điểm giao và mong muốn trao đổi"
        value={description}
        onChange={setDescription}
        multiline
      />
      <Choices values={kinds} value={kind} onChange={(v) => setKind(v as Listing['kind'])} />
      {kind === 'sell' && <Field label="Giá bán (VNĐ)" value={price} onChange={setPrice} number />}
      <Field label="Trường học" value={school} onChange={setSchool} />
      <Field label="Khu vực" value={area} onChange={setArea} />
      <Choices
        values={{ Mới: 'Mới', 'Như mới': 'Như mới', 'Đã sử dụng': 'Đã sử dụng' }}
        value={condition}
        onChange={setCondition}
      />
      <Button
        label={busy ? 'Đang lưu…' : 'Lưu tài liệu'}
        disabled={
          busy ||
          title.trim().length < 3 ||
          description.trim().length < 10 ||
          subject.trim().length < 2 ||
          !school ||
          !area ||
          (kind === 'sell' && (!Number.isInteger(Number(price)) || Number(price) < 1000))
        }
        onPress={() =>
          onSave({
            title,
            description,
            subject,
            school,
            area,
            kind,
            price: kind === 'sell' ? Number(price) : 0,
            condition,
          })
        }
      />
    </View>
  );
}
function Detail({
  item,
  user,
  busy,
  onSave,
  onReport,
  onRequest,
}: {
  item: Listing;
  user: User | null;
  busy: boolean;
  onSave: () => void;
  onReport: () => void;
  onRequest: (offered: string, note: string) => void;
}) {
  const [offers, setOffers] = useState<Listing[]>([]),
    [offered, setOffered] = useState(''),
    [note, setNote] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    if (user && item.kind === 'exchange')
      api<Listing[]>('/my/listings')
        .then((data) => {
          if (live) setOffers(data.filter((l) => l.status === 'active' && l.kind === 'exchange'));
        })
        .catch((e) => {
          if (live) setError(String(e.message));
        });
    return () => {
      live = false;
    };
  }, [user, item]);
  return (
    <View style={{ gap: 16 }}>
      <Text style={s.title}>{item.title}</Text>
      <Text style={s.badge}>
        {kinds[item.kind]} · {statuses[item.status]}
      </Text>
      <Text style={{ fontSize: 27, fontWeight: '800', color: C.green }}>
        {item.kind === 'sell' ? money(item.price) : kinds[item.kind]}
      </Text>
      <Text style={s.muted}>
        {item.subject} · {item.condition}
        {'\n'}
        {item.school} · {item.area}
      </Text>
      <Text style={{ lineHeight: 25, color: C.ink }}>{item.description}</Text>
      <View style={s.panel}>
        <Text style={s.subtitle}>{item.owner_name}</Text>
        <Text style={s.muted}>
          {item.owner_rating
            ? `★ ${item.owner_rating} từ giao dịch đã hoàn thành`
            : 'Chưa có đánh giá'}
        </Text>
      </View>
      {user?.id !== item.owner_id && (
        <>
          <Field
            label="Lời nhắn / thời gian và nơi giao nhận"
            value={note}
            onChange={setNote}
            multiline
          />
          {user && item.kind === 'exchange' && (
            <View style={{ gap: 10 }}>
              <Text style={s.label}>Chọn tài liệu của bạn để đổi</Text>
              <Choices
                values={Object.fromEntries(offers.map((o) => [o.id, o.title]))}
                value={offered}
                onChange={setOffered}
              />
              {!offers.length && (
                <Text style={s.muted}>Hãy đăng một tài liệu có hình thức Trao đổi trước.</Text>
              )}
              {!!error && <Text>{error}</Text>}
            </View>
          )}
          <Button
            label={
              user
                ? item.kind === 'exchange'
                  ? 'Gửi đề nghị trao đổi'
                  : item.kind === 'free'
                    ? 'Xin nhận tài liệu'
                    : 'Gửi yêu cầu mua'
                : 'Đăng nhập để giao dịch'
            }
            disabled={
              busy || item.status !== 'active' || (!!user && item.kind === 'exchange' && !offered)
            }
            onPress={() => onRequest(offered, note)}
          />
        </>
      )}
      <View style={s.row}>
        <Button label="♡ Lưu / Bỏ lưu" secondary disabled={busy} onPress={onSave} />
        <Button label="Báo cáo" secondary onPress={onReport} />
      </View>
      {item.reviews?.map((r, i) => (
        <View key={i} style={s.panel}>
          <Text>
            {'★'.repeat(r.rating)} · {r.name}
          </Text>
          <Text style={s.muted}>{r.comment}</Text>
        </View>
      ))}
    </View>
  );
}
function Profile({
  user,
  busy,
  onSave,
}: {
  user: User;
  busy: boolean;
  onSave: (b: unknown) => void;
}) {
  const [name, setName] = useState(user.name),
    [school, setSchool] = useState(user.school),
    [area, setArea] = useState(user.area);
  return (
    <View style={{ gap: 15 }}>
      <Field label="Họ tên" value={name} onChange={setName} />
      <Field label="Trường học" value={school} onChange={setSchool} />
      <Field label="Khu vực" value={area} onChange={setArea} />
      <Button label="Lưu hồ sơ" disabled={busy} onPress={() => onSave({ name, school, area })} />
    </View>
  );
}
function Chat({
  tx,
  user,
  onError,
}: {
  tx: Transaction;
  user: User;
  onError: (e: unknown) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]),
    [body, setBody] = useState(''),
    [sending, setSending] = useState(false),
    [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      setMessages(await api<Message[]>(`/transactions/${tx.id}/messages`));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được tin nhắn.');
    }
  }, [tx.id]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 4000);
    return () => clearInterval(timer);
  }, [load]);
  return (
    <View style={{ gap: 14 }}>
      <Text style={s.subtitle}>{tx.title}</Text>
      <Text style={s.muted}>
        Tin nhắn cập nhật mỗi 4 giây. Thống nhất địa điểm công cộng để giao nhận.
      </Text>
      {!!error && <Text style={{ color: '#A73434' }}>{error}</Text>}
      <View style={{ gap: 10, minHeight: 180 }}>
        {messages.map((m) => (
          <View
            key={m.id}
            style={[
              s.bubble,
              {
                alignSelf: m.sender_id === user.id ? 'flex-end' : 'flex-start',
                backgroundColor: m.sender_id === user.id ? '#E5F1D8' : '#F0F2EE',
              },
            ]}
          >
            <Text style={s.label}>{m.sender_name}</Text>
            <Text style={{ lineHeight: 23 }}>{m.body}</Text>
            <Text style={{ fontSize: 10, color: C.muted }}>
              {new Date(m.created_at).toLocaleTimeString('vi-VN')}
            </Text>
          </View>
        ))}
        {!messages.length && <Text style={s.muted}>Bắt đầu trao đổi với bên kia.</Text>}
      </View>
      {['pending', 'accepted'].includes(tx.status) ? (
        <>
          <Field label="Nội dung tin nhắn" value={body} onChange={setBody} multiline />
          <Button
            label={sending ? 'Đang gửi…' : 'Gửi tin nhắn'}
            disabled={sending || !body.trim()}
            onPress={() => {
              setSending(true);
              api(`/transactions/${tx.id}/messages`, 'POST', { body })
                .then(async () => {
                  setBody('');
                  await load();
                })
                .catch(onError)
                .finally(() => setSending(false));
            }}
          />
        </>
      ) : (
        <Text style={s.muted}>Giao dịch đã kết thúc. Bạn vẫn xem được lịch sử tin nhắn.</Text>
      )}
    </View>
  );
}
function ReviewForm({ busy, onSubmit }: { busy: boolean; onSubmit: (b: unknown) => void }) {
  const [rating, setRating] = useState('5'),
    [comment, setComment] = useState('');
  return (
    <View style={{ gap: 17 }}>
      <Choices
        values={{ '1': '1★', '2': '2★', '3': '3★', '4': '4★', '5': '5★' }}
        value={rating}
        onChange={setRating}
      />
      <Field label="Nhận xét" value={comment} onChange={setComment} multiline />
      <Button
        label="Gửi đánh giá"
        disabled={busy}
        onPress={() => onSubmit({ rating: Number(rating), comment })}
      />
    </View>
  );
}
function ReportForm({ busy, onSubmit }: { busy: boolean; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  return (
    <View style={{ gap: 17 }}>
      <Field
        label="Lý do báo cáo (ít nhất 5 ký tự)"
        value={reason}
        onChange={setReason}
        multiline
      />
      <Button
        label="Gửi báo cáo"
        disabled={busy || reason.trim().length < 5}
        onPress={() => onSubmit(reason)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  app: { flex: 1, backgroundColor: C.bg },
  header: {
    height: 84,
    backgroundColor: C.white,
    borderBottomWidth: 1,
    borderColor: C.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingTop: Platform.OS === 'ios' ? 15 : 0,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  logo: {
    width: 35,
    height: 38,
    backgroundColor: C.green,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: { fontSize: 25, color: C.green, fontWeight: '800', letterSpacing: -1 },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  sidebar: {
    width: 230,
    padding: 22,
    borderRightWidth: 1,
    borderColor: C.line,
    backgroundColor: C.white,
    gap: 9,
  },
  overline: { fontSize: 10, fontWeight: '800', letterSpacing: 1.6, color: C.muted },
  nav: { padding: 14, borderRadius: 10, marginTop: 4 },
  navActive: { backgroundColor: '#EAF2E1' },
  navText: { fontSize: 14, color: C.muted },
  sidebarTip: { backgroundColor: '#F3F6ED', padding: 16, borderRadius: 14, gap: 15, marginTop: 30 },
  hero: {
    backgroundColor: C.green,
    borderRadius: 20,
    flexDirection: 'row',
    overflow: 'hidden',
    gap: 20,
  },
  heroTitle: { fontWeight: '800', color: '#F9FCEB', lineHeight: undefined, letterSpacing: -1 },
  bookStack: { flexDirection: 'row', alignItems: 'center', padding: 10 },
  heroBook: {
    width: 127,
    height: 175,
    borderRadius: 4,
    borderLeftWidth: 6,
    borderLeftColor: '#00000020',
    padding: 15,
    justifyContent: 'space-between',
    boxShadow: '0px 12px 20px #00000025',
  },
  heroBookText: { fontSize: 20, fontWeight: '900', color: C.green },
  panel: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 15,
    padding: 20,
    gap: 14,
  },
  title: { fontSize: 24, fontWeight: '800', color: C.ink, letterSpacing: -0.5 },
  subtitle: { fontSize: 16, fontWeight: '700', color: C.ink, lineHeight: 23 },
  muted: { fontSize: 12, color: C.muted, lineHeight: 20 },
  label: { fontSize: 12, color: C.ink, fontWeight: '700' },
  input: {
    backgroundColor: '#FCFDF9',
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 9,
    paddingHorizontal: 13,
    paddingVertical: 12,
    fontSize: 14,
    color: C.ink,
  },
  button: {
    backgroundColor: C.green,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: C.white, fontSize: 12, fontWeight: '700' },
  secondary: { backgroundColor: '#EEF3E9', borderWidth: 1, borderColor: C.line },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: '#F0F3EB',
    borderWidth: 1,
    borderColor: C.line,
  },
  chipActive: { backgroundColor: C.green, borderColor: C.green },
  chipText: { fontSize: 12, color: C.muted, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  card: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 15,
    backgroundColor: C.white,
    overflow: 'hidden',
  },
  cover: { height: 190, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  book: {
    width: 120,
    height: 155,
    padding: 14,
    borderLeftWidth: 6,
    borderLeftColor: '#00000033',
    borderRadius: 3,
    justifyContent: 'space-between',
    transform: [{ rotate: '-7deg' }],
    boxShadow: '5px 7px 10px #00000025',
  },
  bookTitle: { fontSize: 17, fontWeight: '700', color: '#FFFFFF', lineHeight: 21 },
  coverBadge: {
    position: 'absolute',
    top: 13,
    left: 13,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#FFFFFFEE',
    borderRadius: 7,
  },
  badge: {
    backgroundColor: '#EDF3E6',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    color: C.green,
    fontSize: 11,
    fontWeight: '700',
  },
  error: {
    padding: 15,
    borderRadius: 10,
    backgroundColor: '#FCEAEA',
    flexDirection: 'row',
    gap: 12,
  },
  success: { padding: 15, borderRadius: 10, backgroundColor: '#E4F1D9' },
  bottomNav: {
    backgroundColor: C.white,
    borderTopWidth: 1,
    borderColor: C.line,
    flexDirection: 'row',
    paddingBottom: Platform.OS === 'ios' ? 20 : 4,
  },
  backdrop: {
    flex: 1,
    backgroundColor: '#0E281E99',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
  },
  modal: { backgroundColor: C.white, borderRadius: 18, overflow: 'hidden' },
  bubble: { padding: 13, borderRadius: 12, maxWidth: '88%', gap: 5 },
});
