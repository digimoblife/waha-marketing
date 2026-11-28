import crypto from 'node:crypto';
import { prisma } from '@/lib/prisma';

const SECRET_SETTING_KEY = 'agent_secrets_v1';

interface StoredAgentSecrets {
  geminiApiKey?: string;
  internalCsApiKey?: string;
}

interface EncryptedPayload {
  iv: string;
  tag: string;
  data: string;
}

const globalForSecrets = globalThis as unknown as {
  agentSecretsCache?: {
    hydrated: boolean;
    geminiApiKey: string;
    internalCsApiKey: string;
  };
};

function deriveEncryptionKey(): Buffer {
  const seed =
    process.env.JWT_SECRET || 'waha_marketing_super_secure_jwt_secret_key_2026';
  return crypto.createHash('sha256').update(`agent_secrets:${seed}`).digest();
}

function encryptJson(obj: StoredAgentSecrets): string {
  const key = deriveEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(obj), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload: EncryptedPayload = {
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64'),
  };
  return JSON.stringify(payload);
}

function decryptJson(raw: string): StoredAgentSecrets {
  try {
    const parsed = JSON.parse(raw) as EncryptedPayload;
    if (!parsed.iv || !parsed.tag || !parsed.data) return {};
    const key = deriveEncryptionKey();
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(parsed.iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(parsed.data, 'base64')),
      decipher.final(),
    ]);
    return JSON.parse(decrypted.toString('utf8')) as StoredAgentSecrets;
  } catch {
    return {};
  }
}

export function maskSecretKey(rawKey: string): string {
  const clean = (rawKey || '').trim();
  if (!clean) return '';
  if (clean.length <= 8) return '••••••••';
  return `${clean.slice(0, 4)}••••••••${clean.slice(-4)}`;
}

async function ensureHydrated() {
  if (globalForSecrets.agentSecretsCache?.hydrated) {
    return globalForSecrets.agentSecretsCache;
  }

  let geminiApiKey = '';
  let internalCsApiKey = '';
  try {
    const row = await prisma.appSetting.findUnique({
      where: { key: SECRET_SETTING_KEY },
    });
    if (row?.value) {
      const dec = decryptJson(row.value);
      geminiApiKey = (dec.geminiApiKey || '').trim();
      internalCsApiKey = (dec.internalCsApiKey || '').trim();
    }
  } catch {
    // ignore DB errors during early boot
  }

  globalForSecrets.agentSecretsCache = {
    hydrated: true,
    geminiApiKey,
    internalCsApiKey,
  };
  return globalForSecrets.agentSecretsCache;
}

export async function getEffectiveGeminiApiKey(): Promise<string> {
  const cache = await ensureHydrated();
  if (cache.geminiApiKey) return cache.geminiApiKey;
  return (process.env.GEMINI_API_KEY || '').trim();
}

export async function getEffectiveInternalCsApiKey(): Promise<string> {
  const cache = await ensureHydrated();
  if (cache.internalCsApiKey) return cache.internalCsApiKey;
  return (process.env.INTERNAL_CS_API_KEY || '').trim();
}

export async function getAgentKeyStatus() {
  const cache = await ensureHydrated();
  const envGemini = (process.env.GEMINI_API_KEY || '').trim();
  const envLapaq = (process.env.INTERNAL_CS_API_KEY || '').trim();

  const effectiveGemini = cache.geminiApiKey || envGemini;
  const geminiKeySource: 'DB' | 'ENV' | 'NONE' = cache.geminiApiKey
    ? 'DB'
    : envGemini
    ? 'ENV'
    : 'NONE';

  const effectiveLapaq = cache.internalCsApiKey || envLapaq;
  const lapaqKeySource: 'DB' | 'ENV' | 'NONE' = cache.internalCsApiKey
    ? 'DB'
    : envLapaq
    ? 'ENV'
    : 'NONE';

  return {
    geminiKeyConfigured: Boolean(effectiveGemini),
    geminiKeySource,
    geminiKeyMasked: maskSecretKey(effectiveGemini),
    lapaqApiKeyConfigured: Boolean(effectiveLapaq),
    lapaqKeySource,
    lapaqKeyMasked: maskSecretKey(effectiveLapaq),
  };
}

export async function saveAgentSecrets(input: {
  geminiApiKey?: string | null;
  internalCsApiKey?: string | null;
}) {
  const current = await ensureHydrated();
  const nextGemini =
    input.geminiApiKey === undefined
      ? current.geminiApiKey
      : String(input.geminiApiKey || '').trim();
  const nextInternal =
    input.internalCsApiKey === undefined
      ? current.internalCsApiKey
      : String(input.internalCsApiKey || '').trim();

  const encrypted = encryptJson({
    geminiApiKey: nextGemini,
    internalCsApiKey: nextInternal,
  });

  await prisma.appSetting.upsert({
    where: { key: SECRET_SETTING_KEY },
    create: { key: SECRET_SETTING_KEY, value: encrypted },
    update: { value: encrypted },
  });

  globalForSecrets.agentSecretsCache = {
    hydrated: true,
    geminiApiKey: nextGemini,
    internalCsApiKey: nextInternal,
  };

  return getAgentKeyStatus();
}
