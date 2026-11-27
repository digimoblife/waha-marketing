import fs from 'fs/promises';
import path from 'path';
import { ThinkingLevel, type Content, type Part } from '@google/genai';
import { prisma } from '@/lib/prisma';
import { waha } from '@/lib/waha';
import { createLog } from '@/lib/logger';
import { markMessageProcessed } from '@/lib/msg-cache';
import { getWorkspaceSettings, type AgentConfigSettings } from '@/lib/settings';
import { getGeminiClient } from './embeddings';
import { resolveCallerVerification, sanitizeKnowledgeText } from './knowledge-sanitizer';
import {
  checkAndIncrementDailyAiTurn,
  classifyInboundSafety,
  evaluateBotGate,
  validateAgentOutput,
  wrapUntrustedUserInput,
} from './security-guard';
import { buildDynamicTurnContext, buildStaticSystemInstruction } from './persona-prompt';
import { AGENT_TOOL_DECLARATIONS, executeAgentToolCall, type ToolExecutionContext } from './tools';
import type { FlushedChatTurn } from './debouncer';

export const SUPPORTED_GEMINI_MODELS = {
  primary: [
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash (Direkomendasikan — Cepat & Multimodal)' },
    { id: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen (Efisien untuk Agentic Workflow)' },
  ],
  fallbackReasoning: [
    { id: 'gemini-4-argon', label: 'Gemini 4 Argon (Direkomendasikan — Reasoning Cepat)' },
    { id: 'gemini-4-carbon', label: 'Gemini 4 Carbon (Frontier Deep Reasoning Maksimal)' },
  ],
  lite: [
    { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite (Ringkasan Memori Hemat)' },
  ],
  embedding: [
    { id: 'gemini-embedding-2', label: 'Gemini Embedding 2 (Multimodal 768d MRL)' },
  ],
} as const;

export interface ModelTurnRequest {
  model: string;
  thinkingLevel?: ThinkingLevel;
  systemInstruction: string;
  cachedContentName?: string;
  contents: Content[];
  toolContext: ToolExecutionContext;
}

export type CustomModelRunner = (req: ModelTurnRequest) => Promise<string>;

let customRunnerForTest: CustomModelRunner | null = null;

export function setOrchestratorModelRunnerForTest(runner: CustomModelRunner | null) {
  customRunnerForTest = runner;
}

interface CachedPromptHandle {
  cacheKey: string;
  name: string;
  expiresAtMs: number;
}

let activePromptCache: CachedPromptHandle | null = null;
let cacheAttemptedUnsupportedKeys = new Set<string>();

/**
 * Attempts to register/reuse Gemini Context Cache for the static persona & policy prompt.
 * Falls back gracefully to inline systemInstruction if prompt size is under minimum cache threshold.
 */
async function getOrCreatePersonaCache(
  model: string,
  staticInstruction: string
): Promise<string | undefined> {
  const ai = getGeminiClient();
  if (!ai) return undefined;

  const cacheKey = `${model}:${staticInstruction.length}`;
  if (activePromptCache && activePromptCache.cacheKey === cacheKey) {
    if (activePromptCache.expiresAtMs > Date.now() + 60_000) {
      return activePromptCache.name;
    }
    activePromptCache = null;
  }

  if (cacheAttemptedUnsupportedKeys.has(cacheKey)) {
    return undefined;
  }

  try {
    const created = await ai.caches.create({
      model,
      config: {
        systemInstruction: staticInstruction,
        ttl: '3600s',
      },
    });
    if (created?.name) {
      activePromptCache = {
        cacheKey,
        name: created.name,
        expiresAtMs: Date.now() + 55 * 60 * 1000,
      };
      return created.name;
    }
  } catch {
    // Most Flash/Pro tiers require >= 2048-4096 tokens to create an explicit cache;
    // remember key so we fall back cleanly to inline systemInstruction without repeated HTTP calls.
    cacheAttemptedUnsupportedKeys.add(cacheKey);
  }
  return undefined;
}

function guessMimeFromPath(filePath: string, mediaType: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.ogg' || ext === '.opus') return 'audio/ogg';
  if (ext === '.mp3') return 'audio/mp3';
  if (ext === '.m4a') return 'audio/mp4';
  if (ext === '.wav') return 'audio/wav';
  return mediaType === 'audio' ? 'audio/ogg' : 'image/jpeg';
}

async function loadLocalMediaPart(
  mediaUrl: string,
  mediaType: string
): Promise<Part | null> {
  if (!mediaUrl.startsWith('/uploads/')) return null;
  const absPath = path.join(process.cwd(), 'public', mediaUrl.replace(/^\//, ''));
  try {
    const stat = await fs.stat(absPath);
    // Cap inline multimodal payload at 8 MB to avoid memory/API spikes
    if (stat.size > 8 * 1024 * 1024) return null;
    const buf = await fs.readFile(absPath);
    return {
      inlineData: {
        mimeType: guessMimeFromPath(absPath, mediaType),
        data: buf.toString('base64'),
      },
    };
  } catch {
    return null;
  }
}

function shouldRouteToProDiagnosticModel(
  combinedText: string,
  hasScreenshot: boolean,
  agentMode: string
): boolean {
  const lower = combinedText.toLowerCase();
  const persistentFailure =
    /(sudah\s+(saya\s+)?coba\s+tapi\s+(tetap|masih)|tetap\s+(tidak|ga|gak)\s+bisa|masih\s+(error|gagal)|kenapa\s+masih\s+tidak\s+bisa)/i.test(
      lower
    );
  if (persistentFailure) return true;
  if (hasScreenshot && (agentMode === 'STEP_BY_STEP' || /(sebelah\s+mana|kok\s+tidak\s+ada|bingung)/i.test(lower))) {
    return false; // Flash handles standard UI screenshots rapidly; escalate to Pro only if persistent failure
  }
  return false;
}

async function runGeminiWithTools(req: ModelTurnRequest): Promise<string> {
  if (customRunnerForTest) {
    return await customRunnerForTest(req);
  }

  const ai = getGeminiClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY belum dikonfigurasi pada environment server.');
  }

  const workingContents: Content[] = [...req.contents];
  const maxToolRounds = 4;

  for (let round = 0; round <= maxToolRounds; round++) {
    const res = await ai.models.generateContent({
      model: req.model,
      contents: workingContents,
      config: {
        ...(req.cachedContentName
          ? { cachedContent: req.cachedContentName }
          : { systemInstruction: req.systemInstruction }),
        tools: [{ functionDeclarations: AGENT_TOOL_DECLARATIONS }],
        thinkingConfig: {
          thinkingLevel: req.thinkingLevel || ThinkingLevel.LOW,
        },
        maxOutputTokens: 600,
      },
    });

    const candidateContent = res.candidates?.[0]?.content;
    const functionCalls = res.functionCalls;

    if (!functionCalls || functionCalls.length === 0) {
      return (res.text || '').trim();
    }

    if (candidateContent) {
      workingContents.push(candidateContent);
    }

    const responseParts: Part[] = [];
    for (const fc of functionCalls) {
      const fnName = fc.name || 'unknown';
      const fnArgs = (fc.args as Record<string, unknown>) || {};
      const output = await executeAgentToolCall(fnName, fnArgs, req.toolContext);
      responseParts.push({
        functionResponse: {
          id: fc.id,
          name: fnName,
          response: output,
        },
      });
    }

    workingContents.push({
      role: 'user',
      parts: responseParts,
    });
  }

  return '';
}

async function deliverAndRecordAgentMessage(params: {
  chatId: string;
  contactId: string | null;
  replyText: string;
  replyToMsgId?: string;
}): Promise<string> {
  const wahaRes = await waha.deliverHumanLikeReply(params.chatId, params.replyText, {
    replyTo: params.replyToMsgId && !params.replyToMsgId.startsWith('out_') ? params.replyToMsgId : undefined,
  });

  const timestamp = new Date();
  const stanzaId = wahaRes?.key?.id || wahaRes?.id || wahaRes?._data?.id;
  const msgId =
    typeof stanzaId === 'string' && stanzaId
      ? stanzaId.startsWith('true_')
        ? stanzaId
        : `true_${params.chatId}_${stanzaId}`
      : `ai_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  if (typeof stanzaId === 'string' && stanzaId) {
    markMessageProcessed(stanzaId);
  }
  markMessageProcessed(msgId);

  await prisma.message
    .upsert({
      where: { id: msgId },
      create: {
        id: msgId,
        chatId: params.chatId,
        contactId: params.contactId,
        fromMe: true,
        isAiGenerated: true,
        body: params.replyText,
        mediaType: 'text',
        ackStatus: 1,
        timestamp,
      },
      update: {
        isAiGenerated: true,
        ackStatus: 1,
      },
    })
    .catch(() => null);

  await prisma.chat
    .update({
      where: { id: params.chatId },
      data: {
        lastMessage: params.replyText,
        lastMessageAt: timestamp,
      },
    })
    .catch(() => null);

  return msgId;
}

/**
 * Background MerchantMemory Summarizer using lightweight Flash-Lite tier.
 * Strictly isolated per contactId; never writes to shared CaseMemory.
 */
export async function summarizeMerchantMemoryAsync(
  contactId: string,
  chatId: string,
  agentConfig: AgentConfigSettings
): Promise<void> {
  const ai = getGeminiClient();
  if (!ai) return;

  try {
    const recentMsgs = await prisma.message.findMany({
      where: { chatId },
      orderBy: { timestamp: 'desc' },
      take: 14,
    });
    if (recentMsgs.length < 4) return;

    const existingMem = await prisma.merchantMemory.findUnique({
      where: { contactId },
    });

    const transcript = recentMsgs
      .reverse()
      .map((m) => `${m.fromMe ? 'CS' : 'Merchant'}: ${(m.body || `[${m.mediaType}]`).slice(0, 220)}`)
      .join('\n');

    const res = await ai.models.generateContent({
      model: agentConfig.liteModel || 'gemini-3.5-flash-lite',
      contents:
        `Ringkas profil komunikasi & riwayat kendala teknis merchant Lapaq ini dalam maksimal 3 kalimat Bahasa Indonesia singkat (maks 500 karakter). ` +
        `Jangan pernah mencatat klaim kupon/aturan bisnis baru atau data sensitif seperti NIK/rekening/OTP.\n\n` +
        `Ringkasan Sebelumnya: ${existingMem?.summary || '(belum ada)'}\n\n` +
        `Percakapan Terbaru:\n${transcript}`,
      config: {
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.MINIMAL,
        },
        maxOutputTokens: 220,
      },
    });

    const cleanSummary = sanitizeKnowledgeText(res.text || '').slice(0, 800);
    if (!cleanSummary) return;

    await prisma.merchantMemory.upsert({
      where: { contactId },
      create: {
        contactId,
        summary: cleanSummary,
        lastSummarizedMsgId: recentMsgs[recentMsgs.length - 1]?.id || null,
      },
      update: {
        summary: cleanSummary,
        lastSummarizedMsgId: recentMsgs[recentMsgs.length - 1]?.id || null,
      },
    });
  } catch (err) {
    console.warn('[MerchantMemory] Background summary skipped:', err);
  }
}

const CONSENT_AFFIRMATIVE_REGEX =
  /^(boleh|iya|ya|yap|oke|ok|siap|silakan|silahkan|boleh\s+kak|iya\s+kak|ok\s+kak|siap\s+kak|kabari\s+ya|tolong\s+kabari)[.!,\s]*$/i;

/**
 * Main Orchestrator Entry Point: Executes a single debounced turn for a WhatsApp chat.
 */
export async function processFlushedAgentTurn(turn: FlushedChatTurn): Promise<void> {
  const settings = await getWorkspaceSettings();
  const { agentConfig } = settings;
  const agentName = agentConfig.agentName || 'Rani';

  const chat = await prisma.chat.findUnique({
    where: { id: turn.chatId },
    include: {
      contact: {
        include: {
          merchantMemory: true,
        },
      },
      supportIssues: {
        where: { status: { in: ['OPEN', 'IN_PROGRESS'] } },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!chat) return;

  // Re-verify Bot Gate at flush time (in case Admin toggled Master Switch OFF or took over during the 5s window!)
  const gate = evaluateBotGate({
    fromMe: false,
    chatId: chat.id,
    agentMode: chat.agentMode,
    settings,
  });
  if (!gate.shouldProcess) {
    return;
  }

  // Enforce per-chat daily turn limit
  const quota = await checkAndIncrementDailyAiTurn(
    chat.id,
    agentConfig.maxDailyAiTurnsPerChat
  );
  if (!quota.allowed) {
    return;
  }

  const openIssue = chat.supportIssues[0] || null;

  // Fast-path: If chat is WAITING_TECH and merchant replies "boleh kak" to follow-up consent prompt
  if (
    chat.agentMode === 'WAITING_TECH' &&
    openIssue &&
    !openIssue.followupConsent &&
    CONSENT_AFFIRMATIVE_REGEX.test(turn.combinedText)
  ) {
    await prisma.supportIssue.update({
      where: { id: openIssue.id },
      data: { followupConsent: true },
    });
    const ackReply = `Baik kak, terima kasih! Begitu ada pembaruan atau kendalanya selesai ditangani tim teknis, ${agentName} langsung kabari Kakak lewat chat ini ya.`;
    await deliverAndRecordAgentMessage({
      chatId: chat.id,
      contactId: chat.contactId,
      replyText: ackReply,
      replyToMsgId: turn.lastMsgId,
    });
    return;
  }

  // Layer 4 Pre-LLM Safety Screening (Prompt Injection, OTP probe, Internal DB probe, Exploit, Off-Topic)
  const safety = classifyInboundSafety(turn.combinedText, agentName);
  if (safety.action !== 'PROCEED' && safety.safeImmediateReply) {
    await createLog(
      'SECURITY_WARNING',
      'WARNING',
      `Input diblokir oleh Pre-LLM Safety (${safety.action}) pada ${chat.id}`,
      { chatId: chat.id, action: safety.action }
    );
    await deliverAndRecordAgentMessage({
      chatId: chat.id,
      contactId: chat.contactId,
      replyText: safety.safeImmediateReply,
      replyToMsgId: turn.lastMsgId,
    });
    return;
  }

  // Verify caller identity strictly on backend using WAHA JID phone vs Contact phone
  const callerAccessLevel = resolveCallerVerification(turn.senderPhone, [
    chat.contact?.phone,
  ]);

  // Gather recent conversation history (last 16 messages)
  const recentDbMessages = await prisma.message.findMany({
    where: { chatId: chat.id },
    orderBy: { timestamp: 'desc' },
    take: 16,
  });
  const orderedMessages = recentDbMessages.reverse();

  const flushedIds = new Set(turn.items.map((i) => i.msgId));
  const priorMessages = orderedMessages.filter((m) => !flushedIds.has(m.id));

  const contents: Content[] = [];
  for (const m of priorMessages) {
    const textBody = (m.body || '').trim();
    if (!textBody && m.mediaType === 'text') continue;
    contents.push({
      role: m.fromMe ? 'model' : 'user',
      parts: [
        {
          text: m.fromMe
            ? textBody || `[Mengirim ${m.mediaType}]`
            : wrapUntrustedUserInput(textBody || `[Mengirim lampiran ${m.mediaType}]`),
        },
      ],
    });
  }

  // Build current user turn parts: dynamic context + wrapped untrusted text + multimodal screenshot/voice parts
  const dynamicContextText = buildDynamicTurnContext({
    agentName,
    callerAccessLevel,
    contactName: chat.contact?.name || chat.contact?.pushName,
    storeName: chat.contact?.storeName,
    storeSlug: chat.contact?.lapaqStoreSlug,
    businessCategory: chat.contact?.businessCategory,
    onboardingStage: chat.contact?.onboardingStage,
    agentMode: chat.agentMode,
    activeGuideState: chat.activeGuideState,
    campaignContext: chat.campaignContext,
    merchantMemorySummary: chat.contact?.merchantMemory?.summary || null,
    openIssueSummary: openIssue
      ? {
          code: openIssue.code,
          title: openIssue.title,
          followupConsent: openIssue.followupConsent,
        }
      : null,
    isRefundContext: safety.isRefundOrCancellation,
  });

  const currentParts: Part[] = [
    {
      text:
        `${dynamicContextText}\n\n` +
        wrapUntrustedUserInput(
          turn.combinedText ||
            (turn.latestMediaItems.length > 0
              ? '[User mengirimkan lampiran gambar/suara]'
              : '')
        ),
    },
  ];

  const recentScreenshotUrls: string[] = [];
  for (const media of turn.latestMediaItems) {
    if (media.mediaType === 'image') {
      recentScreenshotUrls.push(media.mediaUrl);
    }
    const part = await loadLocalMediaPart(media.mediaUrl, media.mediaType);
    if (part) {
      currentParts.push(part);
    }
  }

  // Also capture any image sent in the last 3 messages of the chat in case escalation needs screenshot attachment
  for (const m of orderedMessages.slice(-4)) {
    if (!m.fromMe && m.mediaType === 'image' && m.mediaUrl) {
      if (!recentScreenshotUrls.includes(m.mediaUrl)) {
        recentScreenshotUrls.push(m.mediaUrl);
      }
    }
  }

  contents.push({
    role: 'user',
    parts: currentParts,
  });

  const usePro = shouldRouteToProDiagnosticModel(
    turn.combinedText,
    recentScreenshotUrls.length > 0,
    chat.agentMode
  );
  const targetModel = usePro
    ? agentConfig.fallbackProModel || 'gemini-4-argon'
    : agentConfig.primaryModel || 'gemini-3.8-flash';
  const targetThinkingLevel = usePro ? ThinkingLevel.MEDIUM : ThinkingLevel.LOW;

  const staticInstruction = buildStaticSystemInstruction(agentName);
  const cachedContentName = customRunnerForTest
    ? undefined
    : await getOrCreatePersonaCache(targetModel, staticInstruction);

  try {
    let rawReply = await runGeminiWithTools({
      model: targetModel,
      thinkingLevel: targetThinkingLevel,
      systemInstruction: staticInstruction,
      cachedContentName,
      contents,
      toolContext: {
        chatId: chat.id,
        contactId: chat.contactId,
        verifiedSenderPhone: turn.senderPhone,
        recentScreenshotUrls,
      },
    });

    // If refund topic was detected and model somehow forgot to escalate, enforce deterministic escalation ticket!
    if (safety.isRefundOrCancellation) {
      await executeAgentToolCall(
        'create_escalation_issue',
        {
          category: 'REFUND_REQUEST',
          title: 'Pengajuan Refund / Pembatalan Pembelian',
          symptom_summary: turn.combinedText.slice(0, 1000),
          steps_tried: 'Langsung dieskalasi sesuai kebijakan nol janji refund.',
        },
        {
          chatId: chat.id,
          contactId: chat.contactId,
          verifiedSenderPhone: turn.senderPhone,
          recentScreenshotUrls,
        }
      );
    }

    // Layer 5 Deterministic Output Guardrail
    const checked = validateAgentOutput(rawReply, {
      agentName,
      isRefundContext: safety.isRefundOrCancellation,
    });

    if (!checked.safe) {
      await createLog(
        'SECURITY_WARNING',
        'WARNING',
        `Output Guard menahan draf balasan AI (${checked.blockedReason}) pada ${chat.id}`,
        { chatId: chat.id, blockedReason: checked.blockedReason }
      );
    }

    await deliverAndRecordAgentMessage({
      chatId: chat.id,
      contactId: chat.contactId,
      replyText: checked.text,
      replyToMsgId: turn.lastMsgId,
    });

    // Clear one-time campaignContext once Agent has responded to merchant's first reply
    if (chat.campaignContext) {
      await prisma.chat
        .update({
          where: { id: chat.id },
          data: { campaignContext: null },
        })
        .catch(() => null);
    }

    // Trigger lightweight background MerchantMemory update periodically
    if (chat.contactId && orderedMessages.length >= 4 && orderedMessages.length % 4 === 0) {
      void summarizeMerchantMemoryAsync(chat.contactId, chat.id, agentConfig);
    }
  } catch (err: any) {
    console.error(`[AgentOrchestrator] Failed processing turn for ${chat.id}:`, err);
    await createLog(
      'ERROR',
      'ERROR',
      `Agent Orchestrator gagal memproses chat ${chat.id}: ${err?.message || 'Unknown error'}`,
      { chatId: chat.id, model: targetModel },
      err?.message
    );
  }
}

/**
 * Sends a warm, sanitized proactive follow-up WhatsApp message to the merchant
 * once an escalated SupportIssue has been marked RESOLVED by Admin/Technical team.
 */
export async function sendIssueResolvedFollowup(issueId: string): Promise<{
  ok: boolean;
  sentText?: string;
  error?: string;
}> {
  const issue = await prisma.supportIssue.findUnique({
    where: { id: issueId },
    include: {
      contact: true,
      chat: true,
    },
  });

  if (!issue) {
    return { ok: false, error: 'Tiket tidak ditemukan' };
  }
  if (issue.status !== 'RESOLVED') {
    return { ok: false, error: 'Tiket belum berstatus RESOLVED' };
  }

  const settings = await getWorkspaceSettings();
  const agentName = settings.agentConfig.agentName || 'Rani';
  const greetingTarget =
    issue.contact?.storeName || issue.contact?.name || issue.chat?.name || '';
  const cleanTarget = greetingTarget ? ` ${greetingTarget}` : '';
  const cleanSolution = sanitizeKnowledgeText(
    issue.publicUserSolution ||
      issue.techResolutionNote ||
      'Kendala yang Kakak laporkan sebelumnya sudah selesai diperbaiki oleh tim teknis kami.'
  );

  const draft = `Halo Kak${cleanTarget}, dengan ${agentName} dari Lapaq. Kabar baik kak, terkait kendala "${issue.title}" (${issue.code}) yang sebelumnya Kakak sampaikan, saat ini sudah selesai ditangani oleh tim teknis kami: ${cleanSolution}\n\nSilakan dicoba kembali ya kak. Kalau masih ada yang perlu dibantu, kabari ${agentName} saja ya!`;

  const checked = validateAgentOutput(draft, {
    agentName,
    isRefundContext: issue.category === 'REFUND_REQUEST',
  });

  await deliverAndRecordAgentMessage({
    chatId: issue.chatId,
    contactId: issue.contactId,
    replyText: checked.text,
  });

  await prisma.$transaction([
    prisma.supportIssue.update({
      where: { id: issue.id },
      data: { followupSentAt: new Date() },
    }),
    prisma.chat.update({
      where: { id: issue.chatId },
      data: { agentMode: 'AI_ACTIVE', status: 'OPEN' },
    }),
  ]);

  await createLog(
    'AGENT',
    'SUCCESS',
    `Agent mengirimkan kabar penyelesaian tiket [${issue.code}] ke ${issue.chatId}`,
    { issueId: issue.id, code: issue.code, chatId: issue.chatId }
  );

  return { ok: true, sentText: checked.text };
}
