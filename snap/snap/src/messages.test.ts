import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextMessage, normalizeApiBase, parseNotification } from './messages.ts';

test('accepts the local API and Q2 hosts, rejects lookalikes', () => {
  assert.equal(normalizeApiBase('http://127.0.0.1:4100'), 'http://127.0.0.1:4100');
  assert.equal(normalizeApiBase('https://test.q2-market.com/api'), 'https://test.q2-market.com');
  assert.equal(normalizeApiBase('http://q2-market.com'), null);
  assert.equal(normalizeApiBase('https://q2-market.com.evil.io'), null);
  assert.equal(normalizeApiBase('https://user:pass@q2-market.com'), null);
});

test('ignores the site banner and reads the MetaMask notification', () => {
  assert.equal(
    parseNotification({
      announcement: { text: 'Market paused', isActive: true, url: 'https://q2-market.com/status' },
    }),
    null,
  );
  assert.deepEqual(
    parseNotification({
      success: true,
      data: { notification: { type: 'inApp', message: ' Hello ' } },
    }),
    { type: 'inApp', message: 'Hello' },
  );
});

test('notifies once per MetaMask payload and again after it changes', () => {
  const first = nextMessage(null, { type: 'inApp', message: 'Hello' });
  assert.equal(first.notice?.message, 'Hello');
  assert.equal(nextMessage(first.seen, { type: 'inApp', message: 'Hello' }).notice, null);

  const changed = nextMessage(first.seen, { type: 'inApp', message: 'Back' });
  assert.equal(changed.notice?.message, 'Back');
  assert.deepEqual(nextMessage(changed.seen, null), { seen: null, notice: null });
});

test('keeps a detailed in-app payload and rejects a link without content', () => {
  const content = { type: 'Text', props: { children: 'Maintenance' }, key: null };
  const notice = parseNotification({
    notification: {
      type: 'inApp',
      message: ' Maintenance ',
      title: ' Q2 ',
      content,
      footerLink: { href: ' https://test.q2-market.com/status ', text: ' 查看 ' },
    },
  });
  assert.deepEqual(notice, {
    type: 'inApp',
    message: 'Maintenance',
    title: 'Q2',
    content,
    footerLink: { href: 'https://test.q2-market.com/status', text: '查看' },
  });
  assert.equal(
    parseNotification({
      notification: {
        type: 'inApp',
        message: 'Maintenance',
        footerLink: { href: 'https://q2-market.com', text: '查看' },
      },
    }),
    null,
  );
});

test('accepts a string content and rejects an overlong native message', () => {
  assert.equal(
    parseNotification({
      notification: { type: 'inApp', message: 'Hi', title: 'Q2', content: ' Body ' },
    })?.content,
    'Body',
  );
  assert.equal(
    parseNotification({
      notification: { type: 'native', message: 'n'.repeat(50), title: 'Q2' },
    }),
    null,
  );
  assert.deepEqual(
    parseNotification({ notification: { type: 'native', message: 'Up' } }),
    { type: 'native', message: 'Up' },
  );
});
