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
const { GET: chatsGET, PATCH: chatsPATCH } = await import('../src/app/api/chats/route.ts');
const { GET: messagesGET } = await import('../src/app/api/messages/route.ts');
const { POST: mergePOST } = await import('../src/app/api/contacts/merge/route.ts');
const { GET: notesGET, POST: notesPOST } = await import('../src/app/api/contacts/[id]/notes/route.ts');
const { GET: templatesGET, POST: templatesPOST, DELETE: templatesDELETE } = await import('../src/app/api/templates/route.ts');
const { GET: settingsGET, PUT: settingsPUT } = await import('../src/app/api/admin/settings/route.ts');
const { GET: broadcastsGET, POST: broadcastsPOST } = await import('../src/app/api/broadcasts/route.ts');
const { GET: overviewGET } = await import('../src/app/api/admin/overview/route.ts');

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

test('Integration: chat status, assignee, reminder, and 3-latest internal team notes work end-to-end', async () => {
  const op = await prisma.user.create({
    data: { username: 'dina_test', password: 'x', name: 'Dina Test', role: 'OPERATOR' },
  });
  const contact = await prisma.contact.create({
    data: {
      phone: '628111222333',
      jid: '628111222333@c.us',
      name: 'Rizky',
      storeName: 'Kopi Uji',
      notes: 'Catatan lama legacy',
    },
  });
  await prisma.chat.create({
    data: { id: contact.jid, name: 'Rizky', contactId: contact.id },
  });

  // 1. Update status, assignee, and reminder via PATCH /api/chats
  const reminderIso = new Date(Date.now() - 60000).toISOString(); // overdue for SLA test
  const patchRes = await chatsPATCH(
    makeJsonReq(
      'http://localhost/api/chats',
      {
        chatId: contact.jid,
        status: 'FOLLOW_UP',
        assigneeId: op.id,
        reminderAt: reminderIso,
        reminderNote: 'Follow up katalog',
      },
      'PATCH'
    )
  );
  assert.equal(patchRes.status, 200);
  const patchJson = await patchRes.json();
  assert.equal(patchJson.chat.status, 'FOLLOW_UP');
  assert.equal(patchJson.chat.assigneeId, op.id);
  assert.equal(patchJson.chat.reminderNote, 'Follow up katalog');

  // 2. Legacy note migrates automatically, and adding 3 more notes returns 3 latest by default
  const initialNotesRes = await notesGET(
    new NextRequest(`http://localhost/api/contacts/${contact.id}/notes`),
    { params: { id: contact.id } }
  );
  const initialNotes = await initialNotesRes.json();
  assert.equal(initialNotes.total, 1);
  assert.equal(initialNotes.notes[0].body, 'Catatan lama legacy');

  for (const text of ['Catatan 2', 'Catatan 3', 'Catatan 4']) {
    const postRes = await notesPOST(
      makeJsonReq(`http://localhost/api/contacts/${contact.id}/notes`, { body: text }),
      { params: { id: contact.id } }
    );
    assert.equal(postRes.status, 200);
  }

  const latest3Res = await notesGET(
    new NextRequest(`http://localhost/api/contacts/${contact.id}/notes`),
    { params: { id: contact.id } }
  );
  const latest3 = await latest3Res.json();
  assert.equal(latest3.total, 4);
  assert.equal(latest3.notes.length, 3);
  assert.equal(latest3.notes[0].body, 'Catatan 4');

  const allNotesRes = await notesGET(
    new NextRequest(`http://localhost/api/contacts/${contact.id}/notes?all=true`),
    { params: { id: contact.id } }
  );
  const allNotes = await allNotesRes.json();
  assert.equal(allNotes.notes.length, 4);
});

test('Integration: templates CRUD, settings persistence, broadcast guardrail, and admin overview work', async () => {
  // 1. Templates auto-seed & CRUD
  const seedRes = await templatesGET();
  const seedJson = await seedRes.json();
  assert.ok(seedJson.templates.length >= 4);

  const createTplRes = await templatesPOST(
    makeJsonReq('http://localhost/api/templates', {
      shortcut: 'uji',
      title: 'Template Uji',
      category: 'Promo',
      body: 'Halo {nama} dari {nama_toko}',
    })
  );
  assert.equal(createTplRes.status, 200);
  const createdTpl = (await createTplRes.json()).template;
  assert.equal(createdTpl.shortcut, '/uji');

  const delTplRes = await templatesDELETE(
    new NextRequest(`http://localhost/api/templates?id=${createdTpl.id}`, { method: 'DELETE' })
  );
  assert.equal(delTplRes.status, 200);

  // 2. Admin Settings persistence
  const putSetRes = await settingsPUT(
    makeJsonReq(
      'http://localhost/api/admin/settings',
      {
        guardrail: {
          maxDailyMessages: 300,
          minDelaySec: 12,
          maxRecipientsPerCampaign: 2,
          circuitBreakerErrors: 3,
        },
        masterTags: ['VIP', 'Follow Up', 'Hot Lead'],
      },
      'PUT'
    )
  );
  assert.equal(putSetRes.status, 200);

  const getSetRes = await settingsGET();
  const getSetJson = await getSetRes.json();
  assert.equal(getSetJson.settings.guardrail.maxDailyMessages, 300);
  assert.equal(getSetJson.settings.guardrail.maxRecipientsPerCampaign, 2);

  // 3. Broadcast guardrail blocks campaign exceeding maxRecipientsPerCampaign (2)
  const blockedBc = await broadcastsPOST(
    makeJsonReq('http://localhost/api/broadcasts', {
      name: 'Terlalu Banyak',
      messageBody: 'Halo {nama}',
      startNow: false,
      recipients: [
        { phone: '081200000001' },
        { phone: '081200000002' },
        { phone: '081200000003' },
      ],
    })
  );
  assert.equal(blockedBc.status, 400);

  // Valid draft campaign (startNow: false so it doesn't call live WAHA during test)
  const okBc = await broadcastsPOST(
    makeJsonReq('http://localhost/api/broadcasts', {
      name: 'Campaign Valid',
      messageBody: 'Halo {nama}',
      startNow: false,
      delayMinSec: 5, // should be clamped up to admin minDelaySec (12)
      recipients: [{ phone: '081200000001', storeName: 'Toko Satu' }],
    })
  );
  assert.equal(okBc.status, 200);
  const okBcJson = await okBc.json();
  assert.equal(okBcJson.campaign.delayMinSec, 12);
  assert.equal(okBcJson.campaign.totalCount, 1);

  const listBcRes = await broadcastsGET();
  const listBcJson = await listBcRes.json();
  assert.ok(listBcJson.campaigns.length >= 1);

  // 4. Admin Overview endpoint aggregates workload, SLA alerts, funnel, and 7d traffic
  const ovRes = await overviewGET();
  assert.equal(ovRes.status, 200);
  const ovJson = await ovRes.json();
  assert.equal(ovJson.guardrail.maxDailyMessages, 300);
  assert.equal(ovJson.traffic7d.length, 7);
  assert.ok(Array.isArray(ovJson.workload));
  assert.ok(ovJson.slaAlerts.some((a: any) => a.type === 'OVERDUE'));
});
