import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { listenApi, startupMessage } from '../src/listen.js';
test('API port conflict is a handled startup error; original server keeps running', async () => {
  const first = createServer((req, res) => res.end('original'));
  const second = createServer();
  try {
    const address = await listenApi(first, 0, '127.0.0.1');
    await assert.rejects(listenApi(second, address.port, '127.0.0.1'), (error) => {
      assert.equal(error.code, 'EADDRINUSE');
      assert.match(startupMessage(error, address.port), /Không bật thêm API/);
      return true;
    });
    assert.equal(await (await fetch(`http://127.0.0.1:${address.port}`)).text(), 'original');
  } finally {
    await new Promise((resolve) => first.close(resolve));
  }
});
test('Invalid API port fails with a useful message before binding', async () => {
  await assert.rejects(listenApi(createServer(), NaN, '127.0.0.1'), /PORT/);
});
