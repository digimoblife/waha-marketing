'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  LifeBuoy,
  Search,
  ExternalLink,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Sparkles,
  Loader2,
  X,
  Send,
  Image as ImageIcon,
} from 'lucide-react';
import { useWorkspace } from '@/components/WorkspaceContext';
import { formatDisplayPhone } from '@/lib/phone';
import Select from '@/components/ui/Select';

interface IssueItem {
  id: string;
  code: string;
  chatId: string;
  category: string;
  title: string;
  symptomSummary: string;
  stepsTried: string | null;
  screenshotUrls: string | null;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | string;
  followupConsent: boolean;
  followupSentAt: string | null;
  techResolutionNote: string | null;
  publicUserSolution: string | null;
  isReusableCase: boolean;
  createdAt: string;
  resolvedAt: string | null;
  contact?: {
    id: string;
    name: string | null;
    phone: string;
    storeName: string | null;
    lapaqStoreSlug: string | null;
    businessCategory: string | null;
  } | null;
  chat?: {
    id: string;
    name: string | null;
    agentMode: string;
    status: string;
  } | null;
  resolvedBy?: {
    id: string;
    name: string;
    username: string;
  } | null;
  caseMemory?: {
    id: string;
    applicability: string;
    hitCount: number;
    isActive: boolean;
  } | null;
}

const CATEGORY_META: Record<string, { label: string; cls: string }> = {
  UPLOAD_SAVE_ERROR: {
    label: 'Gagal Simpan / Upload',
    cls: 'bg-[#FEF5E4] text-[#8F5A05] border-[#F7D488]',
  },
  TECHNICAL_BUG: {
    label: 'Kendala Teknis',
    cls: 'bg-[#ECF6FA] text-[#00688E] border-[#A7D6E7]',
  },
  PAYMENT_WALLET: {
    label: 'Pembayaran & Dompet',
    cls: 'bg-[#FEF5E4] text-[#8F5A05] border-[#F7D488]',
  },
  REFUND_REQUEST: {
    label: 'Permintaan Refund',
    cls: 'bg-[#FDECEC] text-[#9E1F23] border-[#F7B4B6]',
  },
  OTHER: {
    label: 'Lainnya',
    cls: 'bg-[#E8EFF3] text-[#435A68] border-[#D1DEE5]',
  },
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  OPEN: {
    label: 'Baru (Open)',
    cls: 'bg-[#FDECEC] text-[#9E1F23] border-[#F7B4B6]',
  },
  IN_PROGRESS: {
    label: 'Sedang Dicek',
    cls: 'bg-[#FEF5E4] text-[#8F5A05] border-[#F7D488]',
  },
  RESOLVED: {
    label: 'Selesai',
    cls: 'bg-[#E7F8F1] text-[#0D6945] border-[#A7E7CB]',
  },
};

function parseScreenshotUrls(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((u): u is string => typeof u === 'string' && Boolean(u.trim()));
    }
  } catch {
    // ignore malformed json
  }
  return [];
}

export default function IssuesPage() {
  const { currentUser, refreshWorkspaceMeta, notify } = useWorkspace();
  const isAdmin = currentUser?.role === 'ADMIN';

  const [issues, setIssues] = useState<IssueItem[]>([]);
  const [counts, setCounts] = useState({
    OPEN: 0,
    IN_PROGRESS: 0,
    RESOLVED: 0,
    caseMemoryCount: 0,
  });
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // Active modal ticket state
  const [selectedIssue, setSelectedIssue] = useState<IssueItem | null>(null);
  const [techNote, setTechNote] = useState('');
  const [publicSolution, setPublicSolution] = useState('');
  const [promoteCaseMemory, setPromoteCaseMemory] = useState(false);
  const [applicability, setApplicability] = useState<'PERMANENT' | 'TEMPORARY_INCIDENT'>('PERMANENT');
  const [sendFollowupNow, setSendFollowupNow] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [updatingProgress, setUpdatingProgress] = useState(false);
  const [formError, setFormError] = useState('');

  const dialogRef = useRef<HTMLDialogElement>(null);

  const fetchIssues = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (categoryFilter !== 'ALL') params.set('category', categoryFilter);

      const res = await fetch(`/api/issues?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json();
      if (data.issues) setIssues(data.issues);
      if (data.counts) setCounts(data.counts);
    } catch {
      // ignore transient error
    } finally {
      setLoading(false);
    }
  }, [statusFilter, categoryFilter]);

  useEffect(() => {
    fetchIssues();
    const interval = setInterval(fetchIssues, 10000);
    return () => clearInterval(interval);
  }, [fetchIssues]);

  // Progressive enhancement fallback for browsers without native <dialog closedby="any"> (e.g. Safari)
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      dialog.returnValue = '';
      setSelectedIssue(null);
      setFormError('');
    };
    dialog.addEventListener('close', handleClose);

    let cleanupFallback: (() => void) | undefined;
    if (typeof HTMLDialogElement !== 'undefined' && !('closedBy' in HTMLDialogElement.prototype)) {
      const onDialogClick = (event: MouseEvent) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isDialogContent =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;
        if (isDialogContent) return;
        dialog.close();
      };
      dialog.addEventListener('click', onDialogClick);
      cleanupFallback = () => dialog.removeEventListener('click', onDialogClick);
    }

    return () => {
      dialog.removeEventListener('close', handleClose);
      cleanupFallback?.();
    };
  }, []);

  const openIssueModal = (issue: IssueItem) => {
    setSelectedIssue(issue);
    setTechNote(issue.techResolutionNote || '');
    setPublicSolution(issue.publicUserSolution || '');
    const isRefund = issue.category === 'REFUND_REQUEST';
    setPromoteCaseMemory(isRefund ? false : Boolean(issue.isReusableCase || issue.caseMemory?.isActive));
    setApplicability(
      issue.caseMemory?.applicability === 'TEMPORARY_INCIDENT' ? 'TEMPORARY_INCIDENT' : 'PERMANENT'
    );
    setSendFollowupNow(issue.status !== 'RESOLVED' && issue.followupConsent);
    setFormError('');

    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  };

  const handleMarkInProgress = async () => {
    if (!selectedIssue || updatingProgress) return;
    setUpdatingProgress(true);
    setFormError('');
    try {
      const res = await fetch('/api/issues', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedIssue.id,
          status: 'IN_PROGRESS',
          techResolutionNote: techNote,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memperbarui status tiket');
      notify(`Tiket ${selectedIssue.code} ditandai Sedang Dicek`);
      await fetchIssues();
      await refreshWorkspaceMeta();
      setSelectedIssue((prev) => (prev ? { ...prev, status: 'IN_PROGRESS' } : null));
    } catch (err: any) {
      setFormError(err.message || 'Gagal memperbarui tiket');
    } finally {
      setUpdatingProgress(false);
    }
  };

  const handleResolveIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIssue || submitting) return;
    if (!publicSolution.trim()) {
      setFormError('Solusi publik untuk merchant wajib diisi sebelum menyelesaikan tiket.');
      return;
    }

    setSubmitting(true);
    setFormError('');
    try {
      const res = await fetch(`/api/issues/${encodeURIComponent(selectedIssue.id)}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          techResolutionNote: techNote.trim(),
          publicUserSolution: publicSolution.trim(),
          isReusableCase: selectedIssue.category === 'REFUND_REQUEST' ? false : promoteCaseMemory,
          applicability,
          sendFollowupNow,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyelesaikan tiket');

      const followupInfo = data.followup?.ok
        ? ' & kabar WA terkirim ke merchant'
        : data.followup?.error
        ? ` (Info WA tertunda: ${data.followup.error})`
        : '';
      notify(`Tiket ${selectedIssue.code} selesai${followupInfo}`);
      dialogRef.current?.close();
      await fetchIssues();
      await refreshWorkspaceMeta();
    } catch (err: any) {
      setFormError(err.message || 'Gagal menyelesaikan tiket');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredIssues = issues.filter((item) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      item.code.toLowerCase().includes(q) ||
      item.title.toLowerCase().includes(q) ||
      item.symptomSummary.toLowerCase().includes(q) ||
      (item.contact?.storeName || '').toLowerCase().includes(q) ||
      (item.contact?.name || '').toLowerCase().includes(q) ||
      (item.contact?.phone || '').toLowerCase().includes(q)
    );
  });

  const modalScreenshots = parseScreenshotUrls(selectedIssue?.screenshotUrls);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto bg-[#F4F8FA]">
      {/* Page Header */}
      <header className="bg-white border-b border-[#D1DEE5] px-4 md:px-7 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-[17px] font-bold text-[#0F232E] tracking-tight">
            Tiket Eskalasi & Memori Kasus
          </h1>
          <p className="text-[12.5px] text-[#5C7685] mt-0.5">
            Pantau kendala teknis merchant dari Agentic CS, kirim kabar penyelesaian otomatis, dan kurasi solusi terverifikasi ke Memori Kasus.
          </p>
        </div>

        <Link
          href="/settings?tab=agent"
          className="self-start sm:self-auto h-8 px-3 bg-white hover:bg-[#ECF6FA] border border-[#B0C4CF] text-[#0F232E] text-xs font-semibold rounded-md inline-flex items-center gap-1.5"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#00688E]" />
          <span>Atur Agent & Pengetahuan</span>
        </Link>
      </header>

      <div className="p-4 md:p-7 max-w-[1280px] w-full mx-auto space-y-5">
        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="bg-white border border-[#D1DEE5] rounded-lg p-4 shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
            <div className="flex items-center justify-between text-xs font-semibold text-[#5C7685]">
              <span>Tiket Baru (Open)</span>
              <AlertTriangle className="w-4 h-4 text-[#9E1F23]" />
            </div>
            <div className="mt-2 text-2xl font-bold text-[#9E1F23] tabular-nums">{counts.OPEN}</div>
            <div className="text-[11px] text-[#809AA8] mt-0.5">Menunggu pengecekan tim teknis</div>
          </div>

          <div className="bg-white border border-[#D1DEE5] rounded-lg p-4 shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
            <div className="flex items-center justify-between text-xs font-semibold text-[#5C7685]">
              <span>Sedang Dicek</span>
              <Clock className="w-4 h-4 text-[#8F5A05]" />
            </div>
            <div className="mt-2 text-2xl font-bold text-[#8F5A05] tabular-nums">
              {counts.IN_PROGRESS}
            </div>
            <div className="text-[11px] text-[#809AA8] mt-0.5">Dalam penanganan tim internal</div>
          </div>

          <div className="bg-white border border-[#D1DEE5] rounded-lg p-4 shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
            <div className="flex items-center justify-between text-xs font-semibold text-[#5C7685]">
              <span>Tiket Selesai</span>
              <CheckCircle2 className="w-4 h-4 text-[#0D6945]" />
            </div>
            <div className="mt-2 text-2xl font-bold text-[#0D6945] tabular-nums">
              {counts.RESOLVED}
            </div>
            <div className="text-[11px] text-[#809AA8] mt-0.5">Telah dituntaskan oleh Admin</div>
          </div>

          <div className="bg-white border border-[#D1DEE5] rounded-lg p-4 shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
            <div className="flex items-center justify-between text-xs font-semibold text-[#5C7685]">
              <span>Memori Kasus Aktif</span>
              <Sparkles className="w-4 h-4 text-[#00688E]" />
            </div>
            <div className="mt-2 text-2xl font-bold text-[#00688E] tabular-nums">
              {counts.caseMemoryCount}
            </div>
            <div className="text-[11px] text-[#809AA8] mt-0.5">
              Solusi resmi yang diingat Agent AI
            </div>
          </div>
        </div>

        {/* Filter & Table Card */}
        <div className="bg-white border border-[#D1DEE5] rounded-lg shadow-[0_1px_2px_rgba(17,24,39,0.04)] overflow-hidden">
          <div className="p-3.5 border-b border-[#E8EFF3] flex flex-col md:flex-row md:items-center justify-between gap-2.5">
            <div className="relative flex-1 max-w-md">
              <Search className="w-3.5 h-3.5 text-[#809AA8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari kode ISS-xxxx, nama toko, nomor WA, atau gejala..."
                className="w-full h-8 pl-8 pr-3 border border-[#B0C4CF] rounded-md text-xs text-[#0F232E] placeholder-[#809AA8] focus:outline-none focus:border-[#00688E]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={statusFilter}
                onChange={(v) => setStatusFilter(v)}
                className="w-[152px] h-8 px-2.5 border border-[#B0C4CF] rounded-md text-xs bg-white"
              >
                <option value="ALL">Semua Status</option>
                <option value="OPEN">Baru (Open)</option>
                <option value="IN_PROGRESS">Sedang Dicek</option>
                <option value="RESOLVED">Selesai</option>
              </Select>

              <Select
                value={categoryFilter}
                onChange={(v) => setCategoryFilter(v)}
                className="w-[188px] h-8 px-2.5 border border-[#B0C4CF] rounded-md text-xs bg-white"
              >
                <option value="ALL">Semua Kategori</option>
                <option value="UPLOAD_SAVE_ERROR">Gagal Simpan / Upload</option>
                <option value="TECHNICAL_BUG">Kendala Teknis</option>
                <option value="PAYMENT_WALLET">Pembayaran & Dompet</option>
                <option value="REFUND_REQUEST">Permintaan Refund</option>
                <option value="OTHER">Lainnya</option>
              </Select>
            </div>
          </div>

          {loading ? (
            <div className="py-16 text-center text-xs text-[#809AA8]">
              <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
              Memuat tiket eskalasi...
            </div>
          ) : filteredIssues.length === 0 ? (
            <div className="py-16 px-4 text-center space-y-2">
              <LifeBuoy className="w-8 h-8 text-[#B0C4CF] mx-auto" />
              <div className="text-sm font-semibold text-[#0F232E]">
                Tidak ada tiket eskalasi ditemukan
              </div>
              <p className="text-xs text-[#5C7685] max-w-md mx-auto">
                Saat Agent AI menemukan kendala teknis yang gagal setelah panduan langkah demi langkah atau permintaan refund, tiket akan otomatis tercatat di halaman ini.
              </p>
            </div>
          ) : (
            <div
              tabIndex={0}
              role="region"
              aria-labelledby="issues-table-caption"
              className="issues-table-wrapper"
            >
              <table className="text-left text-xs">
                <caption id="issues-table-caption" className="sr-only">
                  Daftar tiket eskalasi teknis dan memori kasus Agentic CS Lapaq
                </caption>
                <thead>
                  <tr className="bg-[#F4F8FA] border-b border-[#D1DEE5] text-[10.5px] uppercase tracking-wider text-[#5C7685]">
                    <th scope="col" className="py-2.5 px-4 font-bold">
                      Kode & Waktu
                    </th>
                    <th scope="col" className="py-2.5 px-3 font-bold">
                      Kategori
                    </th>
                    <th scope="col" className="py-2.5 px-3 font-bold">
                      Merchant / Toko
                    </th>
                    <th scope="col" className="py-2.5 px-3 font-bold">
                      Ringkasan Kendala
                    </th>
                    <th scope="col" className="py-2.5 px-3 font-bold">
                      Status & Memori
                    </th>
                    <th scope="col" className="py-2.5 px-4 font-bold text-right">
                      Tindakan
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8EFF3]">
                  {filteredIssues.map((issue) => {
                    const cat = CATEGORY_META[issue.category] || CATEGORY_META.OTHER;
                    const st = STATUS_META[issue.status] || STATUS_META.OPEN;
                    const shots = parseScreenshotUrls(issue.screenshotUrls);
                    const storeDisplay =
                      issue.contact?.storeName ||
                      issue.contact?.name ||
                      issue.chat?.name ||
                      issue.chatId.replace(/@.+$/, '');
                    const phoneDisplay = issue.contact?.phone
                      ? formatDisplayPhone(issue.contact.phone)
                      : formatDisplayPhone(issue.chatId.replace(/@.+$/, ''));

                    return (
                      <tr key={issue.id} className="hover:bg-[#FAFBFB] align-top">
                        <th scope="row" className="py-3 px-4 font-mono whitespace-nowrap">
                          <div className="font-bold text-[#0F232E] text-[12px]">{issue.code}</div>
                          <div className="text-[10.5px] font-normal text-[#809AA8] tabular-nums mt-0.5">
                            {new Date(issue.createdAt).toLocaleString('id-ID', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </th>

                        <td className="py-3 px-3">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded border text-[10.5px] font-semibold whitespace-nowrap ${cat.cls}`}
                          >
                            {cat.label}
                          </span>
                        </td>

                        <td className="py-3 px-3">
                          <div className="font-semibold text-[#0F232E] text-[12.5px]">
                            {storeDisplay}
                          </div>
                          <div className="text-[11px] font-mono tabular-nums text-[#5C7685]">
                            {phoneDisplay}
                          </div>
                          <Link
                            href={`/inbox?jid=${encodeURIComponent(issue.chatId)}`}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#00688E] hover:underline mt-1"
                          >
                            <span>Buka Chat</span>
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        </td>

                        <td className="py-3 px-3 max-w-[340px]">
                          <div className="font-semibold text-[#0F232E] text-[12.5px]">
                            {issue.title}
                          </div>
                          <p className="text-[11.5px] text-[#435A68] mt-0.5 line-clamp-2 leading-relaxed">
                            {issue.symptomSummary}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            {issue.followupConsent && (
                              <span className="px-1.5 py-0.5 rounded bg-[#ECF6FA] border border-[#A7D6E7] text-[#00688E] text-[10px] font-semibold">
                                Minta Dikabari WA
                              </span>
                            )}
                            {shots.length > 0 && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#E8EFF3] text-[#435A68] text-[10px] font-semibold">
                                <ImageIcon className="w-3 h-3" />
                                {shots.length} foto bukti
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-3">
                          <div className="flex flex-col items-start gap-1">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded border text-[10.5px] font-semibold whitespace-nowrap ${st.cls}`}
                            >
                              {st.label}
                            </span>
                            {issue.caseMemory?.isActive && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#ECF6FA] border border-[#A7D6E7] text-[#00688E] text-[10px] font-semibold">
                                <Sparkles className="w-2.5 h-2.5" />
                                CaseMemory ({issue.caseMemory.hitCount}x)
                              </span>
                            )}
                            {issue.followupSentAt && (
                              <span className="text-[10px] text-[#0D6945] font-medium">
                                ✓ Kabar WA terkirim
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => openIssueModal(issue)}
                            className={`h-7 px-2.5 rounded-md text-xs font-semibold transition cursor-pointer ${
                              issue.status === 'RESOLVED'
                                ? 'bg-white border border-[#B0C4CF] hover:bg-[#F4F8FA] text-[#0F232E]'
                                : 'bg-[#00688E] hover:bg-[#005575] text-white'
                            }`}
                          >
                            {issue.status === 'RESOLVED' ? 'Detail & Memori' : 'Tindak Lanjut'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Native Modal Dialog for Issue Resolution & CaseMemory Promotion */}
      <dialog
        ref={dialogRef}
        closedby="any"
        aria-labelledby="resolve-dialog-title"
        className="w-[min(640px,calc(100vw-24px))] max-h-[88vh] p-0 rounded-xl border border-[#B0C4CF] bg-white text-[#0F232E] shadow-2xl overflow-hidden"
      >
        {selectedIssue && (
          <div className="flex flex-col max-h-[88vh]">
            <div className="px-5 py-3.5 border-b border-[#D1DEE5] flex items-center justify-between gap-3 bg-[#F4F8FA] shrink-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-white border border-[#D1DEE5] text-[#00688E]">
                    {selectedIssue.code}
                  </span>
                  <h1 id="resolve-dialog-title" className="text-[14.5px] font-bold truncate">
                    {selectedIssue.title}
                  </h1>
                </div>
                <div className="text-[11.5px] text-[#5C7685] mt-0.5">
                  Merchant:{' '}
                  <strong className="text-[#0F232E]">
                    {selectedIssue.contact?.storeName ||
                      selectedIssue.contact?.name ||
                      selectedIssue.chatId}
                  </strong>{' '}
                  •{' '}
                  <Link
                    href={`/inbox?jid=${encodeURIComponent(selectedIssue.chatId)}`}
                    className="text-[#00688E] font-semibold hover:underline"
                  >
                    Lihat Percakapan Lengkap →
                  </Link>
                </div>
              </div>

              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                aria-label="Tutup dialog tiket"
                className="p-1.5 rounded-md text-[#5C7685] hover:bg-[#E8EFF3] hover:text-[#0F232E] cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              {formError && (
                <div className="p-3 rounded-md bg-[#FDECEC] border border-[#F7B4B6] text-[#9E1F23] text-xs font-medium">
                  {formError}
                </div>
              )}

              {/* Diagnostic Summary */}
              <div className="p-3.5 rounded-lg bg-[#F4F8FA] border border-[#E8EFF3] space-y-2 text-xs">
                <div>
                  <span className="font-bold text-[#0F232E]">Gejala yang Dilaporkan:</span>
                  <p className="text-[#435A68] mt-0.5 whitespace-pre-wrap leading-relaxed">
                    {selectedIssue.symptomSummary}
                  </p>
                </div>

                {selectedIssue.stepsTried && (
                  <div className="pt-2 border-t border-[#E8EFF3]">
                    <span className="font-bold text-[#0F232E]">Langkah yang Sudah Dicoba:</span>
                    <p className="text-[#435A68] mt-0.5 whitespace-pre-wrap leading-relaxed">
                      {selectedIssue.stepsTried}
                    </p>
                  </div>
                )}

                {modalScreenshots.length > 0 && (
                  <div className="pt-2 border-t border-[#E8EFF3]">
                    <span className="font-bold text-[#0F232E] block mb-1.5">
                      Lampiran Screenshot Merchant:
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {modalScreenshots.map((url, idx) => (
                        <a
                          key={`${url}-${idx}`}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="block w-20 h-20 rounded-md overflow-hidden border border-[#B0C4CF] bg-white hover:opacity-90"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt={`Bukti kendala ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {selectedIssue.status === 'OPEN' && (
                <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-[#FEF5E4] border border-[#F7D488] text-xs">
                  <span className="text-[#8F5A05] font-medium">
                    Sedang menginvestigasi kendala ini bersama tim teknis?
                  </span>
                  <button
                    type="button"
                    disabled={updatingProgress}
                    onClick={handleMarkInProgress}
                    className="h-7 px-2.5 bg-white hover:bg-[#FAFBFB] border border-[#F7D488] text-[#8F5A05] font-semibold rounded-md shrink-0 cursor-pointer"
                  >
                    {updatingProgress ? 'Menyimpan...' : 'Tandai Sedang Dicek'}
                  </button>
                </div>
              )}

              {isAdmin ? (
                <form id="resolve-issue-form" onSubmit={handleResolveIssue} className="space-y-3.5">
                  <div>
                    <label
                      htmlFor="tech-resolution-note"
                      className="block text-xs font-semibold text-[#0F232E] mb-1"
                    >
                      Catatan Penyebab Teknis (Internal Admin)
                    </label>
                    <textarea
                      id="tech-resolution-note"
                      rows={2}
                      value={techNote}
                      onChange={(e) => setTechNote(e.target.value)}
                      placeholder="Misal: Validasi ukuran gambar di atas 2MB menolak format HEIC..."
                      className="w-full p-2.5 border border-[#B0C4CF] rounded-md text-xs focus:outline-none focus:border-[#00688E]"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="public-user-solution"
                      className="block text-xs font-semibold text-[#0F232E] mb-1"
                    >
                      Solusi Publik untuk Merchant (Wajib, Tanpa Nama Vendor Internal)
                    </label>
                    <textarea
                      id="public-user-solution"
                      autoFocus
                      rows={3}
                      value={publicSolution}
                      onChange={(e) => setPublicSolution(e.target.value)}
                      placeholder="Misal: Kendala simpan produk sudah kami perbaiki ya Kak. Pastikan foto berformat JPG/PNG maksimal 2 MB lalu silakan coba simpan kembali."
                      className="w-full p-2.5 border border-[#B0C4CF] rounded-md text-xs focus:outline-none focus:border-[#00688E]"
                    />
                  </div>

                  {/* CaseMemory Promotion Gate */}
                  <div className="p-3.5 rounded-lg border border-[#D1DEE5] bg-[#F4F8FA] space-y-2.5">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        disabled={selectedIssue.category === 'REFUND_REQUEST'}
                        checked={promoteCaseMemory}
                        onChange={(e) => setPromoteCaseMemory(e.target.checked)}
                        className="mt-0.5 w-4 h-4 shrink-0 cursor-pointer"
                      />
                      <div>
                        <div className="text-xs font-bold text-[#0F232E]">
                          Jadikan Memori Kasus Resmi (CaseMemory)
                        </div>
                        <p className="text-[11px] text-[#5C7685] leading-snug">
                          {selectedIssue.category === 'REFUND_REQUEST'
                            ? 'Tiket kategori Refund dikunci agar tidak menjadi memori lintas merchant.'
                            : 'Jika dicentang, Agent AI akan mengingat gejala & solusi ini untuk membantu merchant lain yang mengalami kendala serupa.'}
                        </p>
                      </div>
                    </label>

                    {promoteCaseMemory && selectedIssue.category !== 'REFUND_REQUEST' && (
                      <div className="pl-6 flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                        <span className="text-[11.5px] font-semibold text-[#435A68]">
                          Masa Berlaku Pengetahuan:
                        </span>
                        <Select
                          value={applicability}
                          onChange={(v) =>
                            setApplicability(v as 'PERMANENT' | 'TEMPORARY_INCIDENT')
                          }
                          className="w-full sm:w-[230px] h-8 px-2.5 border border-[#B0C4CF] rounded-md text-xs bg-white"
                        >
                          <option value="PERMANENT">Solusi Permanen (Panduan Tetap)</option>
                          <option value="TEMPORARY_INCIDENT">Insiden Sementara</option>
                        </Select>
                      </div>
                    )}
                  </div>

                  {/* Proactive Follow-up via Agent WA */}
                  <label className="flex items-start gap-2.5 p-3 rounded-lg border border-[#A7D6E7] bg-[#ECF6FA] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sendFollowupNow}
                      onChange={(e) => setSendFollowupNow(e.target.checked)}
                      className="mt-0.5 w-4 h-4 shrink-0 cursor-pointer"
                    />
                    <div>
                      <div className="text-xs font-bold text-[#0F232E]">
                        Kirim Kabar Penyelesaian via Agent WA Sekarang
                      </div>
                      <p className="text-[11px] text-[#435A68] leading-snug">
                        Agent menyapa merchant secara sopan di WhatsApp untuk mengabarkan bahwa kendala telah selesai ditangani
                        {selectedIssue.followupConsent ? ' (Merchant sudah setuju dikabari).' : '.'}
                      </p>
                    </div>
                  </label>
                </form>
              ) : (
                <div className="p-3 rounded-md bg-[#F4F8FA] border border-[#D1DEE5] text-xs text-[#5C7685]">
                  Penyelesaian tiket dan promosi ke Memori Kasus hanya dapat dieksekusi oleh akun berstatus <strong>ADMIN</strong>.
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-[#D1DEE5] bg-[#F4F8FA] flex items-center justify-end gap-2 shrink-0">
              <form method="dialog">
                <button
                  type="submit"
                  value="cancel"
                  className="h-8 px-3 bg-white hover:bg-[#E8EFF3] border border-[#B0C4CF] text-[#0F232E] text-xs font-semibold rounded-md cursor-pointer"
                >
                  Tutup
                </button>
              </form>

              {isAdmin && (
                <button
                  type="submit"
                  form="resolve-issue-form"
                  disabled={submitting}
                  className="h-8 px-3.5 bg-[#00688E] hover:bg-[#005575] disabled:opacity-50 text-white text-xs font-semibold rounded-md inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {submitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : sendFollowupNow ? (
                    <Send className="w-3.5 h-3.5" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {selectedIssue.status === 'RESOLVED'
                      ? 'Perbarui Resolusi & Memori'
                      : sendFollowupNow
                      ? 'Selesaikan & Kabari Merchant'
                      : 'Tandai Selesai'}
                  </span>
                </button>
              )}
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}
