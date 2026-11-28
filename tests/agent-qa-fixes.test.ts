// Regression tests for QA-01 .. QA-06 in docs/LAPORAN_AUDIT_QA.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';

const basePgUrl =
  process.env.TEST_POSTGRES_BASE_URL || 'postgresql://waha:waha_secret_2026@localhost:5433';
const testDbName = `waha_marketing_qa_${process.pid}`;
const adminDbUrl = `${basePgUrl}/postgres?schema=public`;
const testDbUrl = `${basePgUrl}/${testDbName}?schema=public`;
process.env.DATABASE_URL = testDbUrl;
process.env.AGENT_SKIP_TYPING_DELAY = '1';

const adminPrisma = new PrismaClient({ datasources: { db: { url: adminDbUrl } } });
await adminPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${testDbName}" WITH (FORCE);`);
await adminPrisma.$executeRawUnsafe(`CREATE DATABASE "${testDbName}";`);
await adminPrisma.$disconnect();
execSync(`npx prisma db push --skip-generate && node scripts/setup-pgvector-indexes.mjs`, {
  env: { ...process.env, DATABASE_URL: testDbUrl },
  stdio: 'pipe',
});

const { prisma } = await import('../src/lib/prisma.ts');
const { waha } = await import('../src/lib/waha.ts');
const { saveWorkspaceSettings } = await import('../src/lib/settings.ts');
const { processFlushedAgentTurn, sendIssueResolvedFollowup, setOrchestratorModelRunnerForTest } =
  await import('../src/lib/agent/orchestrator.ts');
const { executeAgentToolCall } = await import('../src/lib/agent/tools.ts');
const { POST: messagesPOST } = await import('../src/app/api/messages/route.ts');

// WAHA stub: records sends; can be told to reject.
const sent: Array<{ chatId: string; text: string }> = [];
let rejectSends = false;
waha.sendSeen = async () => ({ ok: true });
waha.startTyping = async () => ({ ok: true });
waha.stopTyping = async () => ({ ok: true });
waha.sendText = async (chatId: string, text: string) => {
  if (rejectSends) return { statusCode: 503, message: 'Service Unavailable' };
  sent.push({ chatId, text });
  return { id: `true_${chatId}_3EB0STUB${Date.now()}${sent.length}` };
};

test.after(async () => {
  setOrchestratorModelRunnerForTest(null);
  await prisma.$disconnect();
  const cleanup = new PrismaClient({ datasources: { db: { url: adminDbUrl } } });
  await cleanup.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${testDbName}" WITH (FORCE);`);
  await cleanup.$disconnect();
});

async function setup(chatId: string, masterSwitch = 'ON_ALWAYS') {
  await saveWorkspaceSettings({ agentConfig: { masterSwitch, agentName: 'Rani' } as any });
  await prisma.chat.create({ data: { id: chatId, name: 'Seller Uji', agentMode: 'AI_ACTIVE' } });
}

function turnFor(chatId: string, text: string) {
  const msgId = `false_${chatId}_3EB0IN${Date.now()}`;
  return {
    chatId,
    senderPhone: chatId.replace(/@c\.us$/, ''),
    items: [{ msgId, text, mediaType: 'text', mediaUrl: null, quotedBody: null, timestamp: new Date() }],
    combinedText: text,
    latestMediaItems: [],
    lastMsgId: msgId,
  } as any;
}

// A model runner whose answer is held until release() is called.
function heldModel(answer = 'Baik kak, coba buka menu Produk lalu klik Simpan ya.') {
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const startedP = new Promise<void>((r) => (started = r));
  setOrchestratorModelRunnerForTest(async () => {
    started();
    await gate;
    return answer;
  });
  return { release, started: startedP };
}

const aiRepliesTo = (chatId: string) => sent.filter((m) => m.chatId === chatId);

test('QA-01: no AI reply is sent after an operator takes over mid-turn', async () => {
  const chatId = '6281200000101@c.us';
  await setup(chatId);
  const model = heldModel();

  const turn = processFlushedAgentTurn(turnFor(chatId, 'Kak produk saya tidak bisa disimpan'));
  await model.started;

  const res = await messagesPOST(
    new NextRequest('http://localhost/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, text: 'Halo kak, saya bantu cek manual ya' }),
    })
  );
  assert.equal(res.status, 200);
  model.release();
  await turn;

  assert.deepEqual(aiRepliesTo(chatId).map((m) => m.text), ['Halo kak, saya bantu cek manual ya']);
  assert.equal(await prisma.message.count({ where: { chatId, isAiGenerated: true } }), 0);
});

test('QA-02: no AI reply is sent after the master switch is turned OFF mid-turn', async () => {
  const chatId = '6281200000102@c.us';
  await setup(chatId);
  const model = heldModel();

  const turn = processFlushedAgentTurn(turnFor(chatId, 'Kak cara upload foto produk gimana?'));
  await model.started;
  await saveWorkspaceSettings({ agentConfig: { masterSwitch: 'OFF' } as any });
  model.release();
  await turn;

  assert.equal(aiRepliesTo(chatId).length, 0);
  assert.equal(await prisma.message.count({ where: { chatId, isAiGenerated: true } }), 0);
});

test('QA-03: a refund request is escalated even when Gemini fails', async () => {
  const chatId = '6281200000103@c.us';
  await setup(chatId);
  setOrchestratorModelRunnerForTest(async () => {
    throw Object.assign(new Error('503 Service Unavailable'), { status: 503 });
  });

  await processFlushedAgentTurn(
    turnFor(chatId, 'Saya salah beli paket langganan, tolong refund uang saya.')
  );

  assert.equal(
    await prisma.supportIssue.count({ where: { chatId, category: 'REFUND_REQUEST' } }),
    1
  );
  // The merchant is told it was forwarded, with no promise of money back.
  const replies = aiRepliesTo(chatId).map((m) => m.text);
  assert.equal(replies.length, 1);
  assert.match(replies[0], /teruskan ke tim Admin/);
  assert.doesNotMatch(replies[0], /dikembalikan|kami kembalikan|pasti (kembali|cair)/i);
});

test('QA-04: a refund request does not overwrite an open technical ticket', async () => {
  const chatId = '6281200000104@c.us';
  await setup(chatId);
  const ctx = { chatId, contactId: null, verifiedSenderPhone: '6281200000104', recentScreenshotUrls: [] };

  await executeAgentToolCall(
    'create_escalation_issue',
    { category: 'UPLOAD_SAVE_ERROR', title: 'Gagal simpan produk', symptom_summary: 'Tombol simpan tidak merespons' },
    ctx
  );
  setOrchestratorModelRunnerForTest(async () => 'Baik kak, sudah kami teruskan ke tim Admin ya.');
  await processFlushedAgentTurn(turnFor(chatId, 'Saya ingin refund paket langganan Lapaq.'));

  const issues = await prisma.supportIssue.findMany({ where: { chatId }, orderBy: { createdAt: 'asc' } });
  assert.deepEqual(issues.map((i) => i.category), ['UPLOAD_SAVE_ERROR', 'REFUND_REQUEST']);
  assert.equal(issues[0].symptomSummary, 'Tombol simpan tidak merespons');
});

test('QA-05: a rejected follow-up is reported as failed and not marked sent', async () => {
  const chatId = '6281200000105@c.us';
  await setup(chatId);
  const issue = await prisma.supportIssue.create({
    data: {
      code: 'ISS-9105',
      chatId,
      category: 'TECHNICAL_BUG',
      title: 'Halaman toko kosong',
      symptomSummary: 'Halaman toko tidak tampil',
      status: 'RESOLVED',
      publicUserSolution: 'Silakan muat ulang halaman toko.',
    },
  });

  rejectSends = true;
  try {
    const result = await sendIssueResolvedFollowup(issue.id);
    assert.equal(result.ok, false);
    assert.match(result.error || '', /Service Unavailable/);
  } finally {
    rejectSends = false;
  }

  const after = await prisma.supportIssue.findUnique({ where: { id: issue.id } });
  assert.equal(after?.followupSentAt, null);
  assert.equal(await prisma.message.count({ where: { chatId, fromMe: true } }), 0);
});

test('QA-06: 12 concurrent escalations all get unique ticket codes', async () => {
  const chatIds = Array.from({ length: 12 }, (_, i) => `62812000002${String(i).padStart(2, '0')}@c.us`);
  await prisma.chat.createMany({ data: chatIds.map((id) => ({ id, name: id })) });

  const results = await Promise.allSettled(
    chatIds.map((chatId) =>
      executeAgentToolCall(
        'create_escalation_issue',
        { category: 'TECHNICAL_BUG', title: 'Kendala serentak', symptom_summary: 'Uji serentak' },
        { chatId, contactId: null, verifiedSenderPhone: chatId, recentScreenshotUrls: [] }
      )
    )
  );

  assert.equal(results.filter((r) => r.status === 'rejected').length, 0);
  const codes = (await prisma.supportIssue.findMany({ where: { chatId: { in: chatIds } } })).map((i) => i.code);
  assert.equal(codes.length, 12);
  assert.equal(new Set(codes).size, 12);
});
