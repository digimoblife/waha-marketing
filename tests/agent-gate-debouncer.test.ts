import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_SETTINGS, type WorkspaceSettings } from '../src/lib/settings.ts';
import { evaluateBotGate } from '../src/lib/agent/security-guard.ts';
import {
  cancelAllDebouncedChats,
  cancelDebouncedChat,
  enqueueDebouncedMessage,
  flushChatBucket,
  getPendingDebounceCount,
  type FlushedChatTurn,
} from '../src/lib/agent/debouncer.ts';

function cloneSettings(
  masterSwitch: WorkspaceSettings['agentConfig']['masterSwitch']
): WorkspaceSettings {
  return {
    ...DEFAULT_SETTINGS,
    slaHours: {
      ...DEFAULT_SETTINGS.slaHours,
      workStart: '08:00',
      workEnd: '17:00',
    },
    agentConfig: {
      ...DEFAULT_SETTINGS.agentConfig,
      masterSwitch,
    },
  };
}

test('agent-gate: Master Switch OFF, outgoing messages, groups, and HUMAN_TAKEOVER never trigger AI', () => {
  // Master Switch OFF
  const offRes = evaluateBotGate({
    fromMe: false,
    chatId: '628123456789@c.us',
    agentMode: 'AI_ACTIVE',
    settings: cloneSettings('OFF'),
  });
  assert.equal(offRes.shouldProcess, false);
  assert.equal(offRes.reason, 'master_switch_off');

  // Outgoing message
  const outRes = evaluateBotGate({
    fromMe: true,
    chatId: '628123456789@c.us',
    agentMode: 'AI_ACTIVE',
    settings: cloneSettings('ON_ALWAYS'),
  });
  assert.equal(outRes.shouldProcess, false);
  assert.equal(outRes.reason, 'outgoing_message');

  // Group chat @g.us & status@broadcast
  assert.equal(
    evaluateBotGate({
      fromMe: false,
      chatId: '1203630999888@g.us',
      agentMode: 'AI_ACTIVE',
      settings: cloneSettings('ON_ALWAYS'),
    }).shouldProcess,
    false
  );
  assert.equal(
    evaluateBotGate({
      fromMe: false,
      chatId: 'status@broadcast',
      agentMode: 'AI_ACTIVE',
      settings: cloneSettings('ON_ALWAYS'),
    }).shouldProcess,
    false
  );

  // HUMAN_TAKEOVER
  const takeoverRes = evaluateBotGate({
    fromMe: false,
    chatId: '628123456789@c.us',
    agentMode: 'HUMAN_TAKEOVER',
    settings: cloneSettings('ON_ALWAYS'),
  });
  assert.equal(takeoverRes.shouldProcess, false);
  assert.equal(takeoverRes.reason, 'human_takeover_active');
});

test('agent-gate: ON_OUTSIDE_HOURS strictly follows Asia/Jakarta (WIB, UTC+7) schedule', () => {
  const settings = cloneSettings('ON_OUTSIDE_HOURS');

  // 11:00 WIB = 04:00 UTC -> inside 08:00-17:00 WIB -> AI must stay quiet
  const daytimeWib = new Date('2026-11-28T04:00:00Z');
  const insideDecision = evaluateBotGate({
    fromMe: false,
    chatId: '628123456789@c.us',
    agentMode: 'AI_ACTIVE',
    settings,
    now: daytimeWib,
  });
  assert.equal(insideDecision.shouldProcess, false);
  assert.equal(insideDecision.reason, 'inside_working_hours');

  // 20:30 WIB = 13:30 UTC -> outside 08:00-17:00 WIB -> AI active!
  const eveningWib = new Date('2026-11-28T13:30:00Z');
  const outsideDecision = evaluateBotGate({
    fromMe: false,
    chatId: '628123456789@c.us',
    agentMode: 'AI_ACTIVE',
    settings,
    now: eveningWib,
  });
  assert.equal(outsideDecision.shouldProcess, true);
  assert.equal(outsideDecision.reason, 'allowed');
});

test('agent-debouncer: coalesces 4 rapid messages into 1 turn and cancels cleanly on human takeover or OFF', async () => {
  cancelAllDebouncedChats();
  const chatId = '6281299990000@c.us';
  const flushedTurns: FlushedChatTurn[] = [];

  const sendPart = (idx: number, text: string, mediaUrl: string | null = null) => {
    enqueueDebouncedMessage({
      chatId,
      senderPhone: '6281299990000',
      debounceMs: 60,
      item: {
        msgId: `msg_${idx}`,
        text,
        mediaType: mediaUrl ? 'image' : 'text',
        mediaUrl,
        quotedBody: idx === 1 ? 'Halo kak ada yang bisa dibantu?' : null,
        timestamp: new Date(),
      },
      onFlush: async (turn) => {
        flushedTurns.push(turn);
      },
    });
  };

  // Burst of 4 messages within a few milliseconds
  sendPart(1, 'Halo kak Rani');
  sendPart(2, 'saya mau tanya');
  sendPart(3, 'ini tampilan halaman add-on saya', '/uploads/addon_screen.png');
  sendPart(4, 'kok tombolnya abu-abu ya?');

  assert.equal(getPendingDebounceCount(), 1);
  await new Promise((r) => setTimeout(r, 110));

  assert.equal(flushedTurns.length, 1);
  assert.equal(flushedTurns[0].items.length, 4);
  assert.equal(flushedTurns[0].lastMsgId, 'msg_4');
  assert.equal(flushedTurns[0].latestMediaItems.length, 1);
  assert.equal(flushedTurns[0].latestMediaItems[0].mediaUrl, '/uploads/addon_screen.png');
  assert.match(flushedTurns[0].combinedText, /Halo kak Rani/);
  assert.match(flushedTurns[0].combinedText, /kok tombolnya abu-abu ya\?/);

  // Verify cancelDebouncedChat aborts pending timer when operator replies manually
  sendPart(5, 'Pesan baru tapi langsung dijawab admin');
  assert.equal(getPendingDebounceCount(), 1);
  assert.equal(cancelDebouncedChat(chatId), true);
  assert.equal(getPendingDebounceCount(), 0);
  assert.equal(await flushChatBucket(chatId), false);
  assert.equal(flushedTurns.length, 1);
});
