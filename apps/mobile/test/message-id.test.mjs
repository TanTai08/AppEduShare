import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClientMessageId } from '../lib/clientMessageId.ts';
test('Chat retry IDs work when native crypto / Web Crypto are unavailable', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
  try {
    const id = createClientMessageId();
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.notEqual(createClientMessageId(), id);
  } finally {
    if (original) Object.defineProperty(globalThis, 'crypto', original);
    else delete globalThis.crypto;
  }
});
