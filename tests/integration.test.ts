import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';

const basePgUrl =
  process.env.TEST_POSTGRES_BASE_URL ||
  'postgresql://waha:waha_secret_2026@localhost:5433';
const testDbName = `waha_marketing_test_${process.pid}`;
const adminDbUrl = `${basePgUrl}/postgres?schema=public`;
const testDbUrl = `${basePgUrl}/${testDbName}?schema=public`;

process.env.DATABASE_URL = testDbUrl;
process.env.AGENT_SKIP_TYPING_DELAY = '1';

// Create isolated PostgreSQL test database, push schema, and build HNSW pgvector indexes
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
  const cleanupPrisma = new PrismaClient({ datasources: { db: { url: adminDbUrl } } });
  await cleanupPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${testDbName}" WITH (FORCE);`);
  await cleanupPrisma.$disconnect();
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

test('Integration: contact tags add/remove are persisted and linked to chat immediately', async () => {
  const { PATCH: contactsPATCH } = await import('../src/app/api/contacts/route.ts');
  const jid = '628777000111@c.us';
  // Chat exists WITHOUT a contact row (e.g. brand-new inbound number)
  await prisma.chat.create({ data: { id: jid, name: 'Tanpa Kontak' } });

  const addRes = await contactsPATCH(
    makeJsonReq('http://localhost/api/contacts', { jid, tags: 'VIP, Follow Up' }, 'PATCH')
  );
  assert.equal(addRes.status, 200);
  const addJson = await addRes.json();
  assert.equal(addJson.contact.tags, 'VIP, Follow Up');

  // Chat list must now return the contact with tags (no reload needed)
  let chatsJson = await (await chatsGET()).json();
  let chat = chatsJson.chats.find((c: any) => c.id === jid);
  assert.equal(chat.contact?.tags, 'VIP, Follow Up');

  const removeRes = await contactsPATCH(
    makeJsonReq('http://localhost/api/contacts', { jid, tags: 'VIP' }, 'PATCH')
  );
  assert.equal((await removeRes.json()).contact.tags, 'VIP');

  chatsJson = await (await chatsGET()).json();
  chat = chatsJson.chats.find((c: any) => c.id === jid);
  assert.equal(chat.contact?.tags, 'VIP');
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

test('Integration: PostgreSQL pgvector cosine search, SupportIssue, CaseMemory, and MerchantMemory work end-to-end', async () => {
  const phone = '6281399998888';
  const jid = `${phone}@c.us`;

  const merchant = await prisma.contact.create({
    data: {
      phone,
      jid,
      name: 'Sari',
      storeName: 'Sari Bakery',
      lapaqStoreSlug: 'sari-bakery',
      onboardingStage: 'NO_PRODUCT',
      productCount: 0,
    },
  });

  await prisma.merchantMemory.create({
    data: {
      contactId: merchant.id,
      summary: 'Owner toko roti rumahan, biasa akses dashboard lewat HP Android.',
      factsJson: JSON.stringify({ device: 'Android', category: 'Kuliner' }),
    },
  });

  const chat = await prisma.chat.create({
    data: {
      id: jid,
      name: 'Sari Bakery',
      contactId: merchant.id,
      agentMode: 'STEP_BY_STEP',
      activeGuideState: JSON.stringify({ slug: 'tambah-produk-pertama', currentStep: 2 }),
    },
  });
  assert.equal(chat.agentMode, 'STEP_BY_STEP');

  // Create escalation issue and promote to CaseMemory
  const issue = await prisma.supportIssue.create({
    data: {
      code: 'ISS-0001',
      chatId: chat.id,
      contactId: merchant.id,
      category: 'UPLOAD_SAVE_ERROR',
      title: 'Gagal simpan produk setelah upload foto iPhone',
      symptomSummary: 'Foto sudah dipilih tapi tombol Simpan produk gagal menyimpan.',
      stepsTried: 'Sudah cek koneksi internet.',
      status: 'RESOLVED',
      publicUserSolution: 'Ubah format foto HEIC ke JPG/PNG di bawah 2 MB dan pastikan kolom Berat (gram) terisi.',
      isReusableCase: true,
      followupConsent: true,
    },
  });

  const caseMem = await prisma.caseMemory.create({
    data: {
      issueId: issue.id,
      title: issue.title,
      symptomPattern: issue.symptomSummary,
      rootCause: 'Format gambar HEIC / ukuran > 2 MB atau kolom berat kosong',
      verifiedSolution: issue.publicUserSolution!,
      applicability: 'PERMANENT',
    },
  });

  const chunkA = await prisma.knowledgeChunk.create({
    data: {
      sourceType: 'TUTORIAL',
      sourceKey: 'tutorial:tambah-produk-pertama:foto',
      title: 'Aturan Foto Produk Lapaq',
      category: 'produk',
      content: 'Gunakan foto persegi 1:1 format JPG, PNG, atau WebP maksimal 2 MB per foto.',
      contentHash: 'hash_foto_1',
    },
  });

  const chunkB = await prisma.knowledgeChunk.create({
    data: {
      sourceType: 'REPO_BUNDLE',
      sourceKey: 'addon:low_stock_alerts:config',
      title: 'Konfigurasi Add-on Info Stok Menipis',
      category: 'addon',
      content: 'Buka menu Add-on > Info Stok Menipis > klik Kelola > tab Konfigurasi > isi Jumlah stok minimum.',
      contentHash: 'hash_stok_1',
    },
  });

  // Build deterministic 768-dim test vectors
  const makeVec = (axisIndex: number) => {
    const arr = new Array(768).fill(0);
    arr[axisIndex] = 1;
    arr[(axisIndex + 1) % 768] = 0.25;
    return `[${arr.join(',')}]`;
  };

  const vecPhoto = makeVec(0);
  const vecStock = makeVec(10);

  await prisma.$executeRawUnsafe(
    `UPDATE "KnowledgeChunk" SET embedding = $1::vector WHERE id = $2`,
    vecPhoto,
    chunkA.id
  );
  await prisma.$executeRawUnsafe(
    `UPDATE "KnowledgeChunk" SET embedding = $1::vector WHERE id = $2`,
    vecStock,
    chunkB.id
  );
  await prisma.$executeRawUnsafe(
    `UPDATE "CaseMemory" SET embedding = $1::vector WHERE id = $2`,
    vecPhoto,
    caseMem.id
  );

  // Query nearest KnowledgeChunk for stock-limit vector
  const topChunks = await prisma.$queryRawUnsafe<Array<{ id: string; sourceKey: string; distance: number }>>(
    `SELECT id, "sourceKey", (embedding <=> $1::vector) AS distance
     FROM "KnowledgeChunk"
     WHERE "isActive" = true AND embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector ASC
     LIMIT 2`,
    vecStock
  );

  assert.equal(topChunks.length, 2);
  assert.equal(topChunks[0].sourceKey, 'addon:low_stock_alerts:config');
  assert.ok(Number(topChunks[0].distance) < 0.001);

  // Query nearest CaseMemory for photo-upload vector
  const topCases = await prisma.$queryRawUnsafe<Array<{ id: string; verifiedSolution: string }>>(
    `SELECT id, "verifiedSolution"
     FROM "CaseMemory"
     WHERE "isActive" = true AND embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector ASC
     LIMIT 1`,
    vecPhoto
  );
  assert.equal(topCases.length, 1);
  assert.match(topCases[0].verifiedSolution, /JPG\/PNG/);
});

test('Integration: Phase 2 Knowledge Indexer, Quick Notes, Agent Settings, and LapaqBridge STANDALONE/Fallback work end-to-end', async () => {
  const { syncAllLapaqKnowledge, searchKnowledgeBase } = await import(
    '../src/lib/agent/knowledge-indexer.ts'
  );
  const {
    fetchMerchantDiagnostic,
    fetchPlatformCatalog,
    fetchPassiveMerchants,
  } = await import('../src/lib/agent/lapaq-bridge.ts');
  const { GET: agentSettingsGET, PATCH: agentSettingsPATCH } = await import(
    '../src/app/api/admin/agent/settings/route.ts'
  );
  const {
    GET: quickNotesGET,
    POST: quickNotesPOST,
    DELETE: quickNotesDELETE,
  } = await import('../src/app/api/admin/agent/knowledge/quick-notes/route.ts');

  // 1. Sync portable bundle (offline mode for deterministic speed)
  const syncReport = await syncAllLapaqKnowledge({ includeOnline: false });
  assert.ok(syncReport.bundleLoaded >= 40, `Expected >=40 bundle chunks, got ${syncReport.bundleLoaded}`);

  // 2. Verify accurate retrieval for Case 3 (limit stok), Locked Financial Rules, and Coming Soon
  const stockHits = await searchKnowledgeBase('konfigurasi jumlah stok minimum addon limit stok', 5);
  assert.ok(stockHits.some((h) => h.sourceKey === 'addon:low_stock_alerts'));
  assert.ok(stockHits.some((h) => /Jumlah stok minimum/i.test(h.content)));

  const walletHits = await searchKnowledgeBase('dana qris menunggu cair saldo tersedia dompet', 5);
  assert.ok(walletHits.some((h) => /12\.00 WIB/i.test(h.content)));

  // 3. Quick Notes CRUD + automatic provider sanitization
  const createNoteRes = await quickNotesPOST(
    makeJsonReq('http://localhost/api/admin/agent/knowledge/quick-notes', {
      title: 'Promo Akhir Tahun',
      category: 'Promo',
      content: 'Bayar lewat Midtrans otomatis dapat kuota tambahan.',
    })
  );
  assert.equal(createNoteRes.status, 200);
  const createdNote = (await createNoteRes.json()).note;
  assert.doesNotMatch(createdNote.content, /midtrans/i);
  assert.match(createdNote.content, /Pembayaran Online QRIS Lapaq/);

  const listNotes = await (await quickNotesGET(new NextRequest('http://localhost/api/admin/agent/knowledge/quick-notes'))).json();
  assert.equal(listNotes.notes.length, 1);

  const delNoteRes = await quickNotesDELETE(
    new NextRequest(`http://localhost/api/admin/agent/knowledge/quick-notes?id=${createdNote.id}`, {
      method: 'DELETE',
    })
  );
  assert.equal(delNoteRes.status, 200);

  // 4. Agent Settings Master Switch & Encrypted UI API Key persistence (write-only masked response)
  const patchAgentRes = await agentSettingsPATCH(
    makeJsonReq(
      'http://localhost/api/admin/agent/settings',
      {
        masterSwitch: 'ON_OUTSIDE_HOURS',
        agentName: 'Nadia',
        lapaqConnectorMode: 'SANDBOX_API',
        lapaqInternalApiUrl: 'http://127.0.0.1:59999', // intentionally unreachable port to test graceful fallback!
        geminiApiKey: 'AIzaSyDummyTestKeyForUiStorage9876',
      },
      'PATCH'
    )
  );
  assert.equal(patchAgentRes.status, 200);
  const getAgentJson = await (await agentSettingsGET()).json();
  assert.equal(getAgentJson.agentConfig.masterSwitch, 'ON_OUTSIDE_HOURS');
  assert.equal(getAgentJson.agentConfig.agentName, 'Nadia');
  assert.equal(getAgentJson.geminiKeyConfigured, true);
  assert.equal(getAgentJson.geminiKeySource, 'DB');
  assert.equal(getAgentJson.geminiKeyMasked, 'AIza••••••••9876');
  assert.equal(getAgentJson.geminiApiKey, undefined, 'Raw key must NEVER be returned in GET');

  // Clear dummy key so offline tests continue using deterministic fallback without calling live Google API
  await agentSettingsPATCH(
    makeJsonReq('http://localhost/api/admin/agent/settings', { clearGeminiKey: true }, 'PATCH')
  );

  // 5. LapaqBridge graceful fallback + VERIFIED_OWNER vs UNVERIFIED_CALLER enforcement
  process.env.INTERNAL_CS_API_KEY = 'test_key_123';
  const ownerDiag = await fetchMerchantDiagnostic('0813-9999-8888', 'sari-bakery');
  assert.equal(ownerDiag.source, 'STANDALONE_LOCAL');
  assert.equal(ownerDiag.callerAccessLevel, 'VERIFIED_OWNER');
  assert.equal(ownerDiag.onboardingStage, 'NO_PRODUCT');

  const strangerDiag = await fetchMerchantDiagnostic('0899-0000-1111', 'sari-bakery');
  assert.equal(strangerDiag.callerAccessLevel, 'UNVERIFIED_CALLER');
  assert.equal(strangerDiag.onboardingStage, undefined);

  const catalog = await fetchPlatformCatalog();
  assert.equal(catalog.trialDays, 14);

  const passive = await fetchPassiveMerchants(3, 20);
  assert.ok(passive.merchants.some((m) => m.storeSlug === 'sari-bakery'));
});

test('Integration: Phase 3 Orchestrator, Tool Calling, Closed-Loop Escalation -> CaseMemory -> Follow-up, Refund Trap & Takeover', async () => {
  const { waha } = await import('../src/lib/waha.ts');
  const { saveWorkspaceSettings } = await import('../src/lib/settings.ts');
  const { setOrchestratorModelRunnerForTest } = await import(
    '../src/lib/agent/orchestrator.ts'
  );
  const { executeAgentToolCall } = await import('../src/lib/agent/tools.ts');
  const { flushChatBucket } = await import('../src/lib/agent/debouncer.ts');
  const { POST: resolveIssuePOST } = await import(
    '../src/app/api/issues/[id]/resolve/route.ts'
  );
  const { PATCH: agentModePATCH } = await import(
    '../src/app/api/chats/[id]/agent-mode/route.ts'
  );

  // Stub WAHA network calls so no real WhatsApp container is needed during integration test
  const sentWahaMessages: Array<{ chatId: string; text: string }> = [];
  const origSendSeen = waha.sendSeen;
  const origStartTyping = waha.startTyping;
  const origStopTyping = waha.stopTyping;
  const origSendText = waha.sendText;

  waha.sendSeen = async () => ({ ok: true });
  waha.startTyping = async () => ({ ok: true });
  waha.stopTyping = async () => ({ ok: true });
  waha.sendText = async (chatId: string, text: string) => {
    sentWahaMessages.push({ chatId, text });
    return { id: `waha_mock_${Date.now()}_${sentWahaMessages.length}` };
  };

  try {
    await saveWorkspaceSettings({
      agentConfig: {
        masterSwitch: 'ON_ALWAYS',
        agentName: 'Rani',
        debounceMs: 1000,
      } as any,
    });

    // Inject deterministic model runner that exercises real tools (search_case_memory & create_escalation_issue)
    setOrchestratorModelRunnerForTest(async (req) => {
      const lastPartText =
        req.contents[req.contents.length - 1]?.parts?.map((p) => p.text || '').join('\n') || '';

      if (/salah beli paket langganan.*refund/i.test(lastPartText)) {
        // Deliberately return a forbidden refund promise to verify Output Guard blocks it!
        return 'Tenang kak, dana kakak akan kami kembalikan 100% sekarang.';
      }

      // Check CaseMemory first!
      const memResult = (await executeAgentToolCall(
        'search_case_memory',
        { symptom_query: 'gagal simpan produk ukuran variasi khusus' },
        req.toolContext
      )) as any;

      if (memResult.foundCount > 0) {
        return `Halo kak, kemarin sempat ada kendala serupa dan berhasil diatasi dengan cara: ${memResult.cases[0].verifiedSolution} Boleh dicoba dulu ya kak?`;
      }

      // Otherwise escalate via create_escalation_issue tool (Case 2)
      const esc = (await executeAgentToolCall(
        'create_escalation_issue',
        {
          category: 'UPLOAD_SAVE_ERROR',
          title: 'Gagal simpan produk ukuran variasi khusus',
          symptom_summary: 'gagal simpan produk ukuran variasi khusus padahal kolom sudah diisi',
          steps_tried: 'Sudah cek format foto dan berat.',
        },
        req.toolContext
      )) as any;

      return `Baik kak, dengan Rani di sini. Rani catat dulu kendala Kakak (${esc.issueCode}) untuk diteruskan ke divisi teknis ya. Apakah boleh Rani hubungi Kakak kembali jika tim teknis sudah menangani masalah ini?`;
    });

    // 1. Merchant A reports an anomalous issue -> escalated to SupportIssue -> consents to follow-up
    const phoneA = '6281277778888';
    const chatIdA = `${phoneA}@c.us`;

    await webhookPOST(
      makeJsonReq('http://localhost/api/webhook', {
        event: 'message.any',
        payload: {
          id: `false_${chatIdA}_CASE2_M1`,
          fromMe: false,
          from: chatIdA,
          pushName: 'Toko Maju',
          body: 'Kak saya sudah coba tapi tetap tidak bisa, gagal simpan produk ukuran variasi khusus',
          timestamp: Math.floor(Date.now() / 1000),
        },
      })
    );
    await flushChatBucket(chatIdA);

    assert.equal(sentWahaMessages.length, 1);
    assert.match(sentWahaMessages[0].text, /divisi teknis/i);

    const createdIssue = await prisma.supportIssue.findFirst({
      where: { chatId: chatIdA },
      orderBy: { createdAt: 'desc' },
    });
    assert.ok(createdIssue);
    assert.equal(createdIssue.status, 'OPEN');
    assert.equal(createdIssue.followupConsent, false);

    // Merchant A replies "Boleh kak" -> fast-path updates followupConsent = true!
    await webhookPOST(
      makeJsonReq('http://localhost/api/webhook', {
        event: 'message.any',
        payload: {
          id: `false_${chatIdA}_CASE2_M2`,
          fromMe: false,
          from: chatIdA,
          body: 'Boleh kak',
          timestamp: Math.floor(Date.now() / 1000) + 2,
        },
      })
    );
    await flushChatBucket(chatIdA);

    const updatedConsentIssue = await prisma.supportIssue.findUnique({
      where: { id: createdIssue.id },
    });
    assert.equal(updatedConsentIssue?.followupConsent, true);

    // 2. Admin resolves issue on /api/issues/[id]/resolve with isReusableCase=true & sendFollowupNow=true
    const resolveRes = await resolveIssuePOST(
      makeJsonReq(`http://localhost/api/issues/${createdIssue.id}/resolve`, {
        techResolutionNote: 'Nama varian melebihi batas simbol.',
        publicUserSolution: 'Pastikan nama tiap varian tidak memakai karakter khusus dan berat tiap varian terisi.',
        isReusableCase: true,
        sendFollowupNow: true,
      }),
      { params: { id: createdIssue.id } }
    );
    assert.equal(resolveRes.status, 200);
    const resolveJson = await resolveRes.json();
    assert.ok(resolveJson.promotedCaseMemoryId);
    assert.equal(resolveJson.followup?.ok, true);

    // Verify Merchant A received the proactive resolution follow-up!
    assert.ok(
      sentWahaMessages.some(
        (m) => m.chatId === chatIdA && /sudah selesai ditangani oleh tim teknis/i.test(m.text)
      )
    );

    // 3. Merchant B reports the same symptom -> Agent finds the new CaseMemory and suggests the verified solution!
    const phoneB = '6281266665555';
    const chatIdB = `${phoneB}@c.us`;
    await webhookPOST(
      makeJsonReq('http://localhost/api/webhook', {
        event: 'message.any',
        payload: {
          id: `false_${chatIdB}_CASE2_B1`,
          fromMe: false,
          from: chatIdB,
          pushName: 'Toko Baru',
          body: 'Kak kok saya gagal simpan produk ukuran variasi khusus ya?',
          timestamp: Math.floor(Date.now() / 1000) + 5,
        },
      })
    );
    await flushChatBucket(chatIdB);

    const replyToB = sentWahaMessages.find((m) => m.chatId === chatIdB);
    assert.ok(replyToB);
    assert.match(replyToB.text, /karakter khusus dan berat tiap varian terisi/i);

    // 4. Refund Trap Test: auto-creates REFUND_REQUEST issue & Output Guard blocks refund promise!
    const phoneC = '6281244443333';
    const chatIdC = `${phoneC}@c.us`;
    await webhookPOST(
      makeJsonReq('http://localhost/api/webhook', {
        event: 'message.any',
        payload: {
          id: `false_${chatIdC}_REFUND1`,
          fromMe: false,
          from: chatIdC,
          body: 'Saya salah beli paket langganan, tolong refund uang saya sekarang!',
          timestamp: Math.floor(Date.now() / 1000) + 10,
        },
      })
    );
    await flushChatBucket(chatIdC);

    const replyToC = sentWahaMessages.find((m) => m.chatId === chatIdC);
    assert.ok(replyToC);
    assert.doesNotMatch(replyToC.text, /kembalikan 100%/i);
    const refundIssue = await prisma.supportIssue.findFirst({
      where: { chatId: chatIdC, category: 'REFUND_REQUEST' },
    });
    assert.ok(refundIssue);

    // 5. Chat agent-mode toggle endpoint switches chat to HUMAN_TAKEOVER cleanly
    const modeRes = await agentModePATCH(
      makeJsonReq(
        `http://localhost/api/chats/${encodeURIComponent(chatIdB)}/agent-mode`,
        { agentMode: 'HUMAN_TAKEOVER' },
        'PATCH'
      ),
      { params: { id: chatIdB } }
    );
    assert.equal(modeRes.status, 200);
    assert.equal((await modeRes.json()).chat.agentMode, 'HUMAN_TAKEOVER');
  } finally {
    setOrchestratorModelRunnerForTest(null);
    waha.sendSeen = origSendSeen;
    waha.startTyping = origStartTyping;
    waha.stopTyping = origStopTyping;
    waha.sendText = origSendText;
    await saveWorkspaceSettings({
      agentConfig: { masterSwitch: 'OFF' } as any,
    });
  }
});
