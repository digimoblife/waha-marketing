import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestUser } from '@/lib/session-user';
import { getWorkspaceSettings } from '@/lib/settings';
import { createLog } from '@/lib/logger';
import {
  containsForbiddenInternalTerm,
  sanitizeKnowledgeText,
} from '@/lib/agent/knowledge-sanitizer';
import { embedText768, formatPgVectorLiteral, hasGeminiApiKey } from '@/lib/agent/embeddings';
import { sendIssueResolvedFollowup } from '@/lib/agent/orchestrator';

export const dynamic = 'force-dynamic';

/**
 * Human-Gated Resolution & CaseMemory Promotion Endpoint:
 * Marks a SupportIssue as RESOLVED, optionally promotes the verified fix into CaseMemory (with pgvector embedding),
 * and optionally triggers the AI Agent to send a proactive WhatsApp update to the merchant.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getRequestUser(req);
  if (user && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden: Hanya Admin yang dapat menyelesaikan tiket' }, { status: 403 });
  }

  try {
    const issueId = params.id;
    const existing = await prisma.supportIssue.findUnique({
      where: { id: issueId },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Tiket tidak ditemukan' }, { status: 404 });
    }

    const body = await req.json();
    const techResolutionNote = sanitizeKnowledgeText(
      String(body.techResolutionNote || '')
    ).slice(0, 3000);
    const publicUserSolution = sanitizeKnowledgeText(
      String(body.publicUserSolution || techResolutionNote || '')
    ).slice(0, 2000);

    if (!publicUserSolution) {
      return NextResponse.json(
        { error: 'Keterangan penyelesaian wajib diisi' },
        { status: 400 }
      );
    }

    if (containsForbiddenInternalTerm(publicUserSolution)) {
      return NextResponse.json(
        { error: 'Solusi publik masih memuat istilah internal terlarang' },
        { status: 400 }
      );
    }

    const promoteToCaseMemory = Boolean(body.isReusableCase);
    const applicability =
      body.applicability === 'TEMPORARY_INCIDENT' ? 'TEMPORARY_INCIDENT' : 'PERMANENT';

    const resolvedIssue = await prisma.supportIssue.update({
      where: { id: issueId },
      data: {
        status: 'RESOLVED',
        techResolutionNote: techResolutionNote || publicUserSolution,
        publicUserSolution,
        isReusableCase: promoteToCaseMemory,
        resolvedById: user?.id || null,
        resolvedAt: new Date(),
      },
    });

    let promotedCaseMemoryId: string | null = null;

    if (promoteToCaseMemory) {
      const cleanRootCause = techResolutionNote || 'Penyebab terverifikasi oleh tim teknis';
      const savedMem = await prisma.caseMemory.upsert({
        where: { issueId: resolvedIssue.id },
        create: {
          issueId: resolvedIssue.id,
          title: sanitizeKnowledgeText(resolvedIssue.title),
          symptomPattern: sanitizeKnowledgeText(resolvedIssue.symptomSummary),
          rootCause: cleanRootCause,
          verifiedSolution: publicUserSolution,
          applicability,
          isActive: true,
        },
        update: {
          title: sanitizeKnowledgeText(resolvedIssue.title),
          symptomPattern: sanitizeKnowledgeText(resolvedIssue.symptomSummary),
          rootCause: cleanRootCause,
          verifiedSolution: publicUserSolution,
          applicability,
          isActive: true,
        },
      });
      promotedCaseMemoryId = savedMem.id;

      if (hasGeminiApiKey()) {
        try {
          const vec = await embedText768(
            `${savedMem.title}\nGejala: ${savedMem.symptomPattern}\nSolusi: ${savedMem.verifiedSolution}`
          );
          if (vec) {
            await prisma.$executeRawUnsafe(
              `UPDATE "CaseMemory" SET embedding = $1::vector WHERE id = $2`,
              formatPgVectorLiteral(vec),
              savedMem.id
            );
          }
        } catch (embErr) {
          console.warn('[ResolveIssue] Failed embedding CaseMemory, keyword fallback active:', embErr);
        }
      }
    } else {
      // If unchecked, deactivate any prior CaseMemory linked to this issue
      await prisma.caseMemory.updateMany({
        where: { issueId: resolvedIssue.id },
        data: { isActive: false },
      });
    }

    const settings = await getWorkspaceSettings();
    const shouldSendFollowup =
      body.sendFollowupNow === true ||
      (body.sendFollowupNow !== false &&
        settings.agentConfig.autoFollowupOnIssueResolved &&
        resolvedIssue.followupConsent);

    let followupResult: { ok: boolean; sentText?: string; error?: string } | null = null;
    if (shouldSendFollowup) {
      followupResult = await sendIssueResolvedFollowup(resolvedIssue.id);
    } else {
      await prisma.chat
        .update({
          where: { id: resolvedIssue.chatId },
          data: { agentMode: 'AI_ACTIVE' },
        })
        .catch(() => null);
    }

    await createLog(
      'AGENT',
      'SUCCESS',
      `Tiket [${resolvedIssue.code}] diselesaikan oleh ${user?.name || 'Admin'}${
        promoteToCaseMemory ? ' & disimpan ke CaseMemory' : ''
      }`,
      {
        issueId: resolvedIssue.id,
        code: resolvedIssue.code,
        promotedCaseMemoryId,
        followupSent: Boolean(followupResult?.ok),
      }
    );

    return NextResponse.json({
      ok: true,
      issue: resolvedIssue,
      promotedCaseMemoryId,
      followup: followupResult,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Gagal menyelesaikan tiket eskalasi' },
      { status: 500 }
    );
  }
}
