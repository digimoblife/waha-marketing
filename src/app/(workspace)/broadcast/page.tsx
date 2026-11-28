'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Send, Pause, Play, XCircle, Loader2, Plus, AlertCircle, Download, Search, Bot, Sparkles } from 'lucide-react';
import { sanitizePhone, formatDisplayPhone } from '@/lib/phone';
import { interpolateTemplate } from '@/lib/template-utils';
import { useWorkspace } from '@/components/WorkspaceContext';
import Select from '@/components/ui/Select';

interface ManualRecipient {
  id: string;
  phone: string;
  name: string;
  storeName: string;
  businessCategory: string;
  isWAUser: boolean;
}

function BroadcastPageInner() {
  const searchParams = useSearchParams();
  const { notify, agentName } = useWorkspace();

  const [contacts, setContacts] = useState<any[]>([]);
  const [manualRecipients, setManualRecipients] = useState<ManualRecipient[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [templates, setTemplates] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [quota, setQuota] = useState({
    sentToday: 0,
    maxDailyMessages: 500,
    minDelaySec: 10,
    maxRecipientsPerCampaign: 150,
  });

  // Form state
  const [name, setName] = useState('Promo Merchant Aktif');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [waFilter, setWaFilter] = useState('ACTIVE');
  const [recipientSearch, setRecipientSearch] = useState('');
  const [manualPhoneInput, setManualPhoneInput] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [delayPreset, setDelayPreset] = useState<'safe' | 'extra' | 'fast'>('safe');
  const [enableAiFollowup, setEnableAiFollowup] = useState(false);
  const [campaignGoal, setCampaignGoal] = useState('');
  const [loadingPassive, setLoadingPassive] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Delivery report inspection state (selected campaign + per-number filter)
  const [inspectedCampaignId, setInspectedCampaignId] = useState<string | null>(null);
  const [deliveryStatusFilter, setDeliveryStatusFilter] = useState<'ALL' | 'SENT' | 'FAILED' | 'QUEUED'>('ALL');
  const [deliverySearch, setDeliverySearch] = useState('');

  const fetchCampaigns = useCallback(async () => {
    try {
      const res = await fetch('/api/broadcasts', { cache: 'no-store' });
      const data = await res.json();
      if (data.campaigns) setCampaigns(data.campaigns);
      if (data.quota) setQuota(data.quota);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    Promise.all([
      fetch('/api/contacts', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/templates', { cache: 'no-store' }).then((r) => r.json()),
    ])
      .then(([cData, tData]) => {
        const list = cData.contacts || [];
        setContacts(list);
        const tList = tData.templates || [];
        setTemplates(tList);

        const paramTpl = searchParams.get('templateId');
        const initialTpl =
          tList.find((t: any) => t.id === paramTpl) || tList[0] || null;
        if (initialTpl) {
          setSelectedTemplateId(initialTpl.id);
          setMessageBody(initialTpl.body);
        }
      })
      .catch(() => null);

    fetchCampaigns();
  }, [fetchCampaigns, searchParams]);

  // Poll active broadcast progress every 2.5s while any campaign is RUNNING
  const hasRunning = campaigns.some((c) => c.status === 'RUNNING');
  useEffect(() => {
    if (!hasRunning) return;
    const t = setInterval(fetchCampaigns, 2500);
    return () => clearInterval(t);
  }, [hasRunning, fetchCampaigns]);

  const categories = Array.from(
    new Set(
      contacts
        .map((c) => c.businessCategory)
        .filter((cat): cat is string => Boolean(cat && cat.trim()))
    )
  ).sort();

  const allCandidates = [...manualRecipients, ...contacts];
  const filteredCandidates = allCandidates.filter((c) => {
    const q = recipientSearch.trim().toLowerCase();
    const isManual = c.businessCategory === 'Manual';
    if (categoryFilter !== 'ALL' && !isManual && c.businessCategory !== categoryFilter) {
      return false;
    }
    if (waFilter === 'ACTIVE' && !c.isWAUser) {
      return false;
    }
    if (
      q &&
      !(
        (c.storeName || '').toLowerCase().includes(q) ||
        (c.name || '').toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q)
      )
    ) {
      return false;
    }
    return true;
  });

  const selectedRecipients = allCandidates.filter((c) => selectedIds.has(c.id));

  const toggleRecipient = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = (selectAll: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const c of filteredCandidates) {
        if (selectAll) next.add(c.id);
        else next.delete(c.id);
      }
      return next;
    });
  };

  const addManualNumber = () => {
    const clean = sanitizePhone(manualPhoneInput);
    if (!clean || clean.length < 8) {
      notify('Masukkan nomor WhatsApp yang valid');
      return;
    }
    const id = `manual_${clean}`;
    if (!allCandidates.some((c) => c.id === id || sanitizePhone(c.phone) === clean)) {
      setManualRecipients((prev) => [
        {
          id,
          phone: clean,
          name: 'Nomor Manual',
          storeName: formatDisplayPhone(clean),
          businessCategory: 'Manual',
          isWAUser: true,
        },
        ...prev,
      ]);
      setSelectedIds((prev) => new Set(prev).add(id));
    } else {
      const existing = allCandidates.find((c) => c.id === id || sanitizePhone(c.phone) === clean);
      if (existing) {
        setSelectedIds((prev) => new Set(prev).add(existing.id));
      }
    }
    setManualPhoneInput('');
    notify(`Nomor ${formatDisplayPhone(clean)} ditambahkan ke daftar penerima`);
  };

  const handlePullPassiveMerchants = async () => {
    if (loadingPassive) return;
    setLoadingPassive(true);
    try {
      const res = await fetch('/api/agent/passive-merchants?minDays=3&limit=80', {
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menarik merchant pasif');

      const list: Array<{
        phone: string;
        ownerName: string;
        storeName: string;
        businessCategory: string | null;
      }> = data.merchants || [];

      if (list.length === 0) {
        notify('Belum ada kandidat merchant pasif (0 produk / belum selesai setup) yang ditemukan');
        return;
      }

      const nextManual: ManualRecipient[] = [];
      const nextSelected = new Set<string>();

      for (const m of list) {
        const clean = sanitizePhone(m.phone);
        if (!clean) continue;
        const existing = contacts.find((c) => sanitizePhone(c.phone) === clean);
        if (existing) {
          nextSelected.add(existing.id);
        } else {
          const id = `manual_${clean}`;
          nextManual.push({
            id,
            phone: clean,
            name: m.ownerName || 'Kak',
            storeName: m.storeName || formatDisplayPhone(clean),
            businessCategory: m.businessCategory || 'Manual',
            isWAUser: true,
          });
          nextSelected.add(id);
        }
      }

      if (nextManual.length > 0) {
        setManualRecipients((prev) => {
          const existingPhones = new Set(prev.map((p) => sanitizePhone(p.phone)));
          return [...nextManual.filter((n) => !existingPhones.has(n.phone)), ...prev];
        });
      }

      setSelectedIds(nextSelected);
      setCategoryFilter('ALL');
      setName('Pendampingan Setup Toko Baru Lapaq');
      setSelectedTemplateId('');
      setMessageBody(
        `Halo kak {nama}, saya ${agentName || 'Rani'} dari Lapaq. ${
          agentName || 'Rani'
        } lihat kakak sudah mendaftar toko *{nama_toko}*, tapi belum sempat melanjutkan setup toko atau upload produk pertama. Apakah ada kendala atau bagian yang bisa ${
          agentName || 'Rani'
        } bantu pandu pelan-pelan?`
      );
      setEnableAiFollowup(true);
      setCampaignGoal(
        'Pendampingan empatik merchant baru Lapaq yang belum menyelesaikan setup toko atau belum upload produk pertama'
      );
      notify(
        `${nextSelected.size} merchant pasif dimuat (${
          data.source === 'LAPAQ_API' ? 'Bridge Lapaq Live' : 'Database Lokal'
        }) dengan tindak lanjut AI aktif`
      );
    } catch (err: any) {
      notify(err.message || 'Gagal memuat merchant pasif');
    } finally {
      setLoadingPassive(false);
    }
  };

  const handleTemplateChange = (id: string) => {
    setSelectedTemplateId(id);
    const tpl = templates.find((t) => t.id === id);
    if (tpl) setMessageBody(tpl.body);
  };

  const getDelayBounds = () => {
    const minGuard = quota.minDelaySec || 10;
    if (delayPreset === 'extra') return { min: Math.max(20, minGuard), max: Math.max(40, minGuard + 20) };
    if (delayPreset === 'fast') return { min: Math.max(5, minGuard), max: Math.max(10, minGuard + 5) };
    return { min: Math.max(10, minGuard), max: Math.max(20, minGuard + 10) };
  };

  const handleStartBroadcast = async () => {
    if (submitting) return;
    setError('');
    if (!name.trim() || !messageBody.trim()) {
      setError('Nama campaign dan isi pesan wajib diisi');
      return;
    }
    if (selectedRecipients.length === 0) {
      setError('Centang minimal 1 nomor penerima WhatsApp terlebih dahulu');
      return;
    }

    setSubmitting(true);
    try {
      const bounds = getDelayBounds();
      const res = await fetch('/api/broadcasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          templateId: selectedTemplateId || null,
          messageBody: messageBody.trim(),
          delayMinSec: bounds.min,
          delayMaxSec: bounds.max,
          startNow: true,
          enableAiFollowup,
          campaignGoal: enableAiFollowup ? campaignGoal.trim() : null,
          recipients: selectedRecipients.map((r) => ({
            phone: r.phone,
            contactId: r.id.startsWith('manual_') ? null : r.id,
            storeName: r.storeName || null,
            contactName: r.name || null,
            businessCategory: r.businessCategory === 'Manual' ? null : r.businessCategory || null,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memulai broadcast');

      setInspectedCampaignId(data.campaign.id);
      setDeliveryStatusFilter('ALL');
      notify(`Campaign "${data.campaign.name}" mulai dijalankan`);
      await fetchCampaigns();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCampaignAction = async (id: string, action: 'pause' | 'resume' | 'cancel') => {
    try {
      const res = await fetch(`/api/broadcasts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error('Gagal mengubah status campaign');
      await fetchCampaigns();
      notify(
        action === 'pause'
          ? 'Broadcast dijeda'
          : action === 'resume'
          ? 'Broadcast dilanjutkan'
          : 'Broadcast dibatalkan'
      );
    } catch (err: any) {
      notify(err.message);
    }
  };

  const sampleRecipient = selectedRecipients[0] || contacts[0] || null;
  const previewText = interpolateTemplate(messageBody, {
    name: sampleRecipient?.name,
    storeName: sampleRecipient?.storeName,
    category: sampleRecipient?.businessCategory,
  });

  const activeCampaign =
    campaigns.find((c) => c.id === inspectedCampaignId) ||
    campaigns.find((c) => c.status === 'RUNNING' || c.status === 'PAUSED') ||
    campaigns[0] ||
    null;

  const activeRecipients: any[] = Array.isArray(activeCampaign?.recipients)
    ? activeCampaign.recipients
    : [];

  const filteredDeliveryRecipients = activeRecipients.filter((r) => {
    if (deliveryStatusFilter !== 'ALL' && r.status !== deliveryStatusFilter) return false;
    const q = deliverySearch.trim().toLowerCase();
    if (
      q &&
      !(
        (r.storeName || '').toLowerCase().includes(q) ||
        (r.contactName || '').toLowerCase().includes(q) ||
        (r.phone || '').toLowerCase().includes(q) ||
        (r.error || '').toLowerCase().includes(q)
      )
    ) {
      return false;
    }
    return true;
  });

  const exportCampaignCsv = () => {
    if (!activeCampaign || activeRecipients.length === 0) return;
    const header = ['Nama Toko', 'Nama Kontak', 'Nomor WA', 'Status', 'Waktu Terkirim', 'Keterangan Error'];
    const rows = activeRecipients.map((r) => [
      r.storeName || '',
      r.contactName || '',
      r.phone || '',
      r.status || '',
      r.sentAt ? new Date(r.sentAt).toISOString() : '',
      r.error || '',
    ]);
    const csv = [header, ...rows]
      .map((cols) => cols.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `broadcast_${activeCampaign.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto bg-[#F4F8FA]">
      <header className="bg-white border-b border-[#D1DEE5] px-4 md:px-7 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-[17px] font-bold text-[#0F232E] tracking-tight">
            Broadcast & Campaign
          </h1>
          <p className="text-[12.5px] text-[#5C7685] mt-0.5">
            Pilih nomor tujuan secara presisi dengan jeda acak anti-ban dan kontrol antrean live.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-mono tabular-nums px-2.5 py-1 rounded-md bg-[#F4F8FA] border border-[#D1DEE5] text-[#435A68]">
            Kuota hari ini: <strong className="text-[#0F232E]">{quota.sentToday}/{quota.maxDailyMessages}</strong>
          </span>
          <Link
            href="/templates"
            className="h-8 px-3 bg-white hover:bg-[#F4F8FA] border border-[#B0C4CF] text-[#0F232E] text-xs font-semibold rounded-md inline-flex items-center"
          >
            Kelola Template
          </Link>
        </div>
      </header>

      <div className="p-4 md:p-7 max-w-[1280px] w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: Campaign Builder (7 cols) */}
        <div className="lg:col-span-7 bg-white border border-[#D1DEE5] rounded-lg shadow-[0_1px_2px_rgba(17,24,39,0.04)] overflow-hidden">
          <div className="px-4 py-3.5 border-b border-[#E8EFF3]">
            <h2 className="text-[13.5px] font-bold text-[#0F232E]">Buat Campaign Baru</h2>
            <p className="text-[11.5px] text-[#5C7685]">
              Filter, centang nomor penerima, atau tambahkan nomor manual
            </p>
          </div>

          <div className="p-4 space-y-4">
            {error && (
              <div className="p-2.5 bg-[#FDECEC] border border-[#F7B4B6] text-[#9E1F23] text-xs rounded-md flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Kasus 1 Quick Preset: Passive Merchant Awareness */}
            <div className="p-3 rounded-lg bg-[#ECF6FA] border border-[#A7D6E7] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="min-w-0">
                <div className="text-xs font-bold text-[#0F232E] flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#00688E] shrink-0" />
                  <span>Awareness Merchant Pasif Lapaq (Belum Setup / 0 Produk)</span>
                </div>
                <p className="text-[11px] text-[#435A68] mt-0.5">
                  Tarik otomatis daftar seller baru yang belum lanjut setup toko beserta sapaan ramah dari {agentName || 'Rani'}.
                </p>
              </div>
              <button
                type="button"
                disabled={loadingPassive}
                onClick={handlePullPassiveMerchants}
                className="h-8 px-3 bg-white hover:bg-[#FAFBFB] border border-[#00688E] text-[#00688E] text-xs font-semibold rounded-md inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                {loadingPassive ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Bot className="w-3.5 h-3.5" />
                )}
                <span>Tarik Merchant Pasif</span>
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0F232E] mb-1">Nama Campaign</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-9 px-3 border border-[#B0C4CF] rounded-md text-[13px] focus:outline-none focus:border-[#00688E]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#0F232E] mb-1">Filter Kategori</label>
                <Select
                  value={categoryFilter}
                  onChange={(v) => setCategoryFilter(v)}
                  className="w-full h-9 px-2.5 border border-[#B0C4CF] rounded-md text-[12.5px] bg-white"
                >
                  <option value="ALL">Semua Kategori</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#0F232E] mb-1">Filter Status WA</label>
                <Select
                  value={waFilter}
                  onChange={(v) => setWaFilter(v)}
                  className="w-full h-9 px-2.5 border border-[#B0C4CF] rounded-md text-[12.5px] bg-white"
                >
                  <option value="ACTIVE">Hanya Aktif WA</option>
                  <option value="ALL">Semua Kontak</option>
                </Select>
              </div>
            </div>

            {/* Recipient Checklist Picker */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-[#0F232E]">Pilih Nomor Penerima WA</label>
                <span className="px-2 py-0.5 rounded bg-[#ECF6FA] border border-[#A7D6E7] text-[#00688E] text-[11px] font-semibold tabular-nums">
                  {selectedRecipients.length} dipilih (maks {quota.maxRecipientsPerCampaign})
                </span>
              </div>

              <div className="border border-[#D1DEE5] rounded-md overflow-hidden">
                <div className="px-2.5 py-2 bg-[#F4F8FA] border-b border-[#E8EFF3] flex flex-wrap items-center gap-1.5">
                  <input
                    type="text"
                    value={recipientSearch}
                    onChange={(e) => setRecipientSearch(e.target.value)}
                    placeholder="Cari toko / nomor..."
                    className="h-7 px-2.5 flex-1 min-w-[140px] bg-white border border-[#B0C4CF] rounded text-xs focus:outline-none focus:border-[#00688E]"
                  />
                  <button
                    type="button"
                    onClick={() => selectAllFiltered(true)}
                    className="h-7 px-2 bg-white border border-[#B0C4CF] hover:bg-[#ECF6FA] text-[11px] font-semibold rounded cursor-pointer"
                  >
                    Pilih Semua
                  </button>
                  <button
                    type="button"
                    onClick={() => selectAllFiltered(false)}
                    className="h-7 px-2 text-[11px] font-semibold text-[#5C7685] hover:text-[#0F232E] rounded cursor-pointer"
                  >
                    Kosongkan
                  </button>
                </div>

                <div className="max-h-[210px] overflow-y-auto divide-y divide-[#E8EFF3]">
                  {filteredCandidates.length === 0 ? (
                    <div className="py-6 text-center text-xs text-[#809AA8]">
                      Tidak ada kontak cocok. Import merchant atau tambah nomor manual di bawah.
                    </div>
                  ) : (
                    filteredCandidates.map((c) => (
                      <label
                        key={c.id}
                        className="flex items-center gap-2.5 px-3 py-2 hover:bg-[#F4F8FA] cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(c.id)}
                          onChange={() => toggleRecipient(c.id)}
                          className="w-4 h-4 accent-[#00688E] shrink-0 cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-[12.5px] font-semibold text-[#0F232E] truncate">
                            {c.storeName || c.name || formatDisplayPhone(c.phone)}
                            {c.storeName && c.name ? (
                              <span className="font-normal text-[#5C7685]"> ({c.name})</span>
                            ) : null}
                          </div>
                          <div className="text-[11px] font-mono tabular-nums text-[#5C7685]">
                            {formatDisplayPhone(c.phone)}
                          </div>
                        </div>
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0 ${
                            c.isWAUser
                              ? 'bg-[#E7F8F1] text-[#0D6945] border-[#A7E7CB]'
                              : 'bg-[#FEF5E4] text-[#8F5A05] border-[#F7D488]'
                          }`}
                        >
                          {c.isWAUser ? 'Aktif WA' : 'Unverified'}
                        </span>
                      </label>
                    ))
                  )}
                </div>

                {/* Manual Number Adder */}
                <div className="px-2.5 py-2 bg-[#F4F8FA] border-t border-[#E8EFF3] flex gap-1.5">
                  <input
                    type="text"
                    value={manualPhoneInput}
                    onChange={(e) => setManualPhoneInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addManualNumber();
                      }
                    }}
                    placeholder="Tambah nomor manual (mis. 08123456789)"
                    className="flex-1 h-7 px-2.5 bg-white border border-[#B0C4CF] rounded text-xs font-mono focus:outline-none focus:border-[#00688E]"
                  />
                  <button
                    type="button"
                    onClick={addManualNumber}
                    className="h-7 px-2.5 bg-white border border-[#B0C4CF] hover:bg-[#ECF6FA] text-xs font-semibold rounded inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Tambah
                  </button>
                </div>
              </div>
            </div>

            {/* Template + Delay */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#0F232E] mb-1">
                  Gunakan Template
                </label>
                <Select
                  value={selectedTemplateId}
                  onChange={(v) => handleTemplateChange(v)}
                  className="w-full h-9 px-2.5 border border-[#B0C4CF] rounded-md text-[12.5px] bg-white"
                >
                  <option value="">-- Tulis Manual --</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title} ({t.shortcut})
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#0F232E] mb-1">
                  Jeda Acak Anti-Ban (min {quota.minDelaySec}s)
                </label>
                <Select
                  value={delayPreset}
                  onChange={(v) => setDelayPreset(v as any)}
                  className="w-full h-9 px-2.5 border border-[#B0C4CF] rounded-md text-[12.5px] bg-white"
                >
                  <option value="safe">Aman: {Math.max(10, quota.minDelaySec)}–{Math.max(20, quota.minDelaySec + 10)} detik</option>
                  <option value="extra">Sangat Aman: {Math.max(20, quota.minDelaySec)}–{Math.max(40, quota.minDelaySec + 20)} detik</option>
                  <option value="fast">Cepat: {Math.max(5, quota.minDelaySec)}–{Math.max(10, quota.minDelaySec + 5)} detik</option>
                </Select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0F232E] mb-1">
                Isi Pesan Broadcast
              </label>
              <textarea
                rows={3}
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                placeholder="Tulis pesan broadcast... mendukung {nama}, {nama_toko}, {kategori}"
                className="w-full p-2.5 border border-[#B0C4CF] rounded-md text-[13px] focus:outline-none focus:border-[#00688E]"
              />
            </div>

            {messageBody.trim() && (
              <div>
                <label className="block text-xs font-semibold text-[#5C7685] mb-1">
                  Preview Personalisasi ({sampleRecipient?.storeName || sampleRecipient?.name || 'Contoh'}):
                </label>
                <div className="p-3 rounded-md bg-[#F4F8FA] border border-[#E8EFF3] text-xs text-[#0F232E] whitespace-pre-wrap leading-relaxed">
                  {previewText}
                </div>
              </div>
            )}

            {/* AI Agent Reply Follow-up Configuration */}
            <div className="p-3.5 rounded-lg border border-[#D1DEE5] bg-[#F4F8FA] space-y-2.5">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableAiFollowup}
                  onChange={(e) => setEnableAiFollowup(e.target.checked)}
                  className="mt-0.5 w-4 h-4 shrink-0 cursor-pointer"
                />
                <div>
                  <div className="text-xs font-bold text-[#0F232E] flex items-center gap-1.5">
                    <Bot className="w-3.5 h-3.5 text-[#00688E]" />
                    <span>Tangani Balasan Merchant dengan Agentic CS ({agentName || 'Rani'})</span>
                  </div>
                  <p className="text-[11px] text-[#5C7685] leading-snug">
                    Jika diaktifkan, saat merchant membalas sapaan broadcast ini (dan saklar utama AI aktif), Agent akan langsung memandu sesuai konteks tujuan campaign tanpa bertele-tele.
                  </p>
                </div>
              </label>

              {enableAiFollowup && (
                <div className="pl-6">
                  <label className="block text-[11px] font-semibold text-[#435A68] mb-1">
                    Tujuan Konteks Campaign untuk Agent AI:
                  </label>
                  <input
                    type="text"
                    value={campaignGoal}
                    onChange={(e) => setCampaignGoal(e.target.value)}
                    placeholder="Misal: Bantu merchant menyelesaikan upload produk pertama & atur kurir toko"
                    className="w-full h-8 px-2.5 bg-white border border-[#B0C4CF] rounded-md text-xs focus:outline-none focus:border-[#00688E]"
                  />
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-[#E8EFF3] flex items-center justify-between gap-3">
              <span className="text-[11.5px] text-[#5C7685]">
                Pengiriman berjalan di latar belakang dengan proteksi circuit breaker.
              </span>
              <button
                type="button"
                disabled={submitting || selectedRecipients.length === 0}
                onClick={handleStartBroadcast}
                className="h-9 px-4 bg-[#00688E] hover:bg-[#005575] disabled:opacity-45 text-white text-xs font-semibold rounded-md inline-flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>Mulai Broadcast ({selectedRecipients.length})</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right: Active Queue Monitor & Campaign History (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Active Queue Monitor */}
          <div className="bg-white border border-[#D1DEE5] rounded-lg shadow-[0_1px_2px_rgba(17,24,39,0.04)] overflow-hidden">
            <div className="px-4 py-3.5 border-b border-[#E8EFF3] flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-[13.5px] font-bold text-[#0F232E]">Antrean Pengiriman</h2>
                <p className="text-[11.5px] text-[#5C7685] truncate">
                  {activeCampaign ? activeCampaign.name : 'Belum ada campaign berjalan'}
                </p>
              </div>
              {activeCampaign && (
                <span
                  className={`px-2 py-0.5 rounded text-[10.5px] font-semibold border shrink-0 ${
                    activeCampaign.status === 'RUNNING'
                      ? 'bg-[#ECF6FA] text-[#00688E] border-[#A7D6E7]'
                      : activeCampaign.status === 'PAUSED'
                      ? 'bg-[#FEF5E4] text-[#8F5A05] border-[#F7D488]'
                      : activeCampaign.status === 'COMPLETED'
                      ? 'bg-[#E7F8F1] text-[#0D6945] border-[#A7E7CB]'
                      : 'bg-[#E8EFF3] text-[#435A68] border-[#D1DEE5]'
                  }`}
                >
                  {activeCampaign.status}
                </span>
              )}
            </div>

            <div className="p-4 space-y-3.5">
              {activeCampaign ? (
                <>
                  <div className="h-2 w-full bg-[#E8EFF3] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#00688E] transition-all duration-300"
                      style={{
                        width: `${Math.round(
                          ((activeCampaign.sentCount + activeCampaign.failedCount) /
                            Math.max(1, activeCampaign.totalCount)) *
                            100
                        )}%`,
                      }}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center tabular-nums">
                    <div className="p-2.5 bg-[#F4F8FA] border border-[#E8EFF3] rounded-md">
                      <div className="text-lg font-bold text-[#0D6945]">
                        {activeCampaign.sentCount}
                      </div>
                      <div className="text-[11px] text-[#5C7685]">Terkirim</div>
                    </div>
                    <div className="p-2.5 bg-[#F4F8FA] border border-[#E8EFF3] rounded-md">
                      <div className="text-lg font-bold text-[#0F232E]">
                        {Math.max(
                          0,
                          activeCampaign.totalCount -
                            activeCampaign.sentCount -
                            activeCampaign.failedCount
                        )}
                      </div>
                      <div className="text-[11px] text-[#5C7685]">Antre</div>
                    </div>
                    <div className="p-2.5 bg-[#F4F8FA] border border-[#E8EFF3] rounded-md">
                      <div className="text-lg font-bold text-[#9E1F23]">
                        {activeCampaign.failedCount}
                      </div>
                      <div className="text-[11px] text-[#5C7685]">Gagal</div>
                    </div>
                  </div>

                  {(activeCampaign.status === 'RUNNING' || activeCampaign.status === 'PAUSED') && (
                    <div className="flex items-center gap-2">
                      {activeCampaign.status === 'RUNNING' ? (
                        <button
                          type="button"
                          onClick={() => handleCampaignAction(activeCampaign.id, 'pause')}
                          className="flex-1 h-8 bg-white hover:bg-[#FEF5E4] border border-[#F7D488] text-[#8F5A05] text-xs font-semibold rounded-md inline-flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Pause className="w-3.5 h-3.5" /> Pause
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleCampaignAction(activeCampaign.id, 'resume')}
                          className="flex-1 h-8 bg-[#00688E] hover:bg-[#005575] text-white text-xs font-semibold rounded-md inline-flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5" /> Lanjutkan
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleCampaignAction(activeCampaign.id, 'cancel')}
                        className="h-8 px-3 bg-white hover:bg-[#FDECEC] border border-[#F7B4B6] text-[#9E1F23] text-xs font-semibold rounded-md inline-flex items-center gap-1 cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Batalkan
                      </button>
                    </div>
                  )}

                  {/* Per-Number Delivery Status Breakdown */}
                  <div className="space-y-2 pt-1 border-t border-[#E8EFF3]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[#0F232E]">
                        Detail Status per Nomor ({filteredDeliveryRecipients.length})
                      </span>
                      <button
                        type="button"
                        onClick={exportCampaignCsv}
                        className="h-6 px-2 bg-white hover:bg-[#F4F8FA] border border-[#B0C4CF] text-[11px] font-semibold text-[#0F232E] rounded inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Download className="w-3 h-3" /> Export CSV
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-1">
                      {(
                        [
                          { key: 'ALL', label: `Semua (${activeRecipients.length})` },
                          { key: 'SENT', label: `Terkirim (${activeCampaign.sentCount})` },
                          { key: 'FAILED', label: `Gagal (${activeCampaign.failedCount})` },
                          {
                            key: 'QUEUED',
                            label: `Antre (${Math.max(
                              0,
                              activeCampaign.totalCount -
                                activeCampaign.sentCount -
                                activeCampaign.failedCount
                            )})`,
                          },
                        ] as const
                      ).map((f) => (
                        <button
                          key={f.key}
                          type="button"
                          onClick={() => setDeliveryStatusFilter(f.key)}
                          className={`px-2 py-0.5 rounded text-[10.5px] font-semibold transition cursor-pointer ${
                            deliveryStatusFilter === f.key
                              ? 'bg-[#0F232E] text-white'
                              : 'bg-[#F4F8FA] text-[#5C7685] hover:text-[#0F232E]'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>

                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-[#809AA8] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={deliverySearch}
                        onChange={(e) => setDeliverySearch(e.target.value)}
                        placeholder="Cari nomor atau nama toko..."
                        className="w-full h-7 pl-8 pr-2.5 bg-white border border-[#D1DEE5] rounded text-xs focus:outline-none focus:border-[#00688E]"
                      />
                    </div>

                    <div className="max-h-[240px] overflow-y-auto divide-y divide-[#E8EFF3] border border-[#E8EFF3] rounded-md text-[11.5px]">
                      {filteredDeliveryRecipients.length === 0 ? (
                        <div className="py-6 text-center text-xs text-[#809AA8]">
                          Tidak ada nomor pada filter status ini.
                        </div>
                      ) : (
                        filteredDeliveryRecipients.map((r: any) => (
                          <div key={r.id} className="px-2.5 py-2 space-y-0.5 hover:bg-[#F4F8FA]">
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <div className="font-semibold text-[#0F232E] truncate">
                                  {r.storeName || r.contactName || formatDisplayPhone(r.phone)}
                                </div>
                                <div className="font-mono tabular-nums text-[10.5px] text-[#5C7685]">
                                  {formatDisplayPhone(r.phone)}
                                  {r.sentAt
                                    ? ` • ${new Date(r.sentAt).toLocaleTimeString('id-ID', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })}`
                                    : ''}
                                </div>
                              </div>
                              <span
                                className={`font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0 ${
                                  r.status === 'SENT'
                                    ? 'bg-[#E7F8F1] text-[#0D6945] border-[#A7E7CB]'
                                    : r.status === 'FAILED'
                                    ? 'bg-[#FDECEC] text-[#9E1F23] border-[#F7B4B6]'
                                    : 'bg-[#E8EFF3] text-[#5C7685] border-[#D1DEE5]'
                                }`}
                              >
                                {r.status === 'SENT'
                                  ? 'TERKIRIM'
                                  : r.status === 'FAILED'
                                  ? 'GAGAL'
                                  : 'ANTRE'}
                              </span>
                            </div>
                            {r.status === 'FAILED' && r.error && (
                              <div className="text-[10.5px] text-[#9E1F23] bg-[#FDECEC] px-2 py-1 rounded">
                                Alasan: {r.error}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="py-8 text-center text-xs text-[#809AA8]">
                  Belum ada riwayat broadcast. Buat campaign di sebelah kiri untuk memulai.
                </div>
              )}
            </div>
          </div>

          {/* Campaign History */}
          <div className="bg-white border border-[#D1DEE5] rounded-lg shadow-[0_1px_2px_rgba(17,24,39,0.04)] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#E8EFF3]">
              <h2 className="text-[13.5px] font-bold text-[#0F232E]">Riwayat Campaign</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#F4F8FA] border-b border-[#D1DEE5] text-[10.5px] uppercase text-[#5C7685]">
                    <th className="py-2 px-4">Campaign</th>
                    <th className="py-2 px-4">Progres</th>
                    <th className="py-2 px-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8EFF3]">
                  {campaigns.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-[#809AA8]">
                        Belum ada campaign tersimpan.
                      </td>
                    </tr>
                  ) : (
                    campaigns.slice(0, 10).map((c) => {
                      const isInspected = activeCampaign?.id === c.id;
                      return (
                        <tr
                          key={c.id}
                          onClick={() => {
                            setInspectedCampaignId(c.id);
                            setDeliveryStatusFilter('ALL');
                          }}
                          className={`cursor-pointer transition ${
                            isInspected ? 'bg-[#ECF6FA]' : 'hover:bg-[#FAFBFB]'
                          }`}
                        >
                          <td className="py-2.5 px-4">
                            <div className="font-semibold text-[#0F232E] truncate max-w-[180px] flex items-center gap-1.5">
                              <span className="truncate">{c.name}</span>
                              {c.enableAiFollowup && (
                                <span
                                  title="Balasan ditangani Agentic CS"
                                  className="inline-flex items-center px-1 py-0.5 rounded bg-[#ECF6FA] border border-[#A7D6E7] text-[#00688E] text-[9.5px] font-bold shrink-0"
                                >
                                  AI
                                </span>
                              )}
                            </div>
                            <div className="text-[10.5px] text-[#809AA8] tabular-nums">
                              {new Date(c.createdAt).toLocaleDateString('id-ID', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}{' '}
                              • Klik untuk detail nomor
                            </div>
                          </td>
                          <td className="py-2.5 px-4 font-mono tabular-nums text-[#435A68]">
                            {c.sentCount}/{c.totalCount}
                            {c.failedCount > 0 ? (
                              <span className="text-[#9E1F23]"> ({c.failedCount} gagal)</span>
                            ) : null}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded bg-[#E8EFF3] text-[#435A68]">
                              {c.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BroadcastPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center text-xs text-[#809AA8]">
          Memuat Broadcast...
        </div>
      }
    >
      <BroadcastPageInner />
    </Suspense>
  );
}
