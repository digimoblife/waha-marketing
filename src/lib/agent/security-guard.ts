import { prisma } from '@/lib/prisma';
import { createLog } from '@/lib/logger';
import {
  isOutsideWorkingHours,
  type WorkspaceSettings,
} from '@/lib/settings';
import {
  containsForbiddenInternalTerm,
  containsOrphanRoute,
  sanitizeKnowledgeText,
} from './knowledge-sanitizer';

export interface BotGateCheckInput {
  fromMe: boolean;
  chatId: string;
  agentMode: string;
  settings: WorkspaceSettings;
  now?: Date;
}

export interface BotGateDecision {
  shouldProcess: boolean;
  reason: string;
}

/**
 * Invariant Gate #2: Evaluates Master Switch (OFF | ON_ALWAYS | ON_OUTSIDE_HOURS),
 * group exclusions, and chat-level HUMAN_TAKEOVER before touching any debouncer or LLM.
 */
export function evaluateBotGate(input: BotGateCheckInput): BotGateDecision {
  if (input.fromMe) {
    return { shouldProcess: false, reason: 'outgoing_message' };
  }
  if (!input.chatId || input.chatId.endsWith('@g.us') || input.chatId === 'status@broadcast') {
    return { shouldProcess: false, reason: 'group_or_broadcast_chat' };
  }

  const { masterSwitch } = input.settings.agentConfig;
  if (masterSwitch === 'OFF') {
    return { shouldProcess: false, reason: 'master_switch_off' };
  }

  if (masterSwitch === 'ON_OUTSIDE_HOURS') {
    const now = input.now || new Date();
    const outside = isOutsideWorkingHours(
      now,
      input.settings.slaHours.workStart,
      input.settings.slaHours.workEnd
    );
    if (!outside) {
      return { shouldProcess: false, reason: 'inside_working_hours' };
    }
  }

  if (input.agentMode === 'HUMAN_TAKEOVER') {
    return { shouldProcess: false, reason: 'human_takeover_active' };
  }

  return { shouldProcess: true, reason: 'allowed' };
}

export function getWibDateString(now = new Date()): string {
  const wibMs = now.getTime() + 7 * 60 * 60 * 1000;
  const d = new Date(wibMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Enforces per-chat daily AI turn quota to prevent token-draining / spam abuse.
 */
export async function checkAndIncrementDailyAiTurn(
  chatId: string,
  maxDailyTurns: number,
  now = new Date()
): Promise<{ allowed: boolean; count: number }> {
  const todayWib = getWibDateString(now);
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    select: { aiTurnCountToday: true, aiTurnResetDate: true },
  });

  if (!chat) {
    return { allowed: false, count: 0 };
  }

  const currentCount = chat.aiTurnResetDate === todayWib ? chat.aiTurnCountToday : 0;
  if (currentCount >= maxDailyTurns) {
    await prisma.chat.update({
      where: { id: chatId },
      data: {
        agentMode: 'HUMAN_TAKEOVER',
        aiTurnResetDate: todayWib,
      },
    });
    await createLog(
      'SECURITY_WARNING',
      'WARNING',
      `Kuota harian AI terlampaui untuk ${chatId} (${currentCount}/${maxDailyTurns}), otomatis dialihkan ke HUMAN_TAKEOVER`,
      { chatId, currentCount, maxDailyTurns }
    );
    return { allowed: false, count: currentCount };
  }

  const nextCount = currentCount + 1;
  await prisma.chat.update({
    where: { id: chatId },
    data: {
      aiTurnCountToday: nextCount,
      aiTurnResetDate: todayWib,
    },
  });

  return { allowed: true, count: nextCount };
}

/**
 * Wraps untrusted WhatsApp text inside isolated XML data tags, neutralizing tag-escape attempts.
 */
export function wrapUntrustedUserInput(rawText: string): string {
  const safe = String(rawText || '')
    .replace(/<\/?untrusted_whatsapp_user_message>/gi, '[filtered_tag]')
    .slice(0, 4000);
  return `<untrusted_whatsapp_user_message>\n${safe}\n</untrusted_whatsapp_user_message>`;
}

export type PreScreenAction =
  | 'PROCEED'
  | 'BLOCK_PROMPT_INJECTION'
  | 'BLOCK_INTERNAL_PROBE'
  | 'BLOCK_EXPLOIT_ATTEMPT'
  | 'BLOCK_OFF_TOPIC'
  | 'BLOCK_OTP_EXTRACTION';

export interface InboundSafetyClassification {
  action: PreScreenAction;
  isRefundOrCancellation: boolean;
  safeImmediateReply?: string;
}

const PROMPT_INJECTION_REGEX =
  /(abaikan\s+(semua\s+)?instruksi|ignore\s+(all\s+|previous\s+)?instructions|system\s+override|instruksi\s+admin\s+lapaq|salin\s+(kata\s+demi\s+kata\s+)?(seluruh\s+)?system\s+prompt|tampilkan\s+(seluruh\s+)?system\s+prompt|daftar\s+function\/tools|reveal\s+your\s+(system\s+)?prompt)/i;

const INTERNAL_PROBE_REGEX =
  /(nama\s+tabel\s+(postgresql|database|sql)|path\s+file\s+kode|skema\s+database\s+lapaq|pakai\s+(midtrans|xendit|ipaymu|pakasir).*(vendor|belakang)|sebutkan\s+kunci\s+api)/i;

const OTP_EXTRACTION_REGEX =
  /(bacain|bacakan|kasih\s+tau|sebutkan|kirimin|minta)\s+(kode\s+)?otp\b/i;

const EXPLOIT_BYPASS_REGEX =
  /(trik(nya)?|cara\s+(curang| mengakali|akalin|bypass))\s+.*(kuota\s+impor|kupon|otp|gratis\s+langganan)/i;

const MEMORY_POISONING_REGEX =
  /(catat\s+ke\s+memori\s+sistem|simpan\s+ke\s+memori\s+kamu.*kasih\s+tau\s+seller\s+lain)/i;

const OFF_TOPIC_REGEX =
  /\b(buatkan\s+(saya\s+)?(script|kode)\s+(python|javascript|php|golang|java|c\+\+)|scraping\s+harga|artikel\s+blog\s+\d+\s+kata|resep\s+(masakan|kopi\s+kekinian)|strategi\s+politik|kerjakan\s+soal\s+(matematika|nomor|ujian)|ramalan\s+(saham|zodiak|cuaca))\b/i;

const REFUND_TOPIC_REGEX =
  /\b(refund|uang\s+(saya\s+)?(kembali|dikembalikan)|pengembalian\s+dana|salah\s+(beli|bayar|transfer).*(batal|kembali)|batalkan\s+(pembelian\s+|pembayaran\s+)?(paket|langganan|add[\s-]?on|xtra\s+product))\b/i;

/**
 * Deterministic pre-LLM screening for high-confidence adversarial or off-topic inputs.
 */
export function classifyInboundSafety(
  rawText: string,
  agentName: string
): InboundSafetyClassification {
  const text = String(rawText || '').trim();
  const isRefundOrCancellation = REFUND_TOPIC_REGEX.test(text);

  if (PROMPT_INJECTION_REGEX.test(text) || MEMORY_POISONING_REGEX.test(text)) {
    return {
      action: 'BLOCK_PROMPT_INJECTION',
      isRefundOrCancellation: false,
      safeImmediateReply: `Maaf kak, ${agentName} hanya bisa membantu pertanyaan seputar penggunaan dan kendala toko di Lapaq ya. Ada hal terkait toko Kakak di Lapaq yang bisa ${agentName} bantu?`,
    };
  }

  if (OTP_EXTRACTION_REGEX.test(text)) {
    return {
      action: 'BLOCK_OTP_EXTRACTION',
      isRefundOrCancellation: false,
      safeImmediateReply: `Maaf kak, demi keamanan akun, tim maupun sistem kami tidak memiliki akses untuk melihat atau membacakan kode OTP Kakak. Kode OTP hanya dikirimkan otomatis ke email pemilik toko yang terdaftar ya kak.`,
    };
  }

  if (INTERNAL_PROBE_REGEX.test(text)) {
    return {
      action: 'BLOCK_INTERNAL_PROBE',
      isRefundOrCancellation: false,
      safeImmediateReply: `Maaf kak, untuk detail sistem internal di balik layar kami tidak bisa menginformasikannya ya. Namun untuk penggunaan fitur Pembayaran Online QRIS Lapaq, pengiriman, maupun pengelolaan toko, ${agentName} siap bantu jelaskan kak.`,
    };
  }

  if (EXPLOIT_BYPASS_REGEX.test(text)) {
    return {
      action: 'BLOCK_EXPLOIT_ATTEMPT',
      isRefundOrCancellation: false,
      safeImmediateReply: `Maaf kak, penggunaan fitur di Lapaq mengikuti ketentuan kuota dan aturan resmi sistem ya (misalnya 1 produk berhasil diimpor memotong 1 kuota impor). Kalau Kakak butuh panduan cara penggunaannya yang tepat, ${agentName} siap bantu.`,
    };
  }

  // Only block off-topic when the message is clearly non-Lapaq and doesn't mention Lapaq store context
  if (OFF_TOPIC_REGEX.test(text) && !/\blapaq\b/i.test(text)) {
    return {
      action: 'BLOCK_OFF_TOPIC',
      isRefundOrCancellation: false,
      safeImmediateReply: `Maaf kak, ${agentName} khusus membantu kendala dan penggunaan platform toko online Lapaq ya. Kalau ada yang ingin ditanyakan seputar toko Lapaq Kakak, silakan kabari ${agentName} kak.`,
    };
  }

  return {
    action: 'PROCEED',
    isRefundOrCancellation,
  };
}

const REFUND_PROMISE_REGEX =
  /\b(pasti\s+(kami\s+|bisa\s+)?(dikembalikan|direfund|kembali)|uang\s+(kakak\s+)?akan\s+dikembalikan|dana\s+(kakak\s+)?akan\s+(kami\s+)?kembalikan|refund\s+(telah\s+|sudah\s+|pasti\s+)?disetujui|kami\s+setujui\s+refund|kembali\s+100%)\b/i;

const SECRET_KEY_PATTERN = /\b(AIza[0-9A-Za-z\-_]{20,}|sk-[0-9A-Za-z]{20,})\b/;
const PROMPT_LEAK_PATTERN =
  /(untrusted_whatsapp_user_message|LOCKED_FINANCIAL_RULES|SYSTEM_PERSONA_CORE)/i;
const URL_MATCH_REGEX = /https?:\/\/[^\s)>\]]+/gi;

export interface OutputValidationResult {
  safe: boolean;
  text: string;
  blockedReason?: string;
}

function isAllowedLapaqUrl(rawUrl: string): boolean {
  try {
    const cleaned = rawUrl.replace(/[.,;!?]+$/, '');
    const parsed = new URL(cleaned);
    const host = parsed.hostname.toLowerCase();
    return host === 'lapaq.id' || host.endsWith('.lapaq.id');
  } catch {
    return false;
  }
}

/**
 * Layer 5 Deterministic Output Guardrail:
 * Inspects every AI-generated response BEFORE it reaches WAHA sendText.
 */
export function validateAgentOutput(
  draftReply: string,
  options: {
    agentName: string;
    isRefundContext?: boolean;
  }
): OutputValidationResult {
  const { agentName, isRefundContext = false } = options;
  let text = String(draftReply || '').trim();

  if (!text) {
    return {
      safe: false,
      blockedReason: 'empty_output',
      text: `Mohon tunggu sebentar ya kak, ${agentName} cek terlebih dahulu.`,
    };
  }

  // 1. Block prompt/key leakage
  if (SECRET_KEY_PATTERN.test(text) || PROMPT_LEAK_PATTERN.test(text)) {
    return {
      safe: false,
      blockedReason: 'secret_or_prompt_leak',
      text: `Maaf kak, ${agentName} hanya dapat membantu informasi seputar penggunaan toko di Lapaq ya. Ada kendala toko yang bisa ${agentName} bantu cek?`,
    };
  }

  // 2. Block forbidden refund promises
  if ((isRefundContext || REFUND_TOPIC_REGEX.test(text)) && REFUND_PROMISE_REGEX.test(text)) {
    return {
      safe: false,
      blockedReason: 'forbidden_refund_promise',
      text: `Baik kak, perihal pengajuan pembatalan atau pengembalian dana ini belum bisa ${agentName} janjikan maupun putuskan langsung ya. ${agentName} catat dan teruskan terlebih dahulu ke tim Admin kami untuk ditinjau sesuai ketentuan. Apakah boleh ${agentName} hubungi Kakak kembali setelah ada kabar dari tim kami?`,
    };
  }

  // 3. Block or sanitize any non-Lapaq external URLs (anti-phishing)
  const urls = text.match(URL_MATCH_REGEX) || [];
  for (const u of urls) {
    if (!isAllowedLapaqUrl(u)) {
      return {
        safe: false,
        blockedReason: 'unauthorized_external_url',
        text: `Maaf kak, demi keamanan ${agentName} hanya dapat membagikan tautan resmi pada domain lapaq.id ya. Silakan beri tahu kendala di toko Lapaq Kakak agar ${agentName} bantu pandu.`,
      };
    }
  }

  // 4. Block orphan routes or forbidden provider terms if LLM hallucinated them
  if (containsOrphanRoute(text) || containsForbiddenInternalTerm(text)) {
    const sanitized = sanitizeKnowledgeText(text);
    if (containsOrphanRoute(sanitized) || containsForbiddenInternalTerm(sanitized)) {
      return {
        safe: false,
        blockedReason: 'forbidden_internal_term_or_orphan_route',
        text: `Maaf kak, untuk fitur tersebut ${agentName} bantu cek ulang ke tim terkait terlebih dahulu ya agar informasinya akurat.`,
      };
    }
    text = sanitized;
  }

  // 5. Clean up robotic Markdown headings if any slipped through
  text = text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '*$1*')
    .trim();

  if (text.length > 1200) {
    text = text.slice(0, 1190).trimEnd() + '...';
  }

  return { safe: true, text };
}
