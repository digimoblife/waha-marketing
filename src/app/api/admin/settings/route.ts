import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceSettings, saveWorkspaceSettings } from '@/lib/settings';
import { saveAgentSecrets } from '@/lib/agent/secrets';
import { createLog } from '@/lib/logger';
import { getRequestUser } from '@/lib/session-user';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const settings = await getWorkspaceSettings();
    return NextResponse.json({ settings });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.geminiApiKey !== undefined || body.internalCsApiKey !== undefined) {
      await saveAgentSecrets({
        geminiApiKey:
          typeof body.geminiApiKey === 'string' && body.geminiApiKey.trim()
            ? body.geminiApiKey.trim()
            : undefined,
        internalCsApiKey:
          typeof body.internalCsApiKey === 'string' && body.internalCsApiKey.trim()
            ? body.internalCsApiKey.trim()
            : undefined,
      });
    }
    const updated = await saveWorkspaceSettings(body);
    const user = await getRequestUser(req);

    await createLog(
      'AUTH',
      'SUCCESS',
      `Pengaturan sistem diperbarui oleh ${user?.name || 'Admin'}`
    );

    return NextResponse.json({ ok: true, settings: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
