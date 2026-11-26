import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceSettings, saveWorkspaceSettings } from '@/lib/settings';
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
