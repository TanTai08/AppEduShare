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
export interface User {
  id: string;
  name: string;
  email: string;
  school: string;
  area: string;
  role: 'student' | 'admin';
}
export interface Listing {
  id: string;
  owner_id: string;
  owner_name: string;
  owner_rating: number | null;
  title: string;
  description: string;
  subject: string;
  school: string;
  area: string;
  kind: 'sell' | 'exchange' | 'free';
  price: number;
  condition: string;
  status: string;
  reviews?: { rating: number; comment: string; name: string }[];
}
export interface Transaction {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  title: string;
  kind: string;
  price: number;
  status: string;
  buyer_name: string;
  seller_name: string;
  offered_title: string | null;
  note: string;
  buyer_confirmed: number;
  seller_confirmed: number;
  my_rating: number | null;
}
export interface Message {
  id: string;
  sender_id: string;
  sender_name: string;
  body: string;
  created_at: string;
}
export interface Notice {
  id: string;
  body: string;
  transaction_id: string | null;
  read_at: string | null;
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
