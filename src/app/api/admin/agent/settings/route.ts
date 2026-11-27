import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceSettings, saveWorkspaceSettings } from '@/lib/settings';
import { getRequestUser } from '@/lib/session-user';
import { createLog } from '@/lib/logger';
import { hasGeminiApiKey } from '@/lib/agent/embeddings';
import { cancelAllDebouncedChats } from '@/lib/agent/debouncer';

export const dynamic = 'force-dynamic';

export async function GET() {
  const settings = await getWorkspaceSettings();
  return NextResponse.json({
    agentConfig: settings.agentConfig,
    geminiKeyConfigured: hasGeminiApiKey(),
    lapaqApiKeyConfigured: Boolean((process.env.INTERNAL_CS_API_KEY || '').trim()),
  });
}

export async function PATCH(req: NextRequest) {
  const user = await getRequestUser(req);
  if (user && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const updated = await saveWorkspaceSettings({
      agentConfig: body.agentConfig || body,
    });

    if (updated.agentConfig.masterSwitch === 'OFF') {
      cancelAllDebouncedChats();
    }

    await createLog(
      'AGENT',
      'SUCCESS',
      `Konfigurasi Agentic CS diperbarui oleh ${user?.name || 'Admin'} (mode: ${updated.agentConfig.masterSwitch})`,
      { masterSwitch: updated.agentConfig.masterSwitch, agentName: updated.agentConfig.agentName }
    );

    return NextResponse.json({
      ok: true,
      agentConfig: updated.agentConfig,
      geminiKeyConfigured: hasGeminiApiKey(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Gagal memperbarui pengaturan Agent' }, { status: 500 });
  }
}
