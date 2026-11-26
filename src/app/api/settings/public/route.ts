import { NextResponse } from 'next/server';
import { getWorkspaceSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

// Safe subset of workspace settings readable by both ADMIN & OPERATOR
export async function GET() {
  try {
    const settings = await getWorkspaceSettings();
    return NextResponse.json({
      masterTags: settings.masterTags,
      guardrail: {
        maxDailyMessages: settings.guardrail.maxDailyMessages,
        minDelaySec: settings.guardrail.minDelaySec,
        maxRecipientsPerCampaign: settings.guardrail.maxRecipientsPerCampaign,
      },
      slaMinutes: settings.slaHours.slaMinutes,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
