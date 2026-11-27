import { prisma } from '@/lib/prisma';
import { getWorkspaceSettings } from '@/lib/settings';
import { sanitizePhone } from '@/lib/phone';
import { resolveCallerVerification, sanitizeKnowledgeText, type CallerAccessLevel } from './knowledge-sanitizer';

export interface MerchantDiagnosticResult {
  source: 'STANDALONE_LOCAL' | 'LAPAQ_API';
  callerAccessLevel: CallerAccessLevel;
  storeExists: boolean;
  storeName?: string | null;
  storeSlug?: string | null;
  onboardingStage?: string | null;
  isStorePubliclyAccessible?: boolean;
  hasPublishedProducts?: boolean;
  isShippingConfigured?: boolean;
  isPaymentConfigured?: boolean;
  categoryCount?: number;
  activeProductCount?: number;
  draftProductCount?: number;
  subscriptionState?: { status: string; endsAt?: string | null };
  installedAddOns?: Array<{
    code: string;
    name: string;
    enabled: boolean;
    lowStockThreshold?: number;
  }>;
  hasPendingWithdrawal?: boolean;
  readinessChecklist?: {
    onboardingCompleted: boolean;
    subscriptionActive: boolean;
    paymentLiveMode: boolean;
    originAddressComplete: boolean;
    courierReady: boolean;
    hasActivePublishedProduct: boolean;
    paymentMethodReady: boolean;
    missingItems: string[];
  };
}

export interface PlatformCatalogResult {
  source: 'FALLBACK_STATIC' | 'LAPAQ_API';
  trialDays: number;
  graceDays: number;
  qrisSettlementSchedule: string;
  withdrawalRules: {
    minimumAmount: number | null;
    adminFee: number | null;
    slaNote: string;
  };
  subscriptionPlans: Array<{
    code: string;
    label: string;
    price: number;
    durationDays: number | null;
  }>;
  addOns: Array<{
    code: string;
    name: string;
    summary: string;
    accessType: string;
    priceAmount: number;
    billingPeriod: string | null;
  }>;
}

export interface PassiveMerchantCandidate {
  phone: string;
  ownerName: string;
  storeName: string;
  storeSlug: string | null;
  businessCategory: string | null;
  accountCreatedAt: string;
  onboardingStage: string;
  productCount: number;
}

const BRIDGE_TIMEOUT_MS = 3500;

async function getBridgeEndpointConfig(): Promise<{ baseUrl: string; apiKey: string } | null> {
  const settings = await getWorkspaceSettings();
  const mode = settings.agentConfig.lapaqConnectorMode;
  const rawUrl = (
    settings.agentConfig.lapaqInternalApiUrl ||
    process.env.LAPAQ_INTERNAL_API_URL ||
    ''
  )
    .trim()
    .replace(/\/$/, '');
  const apiKey = (process.env.INTERNAL_CS_API_KEY || '').trim();

  if (mode === 'STANDALONE' || !rawUrl || !apiKey) {
    return null;
  }
  return { baseUrl: rawUrl, apiKey };
}

/**
 * Builds a safe diagnostic snapshot from local Contact records when running in VPS STANDALONE mode
 * or when the external Lapaq API is unreachable.
 */
async function buildStandaloneDiagnostic(
  senderPhone: string,
  requestedStoreSlugOrName?: string | null
): Promise<MerchantDiagnosticResult> {
  const normalizedSender = sanitizePhone(senderPhone);
  const queryText = (requestedStoreSlugOrName || '').trim();

  const contact = queryText
    ? await prisma.contact.findFirst({
        where: {
          OR: [
            { lapaqStoreSlug: { equals: queryText.toLowerCase() } },
            { storeName: { contains: queryText, mode: 'insensitive' } },
          ],
        },
      })
    : normalizedSender
    ? await prisma.contact.findFirst({
        where: { phone: normalizedSender },
      })
    : null;

  if (!contact) {
    return {
      source: 'STANDALONE_LOCAL',
      callerAccessLevel: 'UNVERIFIED_CALLER',
      storeExists: false,
    };
  }

  const accessLevel = resolveCallerVerification(normalizedSender, [contact.phone]);

  if (accessLevel === 'UNVERIFIED_CALLER') {
    return {
      source: 'STANDALONE_LOCAL',
      callerAccessLevel: 'UNVERIFIED_CALLER',
      storeExists: Boolean(contact.storeName || contact.lapaqStoreSlug),
      storeName: contact.storeName,
      storeSlug: contact.lapaqStoreSlug,
      hasPublishedProducts:
        typeof contact.productCount === 'number' ? contact.productCount > 0 : undefined,
    };
  }

  let installedAddOns: MerchantDiagnosticResult['installedAddOns'];
  if (contact.installedAddOnsJson) {
    try {
      const parsed = JSON.parse(contact.installedAddOnsJson);
      if (Array.isArray(parsed)) installedAddOns = parsed;
    } catch {
      // ignore malformed JSON
    }
  }

  return {
    source: 'STANDALONE_LOCAL',
    callerAccessLevel: 'VERIFIED_OWNER',
    storeExists: Boolean(contact.storeName || contact.lapaqStoreSlug),
    storeName: contact.storeName,
    storeSlug: contact.lapaqStoreSlug,
    onboardingStage: contact.onboardingStage || 'UNKNOWN',
    activeProductCount: contact.productCount ?? undefined,
    installedAddOns,
  };
}

export async function fetchMerchantDiagnostic(
  senderPhone: string,
  storeSlugOrName?: string | null
): Promise<MerchantDiagnosticResult> {
  const normalizedSender = sanitizePhone(senderPhone);
  const cfg = await getBridgeEndpointConfig();

  if (cfg) {
    try {
      const params = new URLSearchParams();
      if (normalizedSender) params.set('senderPhone', normalizedSender);
      if (storeSlugOrName) {
        const slugCandidate = storeSlugOrName
          .trim()
          .toLowerCase()
          .replace(/^https?:\/\/([^/]+)/i, '$1')
          .replace(/\.lapaq\.id.*$/i, '');
        params.set('storeSlug', slugCandidate);
      }

      const res = await fetch(
        `${cfg.baseUrl}/api/internal/cs/merchant-diagnostic?${params.toString()}`,
        {
          headers: { 'x-internal-cs-key': cfg.apiKey },
          signal: AbortSignal.timeout(BRIDGE_TIMEOUT_MS),
          cache: 'no-store',
        }
      );

      if (res.ok) {
        const data = await res.json();
        return {
          source: 'LAPAQ_API',
          ...data,
        };
      }
    } catch (err) {
      console.warn('[LapaqBridge] Fallback to STANDALONE diagnostic due to error:', err);
    }
  }

  return buildStandaloneDiagnostic(normalizedSender, storeSlugOrName);
}

export async function fetchPlatformCatalog(): Promise<PlatformCatalogResult> {
  const cfg = await getBridgeEndpointConfig();

  if (cfg) {
    try {
      const res = await fetch(`${cfg.baseUrl}/api/internal/cs/platform-catalog`, {
        headers: { 'x-internal-cs-key': cfg.apiKey },
        signal: AbortSignal.timeout(BRIDGE_TIMEOUT_MS),
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        return {
          source: 'LAPAQ_API',
          ...data,
        };
      }
    } catch (err) {
      console.warn('[LapaqBridge] Fallback to static catalog rules due to error:', err);
    }
  }

  // Safe static fallback (never invents fixed subscription prices when Superadmin DB is not connected)
  return {
    source: 'FALLBACK_STATIC',
    trialDays: 14,
    graceDays: 30,
    qrisSettlementSchedule: 'H+1 pukul 12.00 WIB',
    withdrawalRules: {
      minimumAmount: null,
      adminFee: null,
      slaNote:
        'Sesuai nominal minimum dan biaya penarikan yang tampil di menu Dompet aplikasi; diproses maksimal 1x24 jam kerja dengan verifikasi OTP email.',
    },
    subscriptionPlans: [],
    addOns: [],
  };
}

export async function fetchPassiveMerchants(
  minDays = 3,
  limit = 50
): Promise<{ source: 'STANDALONE_LOCAL' | 'LAPAQ_API'; merchants: PassiveMerchantCandidate[] }> {
  const cfg = await getBridgeEndpointConfig();

  if (cfg) {
    try {
      const res = await fetch(
        `${cfg.baseUrl}/api/internal/cs/passive-merchants?minDays=${minDays}&limit=${limit}`,
        {
          headers: { 'x-internal-cs-key': cfg.apiKey },
          signal: AbortSignal.timeout(BRIDGE_TIMEOUT_MS),
          cache: 'no-store',
        }
      );
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.merchants)) {
          return {
            source: 'LAPAQ_API',
            merchants: data.merchants.map((m: PassiveMerchantCandidate) => ({
              ...m,
              ownerName: sanitizeKnowledgeText(m.ownerName),
              storeName: sanitizeKnowledgeText(m.storeName),
            })),
          };
        }
      }
    } catch (err) {
      console.warn('[LapaqBridge] Fallback to local Contacts for passive merchants:', err);
    }
  }

  // Standalone fallback: query local Contact table for merchants in DRAFT / NO_CATEGORY / NO_PRODUCT or tagged Onboarding
  const contacts = await prisma.contact.findMany({
    where: {
      isWAUser: true,
      OR: [
        { onboardingStage: { in: ['DRAFT', 'NO_CATEGORY', 'NO_PRODUCT'] } },
        { productCount: 0 },
        { tags: { contains: 'Onboarding', mode: 'insensitive' } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return {
    source: 'STANDALONE_LOCAL',
    merchants: contacts.map((c) => ({
      phone: c.phone,
      ownerName: c.name || c.pushName || 'Kak',
      storeName: c.storeName || c.name || 'Toko Kakak',
      storeSlug: c.lapaqStoreSlug || null,
      businessCategory: c.businessCategory || null,
      accountCreatedAt: c.accountCreatedAt || c.createdAt.toISOString(),
      onboardingStage: c.onboardingStage || 'NO_PRODUCT',
      productCount: c.productCount ?? 0,
    })),
  };
}
