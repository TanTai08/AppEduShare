import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { resolveApiAddress } from './lib/apiAddress';
import { requestJson } from './lib/request';
export { ApiError } from './lib/request';
export const API_ADDRESS = resolveApiAddress({
  platform: Platform.OS,
  isDevice: Device.isDevice,
  development: __DEV__,
  metroHost: Constants.expoConfig?.hostUri || Constants.expoGoConfig?.debuggerHost,
  browserUrl: Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.href : null,
  genericUrl: process.env.EXPO_PUBLIC_API_URL,
  platformUrl:
    Platform.OS === 'android'
      ? process.env.EXPO_PUBLIC_API_URL_ANDROID
      : Platform.OS === 'ios'
        ? process.env.EXPO_PUBLIC_API_URL_IOS
        : process.env.EXPO_PUBLIC_API_URL_WEB,
  apiPort: process.env.EXPO_PUBLIC_API_PORT,
});
export const API_URL = API_ADDRESS.url;
export const DEVICE_LABEL =
  Platform.OS === 'web'
    ? 'Web / trình duyệt'
    : `${Platform.OS === 'android' ? 'Android' : 'iOS'} · ${Device.modelName || 'thiết bị'}${Device.isDevice ? '' : ' (máy ảo)'}`;
if (__DEV__)
  console.info(
    `[EduShare] ${DEVICE_LABEL} → API: ${API_URL || API_ADDRESS.error} (${API_ADDRESS.source})`,
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
  return requestJson<T>(API_URL, path, {
    method,
    body,
    token,
    configurationError: API_ADDRESS.error,
  });
}
export async function checkApiHealth() {
  const health = await requestJson<{ ok: boolean; database: number; engine?: string }>(
    API_URL,
    '/health',
    { timeoutMs: 8000, configurationError: API_ADDRESS.error },
  );
  if (health.ok !== true || health.database !== 1 || health.engine !== 'postgresql')
    throw new Error(
      'Địa chỉ này chưa phải API EduShare PostgreSQL phiên bản mới. Kiểm tra tiến trình đang chạy trên cổng API.',
    );
  return health;
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
