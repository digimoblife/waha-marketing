import crypto from 'node:crypto';
import { sanitizePhone } from '@/lib/phone';

export interface ReplacementRule {
  pattern: RegExp;
  replacement: string;
}

/**
 * Mandatory redaction rules per docs/SECURITY_AND_GUARDRAILS.md
 * Ensures internal payment/shipping/cloud provider names and DB internals never enter KB or public output.
 */
export const FORBIDDEN_PROVIDER_REPLACEMENTS: ReplacementRule[] = [
  { pattern: /\b(midtrans|pakkasir|pakasir|ipaymu|xendit|faspay|amazon\s+payment(\s+services)?)\b/gi, replacement: 'Pembayaran Online QRIS Lapaq' },
  { pattern: /\bbiteship(_api_key|_workspace)?\b/gi, replacement: 'Sistem Pengiriman Kurir Lapaq' },
  { pattern: /\b(cloudflare\s*r2|r2\s*bucket|wrangler|d1\s+database)\b/gi, replacement: 'Sistem Penyimpanan Lapaq' },
  { pattern: /\b(drizzle-orm|pgvector|schema\.pg\.ts|password_hash|encrypted_seller_data|email_otp_hash|superadmin_accounts)\b/gi, replacement: '' },
];

export const FORBIDDEN_RAW_CHECK_REGEX =
  /\b(midtrans|pakkasir|pakasir|ipaymu|xendit|faspay|amazon\s+payment|biteship|cloudflare\s*r2|r2\s*bucket|drizzle-orm|schema\.pg\.ts|password_hash|encrypted_seller_data|email_otp_hash|superadmin_accounts)\b/i;

export const ORPHAN_ROUTE_PATTERNS: RegExp[] = [
  /\/admin\/vouchers\b/i,
  /\/admin\/affiliates\b/i,
  /\/admin\/spotlight\b/i,
  /\/admin\/retention\b/i,
  /\/admin\/seller-profile\b/i,
  /[?&]tab=notifications\b/i,
];

export function containsOrphanRoute(text: string): boolean {
  return ORPHAN_ROUTE_PATTERNS.some((re) => re.test(text));
}

export function containsForbiddenInternalTerm(text: string): boolean {
  return FORBIDDEN_RAW_CHECK_REGEX.test(text);
}

/**
 * Strips HTML tags, redacts forbidden provider/infrastructure identifiers,
 * and normalizes whitespace for safe indexing into KnowledgeChunk or CaseMemory.
 */
export function sanitizeKnowledgeText(raw: string): string {
  if (!raw) return '';
  let text = String(raw)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');

  for (const rule of FORBIDDEN_PROVIDER_REPLACEMENTS) {
    text = text.replace(rule.pattern, rule.replacement);
  }

  // Collapse repeated replacement phrases if two providers were listed side-by-side
  text = text.replace(/(Pembayaran Online QRIS Lapaq)(\s*[,/]\s*\1)+/gi, '$1');

  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function computeContentHash(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

export type CallerAccessLevel = 'VERIFIED_OWNER' | 'UNVERIFIED_CALLER';

/**
 * Deterministic backend caller verification based strictly on WhatsApp JID phone vs registered store phone(s).
 */
export function resolveCallerVerification(
  senderPhoneOrJid: string | null | undefined,
  registeredPhones: Array<string | null | undefined>
): CallerAccessLevel {
  const cleanSender = sanitizePhone(String(senderPhoneOrJid || '').replace(/@.*$/, ''));
  if (!cleanSender) return 'UNVERIFIED_CALLER';

  for (const candidate of registeredPhones) {
    const cleanReg = sanitizePhone(String(candidate || '').replace(/@.*$/, ''));
    if (cleanReg && cleanReg === cleanSender) {
      return 'VERIFIED_OWNER';
    }
  }
  return 'UNVERIFIED_CALLER';
}
