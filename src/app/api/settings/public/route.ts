import { NextResponse } from 'next/server';
import { getWorkspaceSettings } from '@/lib/settings';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Safe subset of workspace settings readable by both ADMIN & OPERATOR
export async function GET() {
  try {
    const [settings, openIssuesCount] = await Promise.all([
      getWorkspaceSettings(),
      prisma.supportIssue.count({
        where: { status: { in: ['OPEN', 'IN_PROGRESS'] } },
      }),
    ]);
    return NextResponse.json({
      masterTags: settings.masterTags,
      guardrail: {
        maxDailyMessages: settings.guardrail.maxDailyMessages,
        minDelaySec: settings.guardrail.minDelaySec,
        maxRecipientsPerCampaign: settings.guardrail.maxRecipientsPerCampaign,
      },
      slaMinutes: settings.slaHours.slaMinutes,
      agentStatus: {
        masterSwitch: settings.agentConfig.masterSwitch,
        agentName: settings.agentConfig.agentName,
      },
      openIssuesCount,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
