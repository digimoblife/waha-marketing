'use client';

import React, { useState, useEffect } from 'react';
import { Loader2, Plus, Save } from 'lucide-react';
import { useWorkspace } from '@/components/WorkspaceContext';

type SettingsTab = 'guardrail' | 'sla' | 'waha' | 'tags';

export default function AdminSettingsPage() {
  const { sessionStatus, openQRModal, refreshSession, notify } = useWorkspace();
  const [activeTab, setActiveTab] = useState<SettingsTab>('guardrail');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Guardrail state
  const [maxDailyMessages, setMaxDailyMessages] = useState(500);
  const [minDelaySec, setMinDelaySec] = useState(10);
  const [maxRecipientsPerCampaign, setMaxRecipientsPerCampaign] = useState(150);
  const [circuitBreakerErrors, setCircuitBreakerErrors] = useState(5);

  // SLA & Hours state
  const [slaMinutes, setSlaMinutes] = useState(15);
  const [assignMode, setAssignMode] = useState<'MANUAL' | 'ROUND_ROBIN'>('MANUAL');
  const [awayEnabled, setAwayEnabled] = useState(false);
  const [workStart, setWorkStart] = useState('08:00');
  const [workEnd, setWorkEnd] = useState('17:00');
  const [awayMessage, setAwayMessage] = useState('');

  // Master tags state
  const [masterTags, setMasterTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');

  useEffect(() => {
    fetch('/api/admin/settings', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        const s = data.settings;
        if (!s) return;
        setMaxDailyMessages(s.guardrail.maxDailyMessages);
        setMinDelaySec(s.guardrail.minDelaySec);
        setMaxRecipientsPerCampaign(s.guardrail.maxRecipientsPerCampaign);
        setCircuitBreakerErrors(s.guardrail.circuitBreakerErrors);

        setSlaMinutes(s.slaHours.slaMinutes);
        setAssignMode(s.slaHours.assignMode);
        setAwayEnabled(s.slaHours.awayEnabled);
        setWorkStart(s.slaHours.workStart);
        setWorkEnd(s.slaHours.workEnd);
        setAwayMessage(s.slaHours.awayMessage);

        setMasterTags(s.masterTags || []);
      })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guardrail: {
            maxDailyMessages,
            minDelaySec,
            maxRecipientsPerCampaign,
            circuitBreakerErrors,
          },
          slaHours: {
            slaMinutes,
            assignMode,
            awayEnabled,
            workStart,
            workEnd,
            awayMessage,
          },
          masterTags,
        }),
      });
      if (!res.ok) throw new Error('Gagal menyimpan pengaturan');
      notify('Pengaturan sistem berhasil disimpan');
    } catch (err: any) {
      notify(err.message || 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  };

  const addMasterTag = () => {
    const val = newTagInput.trim();
    if (!val) return;
    if (!masterTags.includes(val)) {
      setMasterTags((prev) => [...prev, val]);
    }
    setNewTagInput('');
  };

  const tabs: Array<{ id: SettingsTab; label: string }> = [
    { id: 'guardrail', label: 'Guardrail Anti-Ban' },
    { id: 'sla', label: 'SLA & Jam Operasional' },
    { id: 'waha', label: 'WAHA & Webhook' },
    { id: 'tags', label: 'Master Label / Tags' },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto bg-[#F4F8FA]">
      <header className="bg-white border-b border-[#D1DEE5] px-4 md:px-7 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-[17px] font-bold text-[#0F232E] tracking-tight">Pengaturan Sistem</h1>
          <p className="text-[12.5px] text-[#5C7685] mt-0.5">
            Konfigurasi guardrail anti-ban, ambang SLA, jam operasional, koneksi WAHA, dan master label.
          </p>
        </div>

        <button
          type="button"
          disabled={saving || loading}
          onClick={handleSave}
          className="self-start sm:self-auto h-8 px-3.5 bg-[#00688E] hover:bg-[#005575] disabled:opacity-50 text-white text-xs font-semibold rounded-md inline-flex items-center gap-1.5 cursor-pointer"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          <span>Simpan Pengaturan</span>
        </button>
      </header>

      <div className="p-4 md:p-7 max-w-[1100px] w-full mx-auto">
        {loading ? (
          <div className="py-16 text-center text-xs text-[#809AA8]">
            <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
            Memuat pengaturan...
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-5 items-start">
            {/* Tab Navigation (Horizontal scroll on mobile, vertical sidebar on desktop) */}
            <div className="bg-white border border-[#D1DEE5] rounded-lg p-1.5 flex md:flex-col gap-1 overflow-x-auto shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`px-3 py-2 rounded-md text-[12.5px] text-left whitespace-nowrap transition cursor-pointer ${
                    activeTab === t.id
                      ? 'bg-[#D3EBF3] text-[#00688E] font-semibold'
                      : 'text-[#435A68] hover:bg-[#F4F8FA] hover:text-[#0F232E] font-medium'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Right Settings Panel */}
            <div className="bg-white border border-[#D1DEE5] rounded-lg shadow-[0_1px_2px_rgba(17,24,39,0.04)] overflow-hidden">
              {activeTab === 'guardrail' && (
                <>
                  <div className="px-5 py-3.5 border-b border-[#E8EFF3]">
                    <h2 className="text-[13.5px] font-bold text-[#0F232E]">
                      Guardrail Anti-Ban WhatsApp
                    </h2>
                    <p className="text-[11.5px] text-[#5C7685]">
                      Mengunci batas aman pengiriman harian dan broadcast agar nomor tidak terblokir
                    </p>
                  </div>
                  <div className="divide-y divide-[#E8EFF3]">
                    <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="text-[13px] font-semibold text-[#0F232E]">
                          Batas Maksimal Pesan Keluar / Hari
                        </div>
                        <div className="text-[11.5px] text-[#5C7685] mt-0.5">
                          Broadcast otomatis dijeda jika total pengiriman hari ini mencapai kuota ini.
                        </div>
                      </div>
                      <input
                        type="number"
                        min={10}
                        max={10000}
                        value={maxDailyMessages}
                        onChange={(e) => setMaxDailyMessages(Number(e.target.value) || 500)}
                        className="w-28 h-9 px-3 border border-[#B0C4CF] rounded-md text-xs font-mono"
                      />
                    </div>

                    <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="text-[13px] font-semibold text-[#0F232E]">
                          Delay Minimum Broadcast (detik)
                        </div>
                        <div className="text-[11.5px] text-[#5C7685] mt-0.5">
                          Operator tidak dapat mengirim broadcast lebih cepat dari batas ini.
                        </div>
                      </div>
                      <input
                        type="number"
                        min={3}
                        max={300}
                        value={minDelaySec}
                        onChange={(e) => setMinDelaySec(Number(e.target.value) || 10)}
                        className="w-28 h-9 px-3 border border-[#B0C4CF] rounded-md text-xs font-mono"
                      />
                    </div>

                    <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="text-[13px] font-semibold text-[#0F232E]">
                          Batas Penerima per Campaign
                        </div>
                        <div className="text-[11.5px] text-[#5C7685] mt-0.5">
                          Maksimal nomor penerima yang dapat dijalankan dalam 1 campaign.
                        </div>
                      </div>
                      <input
                        type="number"
                        min={1}
                        max={2000}
                        value={maxRecipientsPerCampaign}
                        onChange={(e) => setMaxRecipientsPerCampaign(Number(e.target.value) || 150)}
                        className="w-28 h-9 px-3 border border-[#B0C4CF] rounded-md text-xs font-mono"
                      />
                    </div>

                    <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="text-[13px] font-semibold text-[#0F232E]">
                          Circuit Breaker (Auto-Pause Error)
                        </div>
                        <div className="text-[11.5px] text-[#5C7685] mt-0.5">
                          Otomatis menjeda broadcast jika terjadi error WAHA berturut-turut sebanyak X kali.
                        </div>
                      </div>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={circuitBreakerErrors}
                        onChange={(e) => setCircuitBreakerErrors(Number(e.target.value) || 5)}
                        className="w-28 h-9 px-3 border border-[#B0C4CF] rounded-md text-xs font-mono"
                      />
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'sla' && (
                <>
                  <div className="px-5 py-3.5 border-b border-[#E8EFF3]">
                    <h2 className="text-[13.5px] font-bold text-[#0F232E]">
                      SLA Balasan & Jam Operasional
                    </h2>
                    <p className="text-[11.5px] text-[#5C7685]">
                      Mengatur alert antrean SLA, auto-assign operator, dan balasan di luar jam kerja
                    </p>
                  </div>
                  <div className="divide-y divide-[#E8EFF3]">
                    <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="text-[13px] font-semibold text-[#0F232E]">
                          Ambang Alert SLA Balasan Pertama (menit)
                        </div>
                        <div className="text-[11.5px] text-[#5C7685] mt-0.5">
                          Chat belum dibalas melebihi durasi ini akan ditandai di Antrean SLA Overview.
                        </div>
                      </div>
                      <input
                        type="number"
                        min={1}
                        max={1440}
                        value={slaMinutes}
                        onChange={(e) => setSlaMinutes(Number(e.target.value) || 15)}
                        className="w-28 h-9 px-3 border border-[#B0C4CF] rounded-md text-xs font-mono"
                      />
                    </div>

                    <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="text-[13px] font-semibold text-[#0F232E]">
                          Mode Penugasan Chat Masuk Baru
                        </div>
                        <div className="text-[11.5px] text-[#5C7685] mt-0.5">
                          Pilih apakah obrolan baru dibiarkan Unassigned atau dibagi rata otomatis.
                        </div>
                      </div>
                      <select
                        value={assignMode}
                        onChange={(e) => setAssignMode(e.target.value as 'MANUAL' | 'ROUND_ROBIN')}
                        className="w-full sm:w-56 h-9 px-2.5 border border-[#B0C4CF] rounded-md text-xs bg-white"
                      >
                        <option value="MANUAL">Manual (Unassigned)</option>
                        <option value="ROUND_ROBIN">Auto-Assign (Round-Robin)</option>
                      </select>
                    </div>

                    <div className="px-5 py-4 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[13px] font-semibold text-[#0F232E]">
                          Auto-Reply di Luar Jam Kerja
                        </div>
                        <div className="text-[11.5px] text-[#5C7685] mt-0.5">
                          Kirim balasan otomatis maksimal 1x per 24 jam saat di luar jam operasional WIB.
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={awayEnabled}
                          onChange={(e) => setAwayEnabled(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-[#B0C4CF] peer-checked:bg-[#00688E] rounded-full transition after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:w-4 after:h-4 after:bg-white after:rounded-full after:transition-all peer-checked:after:translate-x-4" />
                      </label>
                    </div>

                    <div className="px-5 py-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[13px] font-semibold text-[#0F232E]">
                          Jam Operasional (WIB)
                        </span>
                        <div className="flex items-center gap-2">
                          <input
                            type="time"
                            value={workStart}
                            onChange={(e) => setWorkStart(e.target.value)}
                            className="h-8 px-2.5 border border-[#B0C4CF] rounded-md text-xs font-mono"
                          />
                          <span className="text-xs text-[#5C7685]">s/d</span>
                          <input
                            type="time"
                            value={workEnd}
                            onChange={(e) => setWorkEnd(e.target.value)}
                            className="h-8 px-2.5 border border-[#B0C4CF] rounded-md text-xs font-mono"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-[#0F232E] mb-1">
                          Teks Pesan Auto-Reply (Away Message)
                        </label>
                        <textarea
                          rows={3}
                          value={awayMessage}
                          onChange={(e) => setAwayMessage(e.target.value)}
                          className="w-full p-2.5 border border-[#B0C4CF] rounded-md text-[12.5px] focus:outline-none focus:border-[#00688E]"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'waha' && (
                <>
                  <div className="px-5 py-3.5 border-b border-[#E8EFF3] flex items-center justify-between">
                    <div>
                      <h2 className="text-[13.5px] font-bold text-[#0F232E]">
                        Koneksi WAHA & Webhook
                      </h2>
                      <p className="text-[11.5px] text-[#5C7685]">
                        Engine WhatsApp HTTP API (NOWEB)
                      </p>
                    </div>
                    <span
                      className={`text-[10.5px] font-semibold px-2 py-0.5 rounded border ${
                        sessionStatus === 'WORKING'
                          ? 'bg-[#E7F8F1] text-[#0D6945] border-[#A7E7CB]'
                          : 'bg-[#FDECEC] text-[#9E1F23] border-[#F7B4B6]'
                      }`}
                    >
                      {sessionStatus}
                    </span>
                  </div>
                  <div className="divide-y divide-[#E8EFF3]">
                    <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="text-[13px] font-semibold text-[#0F232E]">Nama Sesi WAHA</div>
                        <div className="text-[11.5px] text-[#5C7685]">Sesi aktif pada container WAHA.</div>
                      </div>
                      <code className="font-mono text-xs px-2.5 py-1.5 rounded bg-[#F4F8FA] border border-[#D1DEE5]">
                        default
                      </code>
                    </div>
                    <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="text-[13px] font-semibold text-[#0F232E]">Endpoint Webhook</div>
                        <div className="text-[11.5px] text-[#5C7685]">Penerima event pesan masuk & ACK.</div>
                      </div>
                      <code className="font-mono text-xs px-2.5 py-1.5 rounded bg-[#F4F8FA] border border-[#D1DEE5]">
                        /api/webhook
                      </code>
                    </div>
                    <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="text-[13px] font-semibold text-[#0F232E]">
                          Kontrol Sesi & QR Scanner
                        </div>
                        <div className="text-[11.5px] text-[#5C7685]">
                          Tautkan ulang nomor WhatsApp atau cek status koneksi.
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            await refreshSession();
                            notify(`Status WAHA diperbarui: ${sessionStatus}`);
                          }}
                          className="h-8 px-3 bg-white hover:bg-[#F4F8FA] border border-[#B0C4CF] text-xs font-semibold rounded-md cursor-pointer"
                        >
                          Tes Koneksi
                        </button>
                        <button
                          type="button"
                          onClick={openQRModal}
                          className="h-8 px-3 bg-[#00688E] hover:bg-[#005575] text-white text-xs font-semibold rounded-md cursor-pointer"
                        >
                          Buka QR / Sesi
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'tags' && (
                <>
                  <div className="px-5 py-3.5 border-b border-[#E8EFF3]">
                    <h2 className="text-[13.5px] font-bold text-[#0F232E]">
                      Master Label / Tags Merchant
                    </h2>
                    <p className="text-[11.5px] text-[#5C7685]">
                      Label resmi yang muncul sebagai pilihan cepat di Profil Merchant Inbox
                    </p>
                  </div>
                  <div className="p-5 space-y-4">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newTagInput}
                        onChange={(e) => setNewTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addMasterTag();
                          }
                        }}
                        placeholder="Tambah label baru (mis. Hot Lead, Promo Q4)..."
                        className="flex-1 max-w-xs h-9 px-3 border border-[#B0C4CF] rounded-md text-xs focus:outline-none focus:border-[#00688E]"
                      />
                      <button
                        type="button"
                        onClick={addMasterTag}
                        className="h-9 px-3 bg-[#00688E] hover:bg-[#005575] text-white text-xs font-semibold rounded-md inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" /> Tambah
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {masterTags.map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#E8EFF3] border border-[#D1DEE5] text-xs font-medium text-[#0F232E]"
                        >
                          {t}
                          <button
                            type="button"
                            onClick={() => setMasterTags((prev) => prev.filter((x) => x !== t))}
                            className="text-[#809AA8] hover:text-[#9E1F23] cursor-pointer leading-none"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
