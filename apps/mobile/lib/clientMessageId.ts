/**
 * Non-secret UUID-shaped key used only for deduplicating message retries.
 * Pure JavaScript so importing the chat screen never requires ExpoCrypto.
 * Never use this generator for passwords, auth/session tokens or security keys.
 * Those continue to be generated with node:crypto on the server.
 */
export function createClientMessageId(): string {
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
