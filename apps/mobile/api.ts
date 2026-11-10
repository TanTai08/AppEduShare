import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000').replace(
  /\/$/,
  '',
);
let token = '';
export async function restoreToken() {
  token =
    Platform.OS === 'web'
      ? sessionStorage.getItem('edushare.token') || ''
      : (await SecureStore.getItemAsync('edushare.token')) || '';
  return token;
}
export async function saveToken(value: string) {
  token = value;
  if (Platform.OS === 'web') {
    if (value) sessionStorage.setItem('edushare.token', value);
    else sessionStorage.removeItem('edushare.token');
  } else if (value) await SecureStore.setItemAsync('edushare.token', value);
  else await SecureStore.deleteItemAsync('edushare.token');
}
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${API_URL}/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const json = response.headers.get('content-type')?.includes('application/json');
    const data = json ? await response.json() : { error: await response.text() };
    if (!response.ok) throw new Error(data.error || `Lỗi HTTP ${response.status}`);
    if (!json) throw new Error('Máy chủ trả dữ liệu không hợp lệ.');
    return data as T;
  } catch (e) {
    if (e instanceof TypeError || (e instanceof Error && e.name === 'AbortError'))
      throw new Error('Không kết nối được API. Kiểm tra server và EXPO_PUBLIC_API_URL.');
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}
export const getToken = () => token;
export interface User {
  id: string;
  name: string;
  email: string;
  school: string;
  area: string;
  bio: string;
  role: 'student' | 'admin';
  points: number;
  created_at: string;
}
export interface Review {
  id: string;
  rating: number;
  comment: string;
  author_name: string;
  author_id: string;
  created_at: string;
  title: string;
}
export interface Listing {
  id: string;
  owner_id: string;
  owner_name: string;
  owner_rating: number | null;
  owner_review_count: number;
  title: string;
  description: string;
  subject: string;
  school: string;
  area: string;
  kind: 'sell' | 'exchange' | 'free';
  price: number;
  point_cost: number;
  condition: string;
  status: string;
  moderated: boolean;
  pickup_label: string;
  latitude: number | null;
  longitude: number | null;
  reviews?: Review[];
}
export interface PublicProfile {
  id: string;
  name: string;
  school: string;
  area: string;
  bio: string;
  created_at: string;
  rating: number | null;
  review_count: number;
  completed_count: number;
  badge: string;
  reviews: Review[];
  listings: Listing[];
}
export interface Conversation {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  buyer_name: string;
  seller_name: string;
  title: string;
  listing_status: string;
  unread: number;
  last_message: string | null;
  updated_at: string;
}
export interface Transaction {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  conversation_id: string;
  title: string;
  kind: string;
  price: number;
  point_cost: number;
  points_spent: number;
  status: string;
  buyer_name: string;
  seller_name: string;
  offered_title: string | null;
  note: string;
  buyer_confirmed: boolean;
  seller_confirmed: boolean;
  my_rating: number | null;
}
export interface Message {
  id: string;
  seq: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string;
  body: string;
  created_at: string;
  client_id: string;
}
export interface Notice {
  id: string;
  body: string;
  transaction_id: string | null;
  read_at: string | null;
  created_at: string;
}
export interface WalletData {
  balance: number;
  rules: { earn: number; redeem: number; dailyCap: number; pairHours: number };
  history: {
    id: string;
    delta: number;
    reason: string;
    note: string;
    balance_after: number;
    created_at: string;
  }[];
}
export interface Ticket {
  id: string;
  user_id: string;
  user_name: string;
  subject: string;
  status: string;
  created_at: string;
}
export interface SupportMessage {
  id: string;
  body: string;
  sender_name: string;
  sender_id: string;
  role: string;
  created_at: string;
}
export interface AdminData {
  stats: { users: number; listings: number; completed: number; reports: number };
  reports: {
    id: string;
    listing_id: string;
    title: string;
    reason: string;
    status: string;
    reporter_name: string;
  }[];
  listings: Listing[];
}
