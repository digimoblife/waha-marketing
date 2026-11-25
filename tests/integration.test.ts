import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { NextRequest } from 'next/server';

const testDbPath = `/tmp/waha-marketing-test-${process.pid}.db`;
process.env.DATABASE_URL = `file:${testDbPath}`;

// Push schema to isolated temporary SQLite database before importing Prisma/routes
execSync(`npx prisma db push --skip-generate`, {
  env: { ...process.env, DATABASE_URL: `file:${testDbPath}` },
  stdio: 'pipe',
});

const { prisma } = await import('../src/lib/prisma.ts');
const { POST: webhookPOST } = await import('../src/app/api/webhook/route.ts');
const { GET: chatsGET } = await import('../src/app/api/chats/route.ts');
const { GET: messagesGET } = await import('../src/app/api/messages/route.ts');
const { POST: mergePOST } = await import('../src/app/api/contacts/merge/route.ts');

test.after(async () => {
  await prisma.$disconnect();
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
});

function makeJsonReq(url: string, body: any, method = 'POST') {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('Integration: webhook normalizes @s.whatsapp.net to @c.us without duplicate chats', async () => {
  const phone = '628123456789';
  await prisma.contact.create({
    data: {
      phone,
      jid: `${phone}@c.us`,
      name: 'Merchant Uji',
    },
  });

  // 1. Outgoing webhook arrives with @s.whatsapp.net JID
  const res1 = await webhookPOST(
    makeJsonReq('http://localhost/api/webhook', {
      event: 'message.any',
      payload: {
        id: `true_${phone}@s.whatsapp.net_3EB0NORM001`,
        fromMe: true,
        to: `${phone}@s.whatsapp.net`,
        body: 'Halo Merchant',
        timestamp: Math.floor(Date.now() / 1000),
      },
    })
  );
  assert.equal(res1.status, 200);

  // 2. Incoming webhook arrives with @c.us JID
  const res2 = await webhookPOST(
    makeJsonReq('http://localhost/api/webhook', {
      event: 'message.any',
      payload: {
        id: `false_${phone}@c.us_3EB0NORM002`,
        fromMe: false,
        from: `${phone}@c.us`,
        body: 'Balasan Merchant',
        timestamp: Math.floor(Date.now() / 1000) + 1,
      },
    })
  );
  assert.equal(res2.status, 200);

  const chatsRes = await chatsGET();
  const chatsJson = await chatsRes.json();
  const merchantChats = chatsJson.chats.filter((c: any) => c.id.includes(phone));

  assert.equal(merchantChats.length, 1);
  assert.equal(merchantChats[0].id, `${phone}@c.us`);
  assert.equal(merchantChats[0].unreadCount, 1);
});

test('Integration: webhook deduplicates concurrent/duplicate incoming messages and keeps unreadCount = 1', async () => {
  const phone = '628199887766';
  const msgId = `false_${phone}@c.us_3EB0DEDUP001`;

  const makePayload = () =>
    makeJsonReq('http://localhost/api/webhook', {
      event: 'message.any',
      payload: {
        id: msgId,
        fromMe: false,
        from: `${phone}@c.us`,
        body: 'Pesan masuk sekali saja',
        pushName: 'Budi',
        timestamp: Math.floor(Date.now() / 1000),
      },
    });

  // Fire two concurrent webhook calls for the same message ID
  await Promise.all([webhookPOST(makePayload()), webhookPOST(makePayload())]);

  const chat = await prisma.chat.findUnique({ where: { id: `${phone}@c.us` } });
  assert.ok(chat);
  assert.equal(chat.unreadCount, 1);

  const msgsRes = await messagesGET(
    new NextRequest(`http://localhost/api/messages?chatId=${phone}%40c.us`)
  );
  const msgsJson = await msgsRes.json();
  assert.equal(msgsJson.messages.length, 1);
});

test('Integration: webhook ignores outgoing duplicate when short stanza ID already exists in DB', async () => {
  const phone = '628554433221';
  const chatId = `${phone}@c.us`;
  const stanza = '3EB0STANZA999';

  await prisma.chat.create({
    data: { id: chatId, name: 'Test Outgoing' },
  });
  await prisma.message.create({
    data: {
      id: stanza,
      chatId,
      fromMe: true,
      body: 'Pesan keluar',
      mediaType: 'text',
      ackStatus: 1,
    },
  });

  // Webhook arrives with full serialized ID containing the same stanza
  const res = await webhookPOST(
    makeJsonReq('http://localhost/api/webhook', {
      event: 'message.any',
      payload: {
        id: `true_${chatId}_${stanza}`,
        fromMe: true,
        to: chatId,
        body: 'Pesan keluar',
        timestamp: Math.floor(Date.now() / 1000),
      },
    })
  );
  const json = await res.json();
  assert.equal(json.ok, true);
  assert.ok(json.ignored);

  const msgs = await prisma.message.findMany({ where: { chatId } });
  assert.equal(msgs.length, 1);
});

test('Integration: merge contacts moves messages transactionally and formats media snippet', async () => {
  const lid = '254412345678901@lid';
  const targetJid = '6287711223344@c.us';

  const lidContact = await prisma.contact.create({
    data: { phone: '254412345678901', jid: lid, name: 'WA User' },
  });
  const targetContact = await prisma.contact.create({
    data: { phone: '6287711223344', jid: targetJid, name: 'Toko Jaya' },
  });

  await prisma.chat.create({ data: { id: lid, name: 'WA User', contactId: lidContact.id } });
  await prisma.message.create({
    data: {
      id: 'false_lid_MSG1',
      chatId: lid,
      contactId: lidContact.id,
      fromMe: false,
      body: null,
      mediaType: 'image',
      mediaUrl: '/uploads/test.jpg',
    },
  });

  const res = await mergePOST(
    makeJsonReq('http://localhost/api/contacts/merge', {
      sourceJid: lid,
      targetJid,
    })
  );
  assert.equal(res.status, 200);

  const mergedChat = await prisma.chat.findUnique({ where: { id: targetJid } });
  assert.ok(mergedChat);
  assert.equal(mergedChat.lastMessage, '📷 Foto');

  const oldChat = await prisma.chat.findUnique({ where: { id: lid } });
  assert.equal(oldChat, null);

  const updatedTarget = await prisma.contact.findUnique({ where: { id: targetContact.id } });
  assert.equal(updatedTarget?.lid, lid);
});
