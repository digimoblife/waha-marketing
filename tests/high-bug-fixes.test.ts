// Regression tests for the high-impact bugs in docs/LAPORAN_UJI_MENYELURUH.md (T-01 .. T-05).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';

import { extractStanzaId, isMessageProcessed, markMessageProcessed } from '../src/lib/msg-cache.ts';
import { isBlockedHostname, isBlockedIp, safeFetchHtml } from '../src/lib/safe-fetch.ts';
import { SESSION_CHECK_HEADER, getSessionCheckKey } from '../src/lib/auth-token.ts';

const basePgUrl =
  process.env.TEST_POSTGRES_BASE_URL || 'postgresql://waha:waha_secret_2026@localhost:5433';
const testDbName = `waha_marketing_fixes_${process.pid}`;
const adminDbUrl = `${basePgUrl}/postgres?schema=public`;
const testDbUrl = `${basePgUrl}/${testDbName}?schema=public`;
process.env.DATABASE_URL = testDbUrl;

const adminPrisma = new PrismaClient({ datasources: { db: { url: adminDbUrl } } });
await adminPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${testDbName}" WITH (FORCE);`);
await adminPrisma.$executeRawUnsafe(`CREATE DATABASE "${testDbName}";`);
await adminPrisma.$disconnect();
execSync(`npx prisma db push --skip-generate && node scripts/setup-pgvector-indexes.mjs`, {
  env: { ...process.env, DATABASE_URL: testDbUrl },
  stdio: 'pipe',
});

const { prisma } = await import('../src/lib/prisma.ts');
const { POST: webhookPOST } = await import('../src/app/api/webhook/route.ts');
const { GET: messagesGET } = await import('../src/app/api/messages/route.ts');
const { POST: uploadPOST } = await import('../src/app/api/media/upload/route.ts');
const { GET: uploadsGET } = await import('../src/app/uploads/[...path]/route.ts');
const { GET: sessionStatusGET } = await import('../src/app/api/auth/session-status/route.ts');

test.after(async () => {
  await prisma.$disconnect();
  const cleanup = new PrismaClient({ datasources: { db: { url: adminDbUrl } } });
  await cleanup.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${testDbName}" WITH (FORCE);`);
  await cleanup.$disconnect();
});

const now = () => Math.floor(Date.now() / 1000);
const hook = (payload: any, event = 'message.any') =>
  webhookPOST(
    new NextRequest('http://localhost/api/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, payload }),
    })
  );
const getMessages = async (chatId: string) => {
  const res = await messagesGET(
    new NextRequest(`http://localhost/api/messages?chatId=${encodeURIComponent(chatId)}`)
  );
  return (await res.json()).messages as any[];
};

test('T-02: extractStanzaId reads the stanza from group IDs, not the participant', () => {
  assert.equal(
    extractStanzaId('false_120363000000000001@g.us_3EB0AAA111_6281234567009@c.us'),
    '3EB0AAA111'
  );
  assert.equal(extractStanzaId('true_6281322692616@c.us_3EB05011638971685AE60B'), '3EB05011638971685AE60B');
  assert.equal(extractStanzaId('out_1795832937710'), 'out_1795832937710');

  markMessageProcessed('false_120363000000000001@g.us_3EB0GRP001_6281234567009@c.us');
  assert.equal(
    isMessageProcessed('false_120363000000000001@g.us_3EB0GRP002_6281234567009@c.us'),
    false
  );
});

test('T-01: two identical texts within seconds are both kept and never deleted', async () => {
  const chatId = '6281234500001@c.us';
  await hook({ id: `false_${chatId}_3EB0OKAY0001`, from: chatId, fromMe: false, body: 'ok', timestamp: now() });
  await hook({ id: `false_${chatId}_3EB0OKAY0002`, from: chatId, fromMe: false, body: 'ok', timestamp: now() });

  const visible = (await getMessages(chatId)).filter((m) => m.body === 'ok');
  assert.equal(visible.length, 2);
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(await prisma.message.count({ where: { chatId, body: 'ok' } }), 2);
});

test('T-01: operator sending the same text twice from the phone keeps both', async () => {
  const chatId = '6281234500002@c.us';
  await hook({ id: `false_${chatId}_3EB0INIT0001`, from: chatId, fromMe: false, body: 'halo', timestamp: now() });
  await hook({ id: `true_${chatId}_3EB0THX00001`, from: '6281100000000@c.us', to: chatId, fromMe: true, body: 'Terima kasih', timestamp: now() });
  await hook({ id: `true_${chatId}_3EB0THX00002`, from: '6281100000000@c.us', to: chatId, fromMe: true, body: 'Terima kasih', timestamp: now() });
  assert.equal(await prisma.message.count({ where: { chatId, body: 'Terima kasih' } }), 2);
});

test('T-02: consecutive group messages from one participant are all stored', async () => {
  const group = '120363000000000099@g.us';
  const participant = '6281234567009@c.us';
  for (let i = 1; i <= 3; i++) {
    const stanza = `3EB0GROUPMSG${i}`;
    const res = await hook({
      id: `false_${group}_${stanza}_${participant}`,
      from: group,
      participant,
      fromMe: false,
      body: `pesan grup ${i}`,
      timestamp: now(),
      _data: { key: { id: stanza, participant } },
    });
    assert.equal((await res.json()).processed, 'message');
  }
  const bodies = (await getMessages(group)).map((m) => m.body);
  assert.deepEqual(bodies.sort(), ['pesan grup 1', 'pesan grup 2', 'pesan grup 3']);
});

test('T-03: SVG/HTML uploads are rejected and unknown files are served as sandboxed downloads', async () => {
  const upload = (name: string, type: string, content: string) => {
    const fd = new FormData();
    fd.append('file', new File([content], name, { type }));
    return uploadPOST(new NextRequest('http://localhost/api/media/upload', { method: 'POST', body: fd }));
  };
  assert.equal((await upload('x.svg', 'image/svg+xml', '<svg><script>alert(1)</script></svg>')).status, 415);
  assert.equal((await upload('x.html', 'text/html', '<script>alert(1)</script>')).status, 415);
  assert.equal((await upload('x.png', 'image/svg+xml', '<svg/>')).status, 415);
  assert.equal((await upload('foto.JPG', 'image/jpeg', 'jpg-bytes')).status, 200);
  // Office formats carry "xml" inside their MIME type and must still be accepted.
  for (const [name, type] of [
    ['data.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['surat.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['slide.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  ]) {
    assert.equal((await upload(name, type, 'PK')).status, 200, name);
  }

  // A file that reached /uploads another way (e.g. WAHA media download) must not render inline.
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
  await fs.mkdir(uploadsDir, { recursive: true });
  const svgName = `qa_test_${process.pid}.svg`;
  await fs.writeFile(path.join(uploadsDir, svgName), '<svg><script>alert(1)</script></svg>');
  try {
    const res = await uploadsGET(new NextRequest(`http://localhost/uploads/${svgName}`), {
      params: { path: [svgName] },
    });
    assert.match(res.headers.get('content-disposition') || '', /^attachment/);
    assert.match(res.headers.get('content-security-policy') || '', /sandbox/);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  } finally {
    await fs.rm(path.join(uploadsDir, svgName), { force: true });
    for (const f of await fs.readdir(uploadsDir)) {
      if (/^\d+_(foto\.jpg|data\.xlsx|surat\.docx|slide\.pptx)$/i.test(f)) {
        await fs.rm(path.join(uploadsDir, f), { force: true });
      }
    }
  }
});

test('T-04: link preview guard blocks loopback, private, mapped IPv6 and single-label hosts', async () => {
  for (const host of ['localhost', 'localtest.me.localhost', '[::1]', '::1', '[::ffff:7f00:1]', '10.1.2.3', '169.254.169.254', '192.168.1.5', '100.64.0.1', 'waha', 'postgres', 'fd00::1']) {
    assert.equal(isBlockedHostname(host), true, host);
  }
  assert.equal(isBlockedIp('8.8.8.8'), false);
  assert.equal(isBlockedHostname('lapaq.id'), false);

  // A public name that resolves to loopback is refused at connect time (DNS rebinding style).
  await assert.rejects(() => safeFetchHtml('http://localtest.me:9/', { timeoutMs: 2000 }), /Blocked address/);
});

test('T-05: session status route requires the server key and reports deactivated users', async () => {
  const user = await prisma.user.create({
    data: { username: 'op_fix', password: 'x', name: 'Op', role: 'OPERATOR', isActive: false },
  });
  const call = (key?: string) =>
    sessionStatusGET(
      new NextRequest(`http://localhost/api/auth/session-status?id=${user.id}`, {
        headers: key ? { [SESSION_CHECK_HEADER]: key } : {},
      })
    );

  assert.equal((await call()).status, 404);
  assert.equal((await call('wrong-key')).status, 404);
  const body = await (await call(getSessionCheckKey())).json();
  assert.deepEqual(body, { active: false, role: 'OPERATOR' });
});

test('T-05: middleware locks out a disabled user but lets them back in right after reactivation', async () => {
  const { middleware } = await import('../src/middleware.ts');
  const { signAuthToken, AUTH_COOKIE_NAME } = await import('../src/lib/auth-token.ts');
  const token = await signAuthToken({ id: 'user_reactivate', username: 'op', name: 'Op', role: 'OPERATOR' });

  let active = false;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input?.url || String(input);
    if (url.includes('/api/auth/session-status')) {
      return new Response(JSON.stringify({ active, role: 'OPERATOR' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return realFetch(input, init);
  }) as typeof fetch;

  const call = () =>
    middleware(
      new NextRequest('http://localhost/api/chats', { headers: { cookie: `${AUTH_COOKIE_NAME}=${token}` } })
    );
  try {
    assert.equal((await call()).status, 401);
    active = true; // Admin reactivates the account
    const res = await call();
    assert.notEqual(res.status, 401);
  } finally {
    globalThis.fetch = realFetch;
  }
});
