import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceSettings, saveWorkspaceSettings } from '@/lib/settings';
import { getRequestUser } from '@/lib/session-user';
import { createLog } from '@/lib/logger';
import { embedText768 } from '@/lib/agent/embeddings';
import { getAgentKeyStatus, saveAgentSecrets } from '@/lib/agent/secrets';
import { cancelAllDebouncedChats } from '@/lib/agent/debouncer';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [settings, keyStatus] = await Promise.all([
    getWorkspaceSettings(),
    getAgentKeyStatus(),
  ]);
  return NextResponse.json({
    agentConfig: settings.agentConfig,
    ...keyStatus,
  });
}

export async function PATCH(req: NextRequest) {
  const user = await getRequestUser(req);
  if (user && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json();

    // Handle optional encrypted API key updates without ever logging raw keys
    const hasSecretUpdate =
      body.geminiApiKey !== undefined ||
      body.clearGeminiKey === true ||
      body.internalCsApiKey !== undefined ||
      body.clearInternalCsKey === true;

    if (hasSecretUpdate) {
      await saveAgentSecrets({
        geminiApiKey:
          body.clearGeminiKey === true
            ? ''
            : body.geminiApiKey !== undefined
            ? String(body.geminiApiKey)
            : undefined,
        internalCsApiKey:
          body.clearInternalCsKey === true
            ? ''
            : body.internalCsApiKey !== undefined
            ? String(body.internalCsApiKey)
            : undefined,
      });

      await createLog(
        'AGENT',
        'SUCCESS',
        `Kunci kredensial Agentic CS diperbarui oleh ${user?.name || 'Admin'}`
      );
    }

    const configPayload = body.agentConfig || (
      body.masterSwitch !== undefined ||
      body.agentName !== undefined ||
      body.primaryModel !== undefined
        ? body
        : null
    );

    const updated = configPayload
      ? await saveWorkspaceSettings({ agentConfig: configPayload })
      : await getWorkspaceSettings();

    if (updated.agentConfig.masterSwitch === 'OFF') {
      cancelAllDebouncedChats();
    }

    if (configPayload) {
      await createLog(
        'AGENT',
        'SUCCESS',
        `Konfigurasi Agentic CS diperbarui oleh ${user?.name || 'Admin'} (mode: ${updated.agentConfig.masterSwitch})`,
        { masterSwitch: updated.agentConfig.masterSwitch, agentName: updated.agentConfig.agentName }
      );
    }

    const keyStatus = await getAgentKeyStatus();
    return NextResponse.json({
      ok: true,
      agentConfig: updated.agentConfig,
      ...keyStatus,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Gagal memperbarui pengaturan Agent' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (user && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const candidateKey =
      typeof body.geminiApiKey === 'string' && body.geminiApiKey.trim()
        ? body.geminiApiKey.trim()
        : undefined;

    const vec = await embedText768('Tes verifikasi kunci Google Gemini API Lapaq', candidateKey);
    if (!vec || vec.length !== 768) {
      return NextResponse.json(
        { error: 'Kunci API Gemini belum diisi atau tidak valid.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      dimensions: vec.length,
      message: 'Koneksi Google Gemini API berhasil diverifikasi (Embedding 768d aktif)!',
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: `Koneksi Gemini gagal: ${err?.message || 'Periksa kembali API Key Anda'}`,
      },
      { status: 400 }
    );
  }
}
