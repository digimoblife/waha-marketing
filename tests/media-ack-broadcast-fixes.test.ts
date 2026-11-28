// Regression tests for S-01 .. S-06 in docs/LAPORAN_UJI_MENYELURUH.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';

const basePgUrl =
  process.env.TEST_POSTGRES_BASE_URL || 'postgresql://waha:waha_secret_2026@localhost:5433';
const testDbName = `waha_marketing_media_${process.pid}`;
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

// Count (and fail) every download attempt against WAHA's temporary file store.
let wahaFileFetches = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === 'string' ? input : input?.url || String(input);
  if (url.includes('/api/files/')) {
    wahaFileFetches++;
    throw new TypeError('fetch failed (WAHA unreachable in test)');
  }
  return realFetch(input, init);
}) as typeof fetch;

const { prisma } = await import('../src/lib/prisma.ts');
const { waha } = await import('../src/lib/waha.ts');
const { describeNonMediaMessage } = await import('../src/lib/waha-media.ts');
const { POST: webhookPOST } = await import('../src/app/api/webhook/route.ts');
const { GET: messagesGET } = await import('../src/app/api/messages/route.ts');
const { GET: uploadsGET } = await import('../src/app/uploads/[...path]/route.ts');
const { resumeRunningBroadcasts } = await import('../src/lib/broadcast-worker.ts');

const sent: Array<{ chatId: string; text: string }> = [];
waha.sendText = async (chatId: string, text: string) => {
  sent.push({ chatId, text });
  return { id: `true_${chatId}_3EB0BC${Date.now()}${sent.length}` };
};

test.after(async () => {
  globalThis.fetch = realFetch;
  await prisma.broadcastCampaign.updateMany({ data: { status: 'CANCELLED' } }).catch(() => null);
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
const getMessages = async (chatId: string) =>
  (await (
    await messagesGET(new NextRequest(`http://localhost/api/messages?chatId=${encodeURIComponent(chatId)}`))
  ).json()).messages as any[];

test('S-01: undownloadable WAHA media is never sent to the browser and is not re-fetched every poll', async () => {
  const chatId = '6281200000301@c.us';
  await hook({
    id: `false_${chatId}_3EB0MEDIA0001`,
    from: chatId,
    fromMe: false,
    body: '',
    hasMedia: true,
    media: { url: 'http://localhost:3000/api/files/default/3EB0MEDIA0001.pdf', mimetype: 'application/pdf', filename: 'invoice.pdf' },
    timestamp: now(),
  });
  const fetchesAfterWebhook = wahaFileFetches;

  const [msg] = await getMessages(chatId);
  assert.equal(msg.mediaUrl, null);
  assert.equal(msg.mediaUnavailable, true);
  assert.equal(msg.fileName, 'invoice.pdf');

  // Two more polls inside the retry window must not hit WAHA again.
  await getMessages(chatId);
  await getMessages(chatId);
  assert.equal(wahaFileFetches, fetchesAfterWebhook);
});

test('S-02: location, contact and poll messages get a readable body', async () => {
  assert.equal(
    describeNonMediaMessage({ location: { latitude: -6.2, longitude: 106.8, description: 'Toko Budi' } }),
    '📍 Lokasi: Toko Budi\nhttps://maps.google.com/?q=-6.2,106.8'
  );
  assert.equal(
    describeNonMediaMessage({ _data: { message: { contactMessage: { displayName: 'Sari' } } } }),
    '👤 Kontak: Sari'
  );
  assert.equal(
    describeNonMediaMessage({ _data: { message: { pollCreationMessageV3: { name: 'Jam buka?' } } } }),
    '📊 Polling: Jam buka?'
  );
  assert.equal(describeNonMediaMessage({ body: 'halo' }), null);

  const chatId = '6281200000302@c.us';
  await hook({
    id: `false_${chatId}_3EB0LOC00001`,
    from: chatId,
    fromMe: false,
    body: '',
    hasMedia: false,
    timestamp: now(),
    _data: { message: { locationMessage: { degreesLatitude: -6.2, degreesLongitude: 106.8 } } },
  });
  const [msg] = await getMessages(chatId);
  assert.match(msg.body, /maps\.google\.com\/\?q=-6\.2,106\.8/);
  const chat = await prisma.chat.findUnique({ where: { id: chatId } });
  assert.match(chat?.lastMessage || '', /^📍 Lokasi/);
});

test('S-03: WhatsApp voice notes (.oga/.opus) are served as audio/ogg', async () => {
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
  await fs.mkdir(uploadsDir, { recursive: true });
  for (const ext of ['oga', 'opus']) {
    const name = `qa_voice_${process.pid}.${ext}`;
    await fs.writeFile(path.join(uploadsDir, name), 'OggS');
    try {
      const res = await uploadsGET(new NextRequest(`http://localhost/uploads/${name}`), { params: { path: [name] } });
      assert.equal(res.headers.get('content-type'), 'audio/ogg');
      assert.equal(res.headers.get('content-disposition'), null);
    } finally {
      await fs.rm(path.join(uploadsDir, name), { force: true });
    }
  }
});

test('S-04: ACK status only moves forward and records send errors', async () => {
  const chatId = '6281200000304@c.us';
  const idRead = `true_${chatId}_3EB0ACKREAD01`;
  const idFail = `true_${chatId}_3EB0ACKFAIL01`;
  await prisma.chat.create({ data: { id: chatId, name: 'Ack' } });
  await prisma.message.createMany({
    data: [
      { id: idRead, chatId, fromMe: true, body: 'a', ackStatus: 1 },
      { id: idFail, chatId, fromMe: true, body: 'b', ackStatus: 1 },
    ],
  });

  await hook({ id: idRead, ack: 3 }, 'message.ack');
  await hook({ id: idRead, ack: 2 }, 'message.ack'); // late "delivered"
  await hook({ id: idRead, ack: -1 }, 'message.ack'); // error after read is impossible
  await hook({ id: idFail, ack: -1 }, 'message.ack');

  const rows = await prisma.message.findMany({ where: { chatId }, orderBy: { id: 'asc' } });
  const byId = Object.fromEntries(rows.map((r) => [r.id, r.ackStatus]));
  assert.equal(byId[idRead], 3);
  assert.equal(byId[idFail], -1);
});

test('S-05 + S-06: a RUNNING campaign resumes after restart and keeps operator takeover', async () => {
  const takenOver = '6281200000306@c.us';
  await prisma.chat.create({ data: { id: takenOver, name: 'Diambil alih', agentMode: 'HUMAN_TAKEOVER' } });

  // State left behind by a process that died mid-campaign.
  const campaign = await prisma.broadcastCampaign.create({
    data: {
      name: 'Kampanye QA',
      messageBody: 'Halo {nama}',
      status: 'RUNNING',
      enableAiFollowup: true,
      totalCount: 1,
      recipients: { create: [{ phone: '6281200000306', jid: takenOver, contactName: 'Budi' }] },
    },
  });

  const resumed = await resumeRunningBroadcasts();
  assert.deepEqual(resumed, [campaign.id]);
  // A second call while the worker is active must not start a duplicate worker.
  assert.deepEqual(await resumeRunningBroadcasts(), []);

  for (let i = 0; i < 50; i++) {
    const r = await prisma.broadcastRecipient.findFirst({ where: { campaignId: campaign.id } });
    if (r?.status === 'SENT') break;
    await new Promise((res) => setTimeout(res, 100));
  }
  await prisma.broadcastCampaign.update({ where: { id: campaign.id }, data: { status: 'CANCELLED' } });
  // The worker notices the cancel within its 1s sleep step; let it exit before teardown.
  await new Promise((res) => setTimeout(res, 1500));

  assert.deepEqual(sent.filter((m) => m.chatId === takenOver).map((m) => m.text), ['Halo Budi']);
  const chat = await prisma.chat.findUnique({ where: { id: takenOver } });
  assert.equal(chat?.agentMode, 'HUMAN_TAKEOVER');
  assert.ok(chat?.campaignContext, 'campaign context is still stored for later');
});
