import { Type, type FunctionDeclaration } from '@google/genai';
import { prisma } from '@/lib/prisma';
import { createLog } from '@/lib/logger';
import { searchCaseMemory, searchKnowledgeBase } from './knowledge-indexer';
import { fetchMerchantDiagnostic, fetchPlatformCatalog } from './lapaq-bridge';
import { sanitizeKnowledgeText } from './knowledge-sanitizer';

export const AGENT_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'search_case_memory',
    description:
      'Mencari di Memori Kasus (CaseMemory) apakah keluhan atau gejala error serupa pernah dialami merchant lain dan sudah memiliki cara penyelesaian terverifikasi dari tim teknis.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        symptom_query: {
          type: Type.STRING,
          description: 'Deskripsi gejala kendala user, misal "upload gambar produk tapi gagal simpan".',
        },
      },
      required: ['symptom_query'],
    },
  },
  {
    name: 'search_lapaq_knowledge',
    description:
      'Mencari panduan langkah demi langkah penggunaan fitur Lapaq, letak tombol/elemen UI di layar dashboard, daftar add-on, aturan validasi form, dan kebijakan resmi Lapaq.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: 'Kata kunci fitur atau pertanyaan seputar Lapaq, misal "konfigurasi stok minimum addon limit stok".',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'inspect_merchant_lapaq_state',
    description:
      'Mengecek status diagnostik toko merchant di Lapaq (status onboarding, jumlah kategori & produk aktif/draft, status add-on seperti limit stok, kesiapan kurir/pembayaran) serta katalog paket/add-on.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        store_slug_or_name: {
          type: Type.STRING,
          description: 'Opsional: slug atau nama toko yang disebutkan user jika ingin mengecek toko tertentu.',
        },
        include_platform_catalog: {
          type: Type.BOOLEAN,
          description: 'Set true jika user menanyakan daftar harga paket langganan, harga add-on, atau ketentuan penarikan.',
        },
      },
    },
  },
  {
    name: 'update_step_guide',
    description:
      'Mencatat progres saat memandu seller secara bertahap satu langkah demi satu langkah (Step-by-Step Guide), atau menandai selesai ketika seluruh langkah tuntas.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        tutorial_slug: {
          type: Type.STRING,
          description: 'Slug fitur/panduan yang sedang dipandu, misal "low-stock-alerts" atau "tambah-produk-pertama".',
        },
        title: {
          type: Type.STRING,
          description: 'Judul singkat panduan.',
        },
        current_step: {
          type: Type.INTEGER,
          description: 'Nomor langkah saat ini yang sedang diberikan ke user (mulai dari 1).',
        },
        total_steps: {
          type: Type.INTEGER,
          description: 'Perkiraan total langkah panduan.',
        },
        completed: {
          type: Type.BOOLEAN,
          description: 'Set true jika panduan bertahap sudah selesai sehingga mode chat kembali normal.',
        },
      },
      required: ['tutorial_slug', 'title', 'current_step', 'completed'],
    },
  },
  {
    name: 'create_escalation_issue',
    description:
      'Mencatat masalah yang tidak dapat diselesaikan langsung oleh Agent (setelah langkah standar gagal atau tidak ada datanya) ATAU mencatat pengajuan refund/pembatalan untuk diteruskan ke Admin & Divisi Teknis.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        category: {
          type: Type.STRING,
          description: 'Pilih salah satu: TECHNICAL_BUG, UPLOAD_SAVE_ERROR, PAYMENT_WALLET, REFUND_REQUEST, atau OTHER.',
        },
        title: {
          type: Type.STRING,
          description: 'Judul singkat kendala untuk dibaca Admin.',
        },
        symptom_summary: {
          type: Type.STRING,
          description: 'Ringkasan jelas gejala masalah yang dialami merchant.',
        },
        steps_tried: {
          type: Type.STRING,
          description: 'Langkah pemeriksaan yang sudah sempat dicoba bersama merchant.',
        },
        followup_consent: {
          type: Type.BOOLEAN,
          description: 'True jika merchant sudah menyatakan setuju dihubungi kembali saat masalah selesai.',
        },
      },
      required: ['category', 'title', 'symptom_summary'],
    },
  },
];

export interface ToolExecutionContext {
  chatId: string;
  contactId: string | null;
  verifiedSenderPhone: string;
  recentScreenshotUrls: string[];
}

async function generateNextIssueCode(): Promise<string> {
  const latest = await prisma.supportIssue.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { code: true },
  });

  if (latest?.code) {
    const match = latest.code.match(/ISS-(\d+)/);
    if (match) {
      const nextNum = Number(match[1]) + 1;
      return `ISS-${String(nextNum).padStart(4, '0')}`;
    }
  }
  const total = await prisma.supportIssue.count();
  return `ISS-${String(total + 1).padStart(4, '0')}`;
}

/**
 * Executes a tool call invoked by Gemini with strict server-side identity & data-isolation enforcement.
 */
export async function executeAgentToolCall(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<Record<string, unknown>> {
  switch (toolName) {
    case 'search_case_memory': {
      const query = String(args.symptom_query || '').trim();
      const hits = await searchCaseMemory(query, 3);
      if (hits.length > 0) {
        // Increment hitCount asynchronously on top matched case
        prisma.caseMemory
          .update({
            where: { id: hits[0].id },
            data: { hitCount: { increment: 1 } },
          })
          .catch(() => null);
      }
      return {
        foundCount: hits.length,
        cases: hits.map((c) => ({
          title: c.title,
          symptomPattern: c.symptomPattern,
          rootCause: c.rootCause,
          verifiedSolution: c.verifiedSolution,
        })),
      };
    }

    case 'search_lapaq_knowledge': {
      const query = String(args.query || '').trim();
      const chunks = await searchKnowledgeBase(query, 5);
      return {
        foundCount: chunks.length,
        items: chunks.map((ch) => ({
          sourceType: ch.sourceType,
          sourceKey: ch.sourceKey,
          title: ch.title,
          category: ch.category,
          content: ch.content,
          helpUrl:
            ch.structuredMeta && typeof ch.structuredMeta.helpUrl === 'string'
              ? ch.structuredMeta.helpUrl
              : undefined,
        })),
      };
    }

    case 'inspect_merchant_lapaq_state': {
      const slugOrName = args.store_slug_or_name ? String(args.store_slug_or_name) : null;
      // CRITICAL SECURITY: Always pass ctx.verifiedSenderPhone from WAHA JID, never from LLM arguments!
      const diagnostic = await fetchMerchantDiagnostic(ctx.verifiedSenderPhone, slugOrName);
      const catalog = args.include_platform_catalog ? await fetchPlatformCatalog() : undefined;

      // Update cached non-secret fields on Contact if verified owner
      if (ctx.contactId && diagnostic.callerAccessLevel === 'VERIFIED_OWNER' && diagnostic.storeExists) {
        await prisma.contact
          .update({
            where: { id: ctx.contactId },
            data: {
              lapaqStoreSlug: diagnostic.storeSlug || undefined,
              onboardingStage: diagnostic.onboardingStage || undefined,
              productCount: diagnostic.activeProductCount ?? undefined,
              installedAddOnsJson: diagnostic.installedAddOns
                ? JSON.stringify(diagnostic.installedAddOns)
                : undefined,
              lastLapaqSyncAt: new Date(),
            },
          })
          .catch(() => null);
      }

      return {
        diagnostic,
        ...(catalog ? { platformCatalog: catalog } : {}),
      };
    }

    case 'update_step_guide': {
      const completed = Boolean(args.completed);
      const stateObj = completed
        ? null
        : {
            slug: String(args.tutorial_slug || 'panduan'),
            title: sanitizeKnowledgeText(String(args.title || 'Panduan Fitur')),
            currentStep: Math.max(1, Number(args.current_step || 1)),
            totalSteps: args.total_steps ? Number(args.total_steps) : undefined,
            updatedAt: new Date().toISOString(),
          };

      await prisma.chat.update({
        where: { id: ctx.chatId },
        data: {
          agentMode: completed ? 'AI_ACTIVE' : 'STEP_BY_STEP',
          activeGuideState: stateObj ? JSON.stringify(stateObj) : null,
        },
      });

      return {
        ok: true,
        agentMode: completed ? 'AI_ACTIVE' : 'STEP_BY_STEP',
        activeGuideState: stateObj,
      };
    }

    case 'create_escalation_issue': {
      const validCategories = new Set([
        'TECHNICAL_BUG',
        'UPLOAD_SAVE_ERROR',
        'PAYMENT_WALLET',
        'REFUND_REQUEST',
        'OTHER',
      ]);
      const rawCat = String(args.category || 'TECHNICAL_BUG').toUpperCase();
      const category = validCategories.has(rawCat) ? rawCat : 'OTHER';
      const title = sanitizeKnowledgeText(String(args.title || 'Kendala Seller Lapaq')).slice(0, 160);
      const symptomSummary = sanitizeKnowledgeText(
        String(args.symptom_summary || 'Perlu pemeriksaan lebih lanjut oleh tim teknis.')
      ).slice(0, 2000);
      const stepsTried = args.steps_tried
        ? sanitizeKnowledgeText(String(args.steps_tried)).slice(0, 1500)
        : null;
      const followupConsent = Boolean(args.followup_consent);

      // Avoid creating duplicate OPEN issues for the exact same chat within 10 minutes
      const existingRecent = await prisma.supportIssue.findFirst({
        where: {
          chatId: ctx.chatId,
          status: { in: ['OPEN', 'IN_PROGRESS'] },
          createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) },
        },
      });

      if (existingRecent) {
        const updated = await prisma.supportIssue.update({
          where: { id: existingRecent.id },
          data: {
            symptomSummary,
            stepsTried: stepsTried || existingRecent.stepsTried,
            followupConsent: followupConsent || existingRecent.followupConsent,
            screenshotUrls:
              ctx.recentScreenshotUrls.length > 0
                ? JSON.stringify(ctx.recentScreenshotUrls)
                : existingRecent.screenshotUrls,
          },
        });
        await prisma.chat.update({
          where: { id: ctx.chatId },
          data: { agentMode: 'WAITING_TECH', status: 'FOLLOW_UP' },
        });
        return {
          ok: true,
          issueCode: updated.code,
          status: updated.status,
          alreadyOpen: true,
        };
      }

      const code = await generateNextIssueCode();
      const created = await prisma.supportIssue.create({
        data: {
          code,
          chatId: ctx.chatId,
          contactId: ctx.contactId,
          category,
          title,
          symptomSummary,
          stepsTried,
          screenshotUrls:
            ctx.recentScreenshotUrls.length > 0
              ? JSON.stringify(ctx.recentScreenshotUrls)
              : null,
          status: 'OPEN',
          followupConsent,
        },
      });

      await prisma.chat.update({
        where: { id: ctx.chatId },
        data: {
          agentMode: 'WAITING_TECH',
          status: 'FOLLOW_UP',
          activeGuideState: null,
        },
      });

      await createLog(
        'AGENT',
        'WARNING',
        `Tiket eskalasi baru [${created.code}] dibuat untuk ${ctx.chatId}: ${created.title}`,
        { issueId: created.id, code: created.code, category, chatId: ctx.chatId }
      );

      return {
        ok: true,
        issueCode: created.code,
        status: created.status,
        noteForAgent:
          'Tiket berhasil dicatat untuk Admin/Divisi Teknis. Beritahu user dengan empati dan tanyakan apakah boleh dihubungi kembali saat masalah sudah selesai ditangani.',
      };
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}
