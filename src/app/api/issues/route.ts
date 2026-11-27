import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestUser } from '@/lib/session-user';
import { sanitizeKnowledgeText } from '@/lib/agent/knowledge-sanitizer';
import { createLog } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status') || '';
    const category = url.searchParams.get('category') || '';
    const chatId = url.searchParams.get('chatId') || '';

    const where: any = {};
    if (status && ['OPEN', 'IN_PROGRESS', 'RESOLVED'].includes(status)) {
      where.status = status;
    }
    if (category) {
      where.category = category;
    }
    if (chatId) {
      where.chatId = chatId;
    }

    const issues = await prisma.supportIssue.findMany({
      where,
      include: {
        contact: {
          select: {
            id: true,
            name: true,
            phone: true,
            storeName: true,
            lapaqStoreSlug: true,
            businessCategory: true,
          },
        },
        chat: {
          select: {
            id: true,
            name: true,
            agentMode: true,
            status: true,
          },
        },
        resolvedBy: {
          select: { id: true, name: true, username: true },
        },
        caseMemory: {
          select: { id: true, applicability: true, hitCount: true, isActive: true },
        },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });

    const [openCount, inProgressCount, resolvedCount, caseMemoryCount] = await Promise.all([
      prisma.supportIssue.count({ where: { status: 'OPEN' } }),
      prisma.supportIssue.count({ where: { status: 'IN_PROGRESS' } }),
      prisma.supportIssue.count({ where: { status: 'RESOLVED' } }),
      prisma.caseMemory.count({ where: { isActive: true } }),
    ]);

    return NextResponse.json({
      issues,
      counts: {
        OPEN: openCount,
        IN_PROGRESS: inProgressCount,
        RESOLVED: resolvedCount,
        caseMemoryCount,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Gagal memuat daftar isu' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    const body = await req.json();
    const id = String(body.id || '');
    if (!id) {
      return NextResponse.json({ error: 'ID tiket wajib diisi' }, { status: 400 });
    }

    const data: any = {};
    if (body.status && ['OPEN', 'IN_PROGRESS'].includes(body.status)) {
      data.status = body.status;
    }
    if (body.techResolutionNote !== undefined) {
      data.techResolutionNote = sanitizeKnowledgeText(String(body.techResolutionNote || ''));
    }

    const updated = await prisma.supportIssue.update({
      where: { id },
      data,
    });

    await createLog(
      'AGENT',
      'SUCCESS',
      `Tiket [${updated.code}] diperbarui ke ${updated.status} oleh ${user?.name || 'Admin'}`,
      { issueId: updated.id, status: updated.status }
    );

    return NextResponse.json({ ok: true, issue: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Gagal memperbarui tiket' }, { status: 500 });
  }
}
