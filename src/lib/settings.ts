import { prisma } from './prisma';

export interface GuardrailSettings {
  maxDailyMessages: number;
  minDelaySec: number;
  maxRecipientsPerCampaign: number;
  circuitBreakerErrors: number;
}

export interface SlaHoursSettings {
  slaMinutes: number;
  assignMode: 'MANUAL' | 'ROUND_ROBIN';
  awayEnabled: boolean;
  workStart: string; // "08:00"
  workEnd: string;   // "17:00"
  awayMessage: string;
}

export type BotMasterSwitch = 'OFF' | 'ON_ALWAYS' | 'ON_OUTSIDE_HOURS';
export type LapaqConnectorMode = 'STANDALONE' | 'SANDBOX_API' | 'PRODUCTION_API';

export interface AgentConfigSettings {
  masterSwitch: BotMasterSwitch;
  agentName: string;
  debounceMs: number;
  maxDailyAiTurnsPerChat: number;
  primaryModel: string;
  fallbackProModel: string;
  liteModel: string;
  embeddingModel: string;
  lapaqConnectorMode: LapaqConnectorMode;
  lapaqInternalApiUrl: string;
  autoFollowupOnIssueResolved: boolean;
}

export interface WorkspaceSettings {
  guardrail: GuardrailSettings;
  slaHours: SlaHoursSettings;
  masterTags: string[];
  agentConfig: AgentConfigSettings;
}

export const DEFAULT_SETTINGS: WorkspaceSettings = {
  guardrail: {
    maxDailyMessages: 500,
    minDelaySec: 10,
    maxRecipientsPerCampaign: 150,
    circuitBreakerErrors: 5,
  },
  slaHours: {
    slaMinutes: 15,
    assignMode: 'MANUAL',
    awayEnabled: false,
    workStart: '08:00',
    workEnd: '17:00',
    awayMessage:
      'Halo Kak, terima kasih sudah menghubungi tim kami. Saat ini di luar jam operasional (08:00-17:00 WIB). Pesan Anda sudah kami catat dan akan segera kami balas di jam kerja berikutnya.',
  },
  masterTags: [
    'VIP',
    'Follow Up',
    'Aktif',
    'Onboarding',
    'Merchant Utama',
    'Perlu Verifikasi',
  ],
  agentConfig: {
    masterSwitch: 'OFF',
    agentName: 'Rani',
    debounceMs: 5000,
    maxDailyAiTurnsPerChat: 40,
    primaryModel: 'gemini-3.8-flash',
    fallbackProModel: 'gemini-4-argon',
    liteModel: 'gemini-3.5-flash-lite',
    embeddingModel: 'gemini-embedding-2',
    lapaqConnectorMode: 'STANDALONE',
    lapaqInternalApiUrl: '',
    autoFollowupOnIssueResolved: false,
  },
};

const DEPRECATED_MODEL_MIGRATIONS: Record<string, string> = {
  'gemini-2.5-flash': 'gemini-3.8-flash',
  'gemini-2.0-flash': 'gemini-3.8-flash',
  'gemini-2.5-pro': 'gemini-4-argon',
  'gemini-1.5-pro': 'gemini-4-argon',
  'gemini-2.5-flash-lite': 'gemini-3.5-flash-lite',
  'gemini-2.0-flash-lite': 'gemini-3.5-flash-lite',
};

function normalizeActiveModelId(modelId: unknown, fallback: string): string {
  const clean = String(modelId || '').trim();
  if (!clean) return fallback;
  return DEPRECATED_MODEL_MIGRATIONS[clean] || clean;
}

export async function getWorkspaceSettings(): Promise<WorkspaceSettings> {
  try {
    const rows = await prisma.appSetting.findMany();
    const map = new Map<string, any>();
    for (const r of rows) {
      try {
        map.set(r.key, JSON.parse(r.value));
      } catch {
        // ignore malformed setting
      }
    }

    return {
      guardrail: {
        ...DEFAULT_SETTINGS.guardrail,
        ...(map.get('guardrail') || {}),
      },
      slaHours: {
        ...DEFAULT_SETTINGS.slaHours,
        ...(map.get('sla_hours') || {}),
      },
      masterTags: Array.isArray(map.get('master_tags'))
        ? map.get('master_tags')
        : DEFAULT_SETTINGS.masterTags,
      agentConfig: (() => {
        const stored = map.get('agent_config') || {};
        return {
          ...DEFAULT_SETTINGS.agentConfig,
          ...stored,
          primaryModel: normalizeActiveModelId(
            stored.primaryModel,
            DEFAULT_SETTINGS.agentConfig.primaryModel
          ),
          fallbackProModel: normalizeActiveModelId(
            stored.fallbackProModel,
            DEFAULT_SETTINGS.agentConfig.fallbackProModel
          ),
          liteModel: normalizeActiveModelId(
            stored.liteModel,
            DEFAULT_SETTINGS.agentConfig.liteModel
          ),
          embeddingModel: normalizeActiveModelId(
            stored.embeddingModel,
            DEFAULT_SETTINGS.agentConfig.embeddingModel
          ),
        };
      })(),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveWorkspaceSettings(partial: Partial<WorkspaceSettings>) {
  const updates: Array<Promise<any>> = [];

  if (partial.guardrail) {
    const clean: GuardrailSettings = {
      maxDailyMessages: Math.max(10, Math.min(10000, Number(partial.guardrail.maxDailyMessages) || 500)),
      minDelaySec: Math.max(3, Math.min(300, Number(partial.guardrail.minDelaySec) || 10)),
      maxRecipientsPerCampaign: Math.max(1, Math.min(2000, Number(partial.guardrail.maxRecipientsPerCampaign) || 150)),
      circuitBreakerErrors: Math.max(1, Math.min(50, Number(partial.guardrail.circuitBreakerErrors) || 5)),
    };
    updates.push(
      prisma.appSetting.upsert({
        where: { key: 'guardrail' },
        create: { key: 'guardrail', value: JSON.stringify(clean) },
        update: { value: JSON.stringify(clean) },
      })
    );
  }

  if (partial.slaHours) {
    const clean: SlaHoursSettings = {
      slaMinutes: Math.max(1, Math.min(1440, Number(partial.slaHours.slaMinutes) || 15)),
      assignMode: partial.slaHours.assignMode === 'ROUND_ROBIN' ? 'ROUND_ROBIN' : 'MANUAL',
      awayEnabled: Boolean(partial.slaHours.awayEnabled),
      workStart: /^\d{2}:\d{2}$/.test(partial.slaHours.workStart || '') ? partial.slaHours.workStart : '08:00',
      workEnd: /^\d{2}:\d{2}$/.test(partial.slaHours.workEnd || '') ? partial.slaHours.workEnd : '17:00',
      awayMessage: String(partial.slaHours.awayMessage || DEFAULT_SETTINGS.slaHours.awayMessage).trim(),
    };
    updates.push(
      prisma.appSetting.upsert({
        where: { key: 'sla_hours' },
        create: { key: 'sla_hours', value: JSON.stringify(clean) },
        update: { value: JSON.stringify(clean) },
      })
    );
  }

  if (Array.isArray(partial.masterTags)) {
    const cleanTags = Array.from(
      new Set(partial.masterTags.map((t) => String(t).trim()).filter(Boolean))
    );
    updates.push(
      prisma.appSetting.upsert({
        where: { key: 'master_tags' },
        create: { key: 'master_tags', value: JSON.stringify(cleanTags) },
        update: { value: JSON.stringify(cleanTags) },
      })
    );
  }

  if (partial.agentConfig) {
    const current = (await getWorkspaceSettings()).agentConfig;
    const raw = { ...current, ...partial.agentConfig };
    const validSwitches: BotMasterSwitch[] = ['OFF', 'ON_ALWAYS', 'ON_OUTSIDE_HOURS'];
    const validModes: LapaqConnectorMode[] = ['STANDALONE', 'SANDBOX_API', 'PRODUCTION_API'];

    const cleanAgent: AgentConfigSettings = {
      masterSwitch: validSwitches.includes(raw.masterSwitch) ? raw.masterSwitch : 'OFF',
      agentName: String(raw.agentName || 'Rani').trim().slice(0, 40) || 'Rani',
      debounceMs: Math.max(1000, Math.min(20000, Number(raw.debounceMs) || 5000)),
      maxDailyAiTurnsPerChat: Math.max(5, Math.min(500, Number(raw.maxDailyAiTurnsPerChat) || 40)),
      primaryModel: normalizeActiveModelId(raw.primaryModel, 'gemini-3.8-flash'),
      fallbackProModel: normalizeActiveModelId(raw.fallbackProModel, 'gemini-4-argon'),
      liteModel: normalizeActiveModelId(raw.liteModel, 'gemini-3.5-flash-lite'),
      embeddingModel: normalizeActiveModelId(raw.embeddingModel, 'gemini-embedding-2'),
      lapaqConnectorMode: validModes.includes(raw.lapaqConnectorMode) ? raw.lapaqConnectorMode : 'STANDALONE',
      lapaqInternalApiUrl: String(raw.lapaqInternalApiUrl || '').trim(),
      autoFollowupOnIssueResolved: Boolean(raw.autoFollowupOnIssueResolved),
    };
    updates.push(
      prisma.appSetting.upsert({
        where: { key: 'agent_config' },
        create: { key: 'agent_config', value: JSON.stringify(cleanAgent) },
        update: { value: JSON.stringify(cleanAgent) },
      })
    );
  }

  await Promise.all(updates);
  return getWorkspaceSettings();
}

/**
 * Evaluate whether `now` (in Asia/Jakarta WIB, UTC+7) is outside [workStart, workEnd].
 */
export function isOutsideWorkingHours(
  now: Date,
  workStart: string,
  workEnd: string
): boolean {
  // Convert to WIB (UTC+7)
  const wibMs = now.getTime() + 7 * 60 * 60 * 1000;
  const wibDate = new Date(wibMs);
  const currentMinutes = wibDate.getUTCHours() * 60 + wibDate.getUTCMinutes();

  const [sh, sm] = workStart.split(':').map(Number);
  const [eh, em] = workEnd.split(':').map(Number);
  if (Number.isNaN(sh) || Number.isNaN(eh)) return false;

  const startMin = sh * 60 + (sm || 0);
  const endMin = eh * 60 + (em || 0);

  if (startMin <= endMin) {
    return currentMinutes < startMin || currentMinutes >= endMin;
  }
  return currentMinutes >= endMin && currentMinutes < startMin;
}

/**
 * Interpolate template placeholders like {nama}, {nama_toko}, {kategori}
 */
export function interpolateTemplate(
  text: string,
  vars: { name?: string | null; storeName?: string | null; category?: string | null }
): string {
  const firstName = (vars.name || 'Kak').trim().split(/\s+/)[0] || 'Kak';
  const storeName = (vars.storeName || vars.name || 'Toko Anda').trim();
  const category = (vars.category || 'Merchant').trim();

  return text
    .replace(/\{nama\}/gi, firstName)
    .replace(/\{nama_toko\}/gi, storeName)
    .replace(/\{kategori\}/gi, category);
}
