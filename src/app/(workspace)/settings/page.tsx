'use client';

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Loader2,
  Plus,
  Save,
  Bot,
  RefreshCw,
  Upload,
  Trash2,
  CheckCircle2,
  AlertCircle,
  BookOpen,
  KeyRound,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useWorkspace } from '@/components/WorkspaceContext';
import Select from '@/components/ui/Select';
import type { BotMasterSwitch, DefaultChatAgentMode, LapaqConnectorMode } from '@/lib/settings';

type SettingsTab = 'agent' | 'guardrail' | 'sla' | 'waha' | 'tags';

interface QuickNoteItem {
  id: string;
  sourceKey: string;
  title: string;
  category: string;
  content: string;
  updatedAt: string;
}

interface KnowledgeStats {
  totalActiveChunks: number;
  vectorizedChunks: number;
  geminiKeyConfigured: boolean;
  bySourceType: Array<{ sourceType: string; count: number }>;
  bundle: {
    exists: boolean;
    generatedAt?: string;
    totalChunks?: number;
  };
}

function AdminSettingsInner() {
  const searchParams = useSearchParams();
  const { sessionStatus, openQRModal, refreshSession, refreshWorkspaceMeta, notify } =
    useWorkspace();

  const initialTab = (searchParams.get('tab') as SettingsTab) || 'agent';
  const [activeTab, setActiveTab] = useState<SettingsTab>(
    ['agent', 'guardrail', 'sla', 'waha', 'tags'].includes(initialTab) ? initialTab : 'agent'
  );
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

  // Agentic CS configuration state
  const [masterSwitch, setMasterSwitch] = useState<BotMasterSwitch>('OFF');
  const [defaultChatAgentMode, setDefaultChatAgentMode] =
    useState<DefaultChatAgentMode>('AI_ACTIVE');
  const [agentName, setAgentName] = useState('Rani');
  const [debounceMs, setDebounceMs] = useState(5000);
  const [maxDailyAiTurnsPerChat, setMaxDailyAiTurnsPerChat] = useState(40);
  const [primaryModel, setPrimaryModel] = useState('gemini-3.8-flash');
  const [fallbackProModel, setFallbackProModel] = useState('gemini-4-argon');
  const [liteModel, setLiteModel] = useState('gemini-3.5-flash-lite');
  const [embeddingModel, setEmbeddingModel] = useState('gemini-embedding-2');
  const [lapaqConnectorMode, setLapaqConnectorMode] = useState<LapaqConnectorMode>('STANDALONE');
  const [lapaqInternalApiUrl, setLapaqInternalApiUrl] = useState('');
  const [autoFollowupOnIssueResolved, setAutoFollowupOnIssueResolved] = useState(false);

  const [geminiKeyConfigured, setGeminiKeyConfigured] = useState(false);
  const [geminiKeySource, setGeminiKeySource] = useState<'DB' | 'ENV' | 'NONE'>('NONE');
  const [geminiKeyMasked, setGeminiKeyMasked] = useState('');
  const [geminiKeyInput, setGeminiKeyInput] = useState('');
  const [showGeminiKey, setShowGeminiKey] = useState(false);

  const [lapaqApiKeyConfigured, setLapaqApiKeyConfigured] = useState(false);
  const [lapaqKeySource, setLapaqKeySource] = useState<'DB' | 'ENV' | 'NONE'>('NONE');
  const [lapaqKeyMasked, setLapaqKeyMasked] = useState('');
  const [internalCsKeyInput, setInternalCsKeyInput] = useState('');
  const [showInternalCsKey, setShowInternalCsKey] = useState(false);

  const [savingKeys, setSavingKeys] = useState(false);
  const [testingKey, setTestingKey] = useState(false);
  const [keyStatusMsg, setKeyStatusMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Knowledge Studio state
  const [kbStats, setKbStats] = useState<KnowledgeStats | null>(null);
  const [syncingKb, setSyncingKb] = useState(false);
  const [uploadingBundle, setUploadingBundle] = useState(false);
  const bundleInputRef = useRef<HTMLInputElement>(null);

  const [quickNotes, setQuickNotes] = useState<QuickNoteItem[]>([]);
  const [noteSourceKey, setNoteSourceKey] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteCategory, setNoteCategory] = useState('Pengumuman');
  const [noteContent, setNoteContent] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const fetchKnowledgeMeta = useCallback(async () => {
    try {
      const [syncRes, notesRes, agentRes] = await Promise.all([
        fetch('/api/admin/agent/knowledge/sync', { cache: 'no-store' }),
        fetch('/api/admin/agent/knowledge/quick-notes', { cache: 'no-store' }),
        fetch('/api/admin/agent/settings', { cache: 'no-store' }),
      ]);
      if (syncRes.ok) {
        const syncData = await syncRes.json();
        setKbStats(syncData);
      }
      if (notesRes.ok) {
        const notesData = await notesRes.json();
        setQuickNotes(notesData.notes || []);
      }
      if (agentRes.ok) {
        const agentData = await agentRes.json();
        setGeminiKeyConfigured(Boolean(agentData.geminiKeyConfigured));
        setGeminiKeySource(agentData.geminiKeySource || 'NONE');
        setGeminiKeyMasked(agentData.geminiKeyMasked || '');
        setLapaqApiKeyConfigured(Boolean(agentData.lapaqApiKeyConfigured));
        setLapaqKeySource(agentData.lapaqKeySource || 'NONE');
        setLapaqKeyMasked(agentData.lapaqKeyMasked || '');
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const tabParam = searchParams.get('tab') as SettingsTab | null;
    if (tabParam && ['agent', 'guardrail', 'sla', 'waha', 'tags'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/settings', { cache: 'no-store' }).then((r) => r.json()),
      fetchKnowledgeMeta(),
    ])
      .then(([data]) => {
        const s = data?.settings;
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

        if (s.agentConfig) {
          setMasterSwitch(s.agentConfig.masterSwitch || 'OFF');
          setDefaultChatAgentMode(
            s.agentConfig.defaultChatAgentMode === 'HUMAN_TAKEOVER'
              ? 'HUMAN_TAKEOVER'
              : 'AI_ACTIVE'
          );
          setAgentName(s.agentConfig.agentName || 'Rani');
          setDebounceMs(s.agentConfig.debounceMs || 5000);
          setMaxDailyAiTurnsPerChat(s.agentConfig.maxDailyAiTurnsPerChat || 40);
          setPrimaryModel(s.agentConfig.primaryModel || 'gemini-3.8-flash');
          setFallbackProModel(s.agentConfig.fallbackProModel || 'gemini-4-argon');
          setLiteModel(s.agentConfig.liteModel || 'gemini-3.5-flash-lite');
          setEmbeddingModel(s.agentConfig.embeddingModel || 'gemini-embedding-2');
          setLapaqConnectorMode(s.agentConfig.lapaqConnectorMode || 'STANDALONE');
          setLapaqInternalApiUrl(s.agentConfig.lapaqInternalApiUrl || '');
          setAutoFollowupOnIssueResolved(Boolean(s.agentConfig.autoFollowupOnIssueResolved));
        }
      })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [fetchKnowledgeMeta]);

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
          agentConfig: {
            masterSwitch,
            defaultChatAgentMode,
            agentName,
            debounceMs,
            maxDailyAiTurnsPerChat,
            primaryModel,
            fallbackProModel,
            liteModel,
            embeddingModel,
            lapaqConnectorMode,
            lapaqInternalApiUrl,
            autoFollowupOnIssueResolved,
          },
          ...(geminiKeyInput.trim() ? { geminiApiKey: geminiKeyInput.trim() } : {}),
          ...(internalCsKeyInput.trim() ? { internalCsApiKey: internalCsKeyInput.trim() } : {}),
        }),
      });
      if (!res.ok) throw new Error('Gagal menyimpan pengaturan');
      if (geminiKeyInput.trim() || internalCsKeyInput.trim()) {
        setGeminiKeyInput('');
        setInternalCsKeyInput('');
        await fetchKnowledgeMeta();
      }
      await refreshWorkspaceMeta();
      notify('Pengaturan sistem & Agentic CS berhasil disimpan');
    } catch (err: any) {
      notify(err.message || 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveApiKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingKeys) return;
    if (!geminiKeyInput.trim() && !internalCsKeyInput.trim()) {
      setKeyStatusMsg({
        ok: false,
        text: 'Masukkan kunci API Gemini baru terlebih dahulu sebelum menekan Simpan Kunci.',
      });
      return;
    }

    setSavingKeys(true);
    setKeyStatusMsg(null);
    try {
      const res = await fetch('/api/admin/agent/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(geminiKeyInput.trim() ? { geminiApiKey: geminiKeyInput.trim() } : {}),
          ...(internalCsKeyInput.trim() ? { internalCsApiKey: internalCsKeyInput.trim() } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan kunci API');
      setGeminiKeyInput('');
      setInternalCsKeyInput('');
      await fetchKnowledgeMeta();
      setKeyStatusMsg({
        ok: true,
        text: 'Kunci API berhasil dienkripsi dan diaktifkan tanpa perlu restart server.',
      });
      notify('Kunci API Gemini berhasil disimpan & diaktifkan');
    } catch (err: any) {
      setKeyStatusMsg({ ok: false, text: err.message || 'Gagal menyimpan kunci API' });
    } finally {
      setSavingKeys(false);
    }
  };

  const handleTestGeminiConnection = async () => {
    if (testingKey) return;
    setTestingKey(true);
    setKeyStatusMsg(null);
    try {
      const res = await fetch('/api/admin/agent/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          geminiApiKey: geminiKeyInput.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verifikasi kunci gagal');
      setKeyStatusMsg({ ok: true, text: data.message });
      notify('Koneksi Google Gemini API terverifikasi!');
    } catch (err: any) {
      setKeyStatusMsg({ ok: false, text: err.message || 'Verifikasi kunci gagal' });
    } finally {
      setTestingKey(false);
    }
  };

  const handleClearSavedGeminiKey = async () => {
    setSavingKeys(true);
    setKeyStatusMsg(null);
    try {
      const res = await fetch('/api/admin/agent/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clearGeminiKey: true }),
      });
      if (!res.ok) throw new Error('Gagal menghapus kunci tersimpan');
      await fetchKnowledgeMeta();
      setKeyStatusMsg({
        ok: true,
        text: 'Kunci API di database telah dihapus.',
      });
      notify('Kunci Gemini tersimpan dihapus');
    } catch (err: any) {
      setKeyStatusMsg({ ok: false, text: err.message });
    } finally {
      setSavingKeys(false);
    }
  };

  const handleSyncOnlineKnowledge = async () => {
    if (syncingKb) return;
    setSyncingKb(true);
    try {
      const res = await fetch('/api/admin/agent/knowledge/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ includeOnline: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyinkronkan pengetahuan');
      await fetchKnowledgeMeta();
      notify(
        `Sinkronisasi selesai: ${data.report?.totalActiveChunks ?? 0} dokumen aktif (${data.report?.onlineSynced ?? 0} tutorial cs.lapaq.id)`
      );
    } catch (err: any) {
      notify(err.message || 'Gagal sinkronisasi pengetahuan');
    } finally {
      setSyncingKb(false);
    }
  };

  const handleUploadBundleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || uploadingBundle) return;

    setUploadingBundle(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/admin/agent/knowledge/upload-bundle', {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal mengunggah bundle pengetahuan');
      await fetchKnowledgeMeta();
      notify(
        `Bundle berhasil diunggah (${data.totalChunks} item diekstrak, ${data.upserted} diperbarui)`
      );
    } catch (err: any) {
      notify(err.message || 'Gagal mengunggah bundle');
    } finally {
      setUploadingBundle(false);
    }
  };

  const handleSaveQuickNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingNote) return;
    if (!noteTitle.trim() || !noteContent.trim()) {
      notify('Judul dan isi catatan pengetahuan wajib diisi');
      return;
    }

    setSavingNote(true);
    try {
      const res = await fetch('/api/admin/agent/knowledge/quick-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceKey: noteSourceKey || undefined,
          title: noteTitle.trim(),
          category: noteCategory.trim() || 'Pengumuman',
          content: noteContent.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan catatan');
      setNoteSourceKey('');
      setNoteTitle('');
      setNoteContent('');
      await fetchKnowledgeMeta();
      notify('Catatan pengetahuan cepat berhasil disimpan');
    } catch (err: any) {
      notify(err.message || 'Gagal menyimpan catatan');
    } finally {
      setSavingNote(false);
    }
  };

  const handleDeleteQuickNote = async (id: string) => {
    try {
      const res = await fetch(
        `/api/admin/agent/knowledge/quick-notes?id=${encodeURIComponent(id)}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error('Gagal menghapus catatan');
      await fetchKnowledgeMeta();
      notify('Catatan pengetahuan dihapus');
    } catch (err: any) {
      notify(err.message || 'Gagal menghapus catatan');
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
    { id: 'agent', label: 'Agentic CS & Pengetahuan' },
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
            Konfigurasi persona & model Agentic CS Lapaq, basis pengetahuan RAG, guardrail anti-ban, dan jam operasional.
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

      <div className="p-4 md:p-7 max-w-[1140px] w-full mx-auto">
        {loading ? (
          <div className="py-16 text-center text-xs text-[#809AA8]">
            <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
            Memuat pengaturan...
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-[232px_1fr] gap-5 items-start">
            {/* Tab Navigation */}
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
            <div className="space-y-5">
              {activeTab === 'agent' && (
                <>
                  {/* Card 0: Form Input Kunci API Gemini (Encrypted AES-256-GCM) */}
                  <div className="bg-white border border-[#D1DEE5] rounded-lg shadow-[0_1px_2px_rgba(17,24,39,0.04)] overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-[#E8EFF3] flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h2
                          id="gemini-keys-heading"
                          className="text-[13.5px] font-bold text-[#0F232E] flex items-center gap-1.5"
                        >
                          <KeyRound className="w-4 h-4 text-[#00688E]" />
                          <span>Kunci API Google Gemini & Kredensial Bridge</span>
                        </h2>
                        <p className="text-[11.5px] text-[#5C7685]">
                          Disimpan terenkripsi (AES-256-GCM) di server, tidak pernah dikirim balik ke browser, dan langsung aktif tanpa restart
                        </p>
                      </div>

                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded border text-[11px] font-semibold ${
                          geminiKeyConfigured
                            ? 'bg-[#E7F8F1] text-[#0D6945] border-[#A7E7CB]'
                            : 'bg-[#FDECEC] text-[#9E1F23] border-[#F7B4B6]'
                        }`}
                      >
                        {geminiKeyConfigured ? (
                          <CheckCircle2 className="w-3 h-3" />
                        ) : (
                          <AlertCircle className="w-3 h-3" />
                        )}
                        <span>
                          {geminiKeyConfigured
                            ? `Aktif (${geminiKeySource === 'DB' ? 'Pengaturan UI' : '.env'}: ${geminiKeyMasked})`
                            : 'GEMINI_API_KEY Belum Diisi'}
                        </span>
                      </span>
                    </div>

                    <form
                      method="POST"
                      action="/api/admin/agent/settings"
                      aria-labelledby="gemini-keys-heading"
                      onSubmit={handleSaveApiKeys}
                      className="p-5 space-y-4"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label
                            htmlFor="gemini-api-key"
                            className="block text-xs font-semibold text-[#0F232E] mb-1"
                          >
                            Google Gemini API Key
                          </label>
                          <div className="relative flex items-center">
                            <input
                              id="gemini-api-key"
                              name="geminiApiKey"
                              type={showGeminiKey ? 'text' : 'password'}
                              value={geminiKeyInput}
                              onChange={(e) => {
                                setGeminiKeyInput(e.target.value);
                                if (keyStatusMsg && !keyStatusMsg.ok) setKeyStatusMsg(null);
                              }}
                              autoComplete="new-password"
                              autoCorrect="off"
                              autoCapitalize="none"
                              spellCheck={false}
                              aria-describedby="gemini-key-help"
                              placeholder={
                                geminiKeyConfigured
                                  ? `Tersimpan: ${geminiKeyMasked} (isi untuk mengganti)`
                                  : 'Tempel kunci AIzaSy... dari Google AI Studio'
                              }
                              className="w-full h-9 pl-3 pr-9 border border-[#B0C4CF] rounded-md text-xs font-mono text-[#0F232E] placeholder-[#809AA8] focus:outline-none focus:border-[#00688E]"
                            />
                            <button
                              type="button"
                              aria-pressed={showGeminiKey}
                              aria-label={
                                showGeminiKey
                                  ? 'Sembunyikan kunci API Gemini'
                                  : 'Tampilkan kunci API Gemini'
                              }
                              onClick={() => setShowGeminiKey((v) => !v)}
                              className="absolute right-2 p-1 text-[#5C7685] hover:text-[#0F232E] cursor-pointer"
                            >
                              {showGeminiKey ? (
                                <EyeOff className="w-4 h-4" />
                              ) : (
                                <Eye className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                          <p id="gemini-key-help" className="text-[11px] text-[#5C7685] mt-1">
                            Digunakan untuk percakapan Agentic CS dan pembuatan embedding vektor 768d.
                          </p>
                        </div>

                        <div>
                          <label
                            htmlFor="internal-cs-api-key"
                            className="block text-xs font-semibold text-[#0F232E] mb-1"
                          >
                            Internal Lapaq Bridge Key (Opsional)
                          </label>
                          <div className="relative flex items-center">
                            <input
                              id="internal-cs-api-key"
                              name="internalCsApiKey"
                              type={showInternalCsKey ? 'text' : 'password'}
                              value={internalCsKeyInput}
                              onChange={(e) => setInternalCsKeyInput(e.target.value)}
                              autoComplete="new-password"
                              autoCorrect="off"
                              autoCapitalize="none"
                              spellCheck={false}
                              aria-describedby="internal-key-help"
                              placeholder={
                                lapaqApiKeyConfigured
                                  ? `Tersimpan: ${lapaqKeyMasked} (isi untuk mengganti)`
                                  : 'Kosongkan jika menggunakan mode STANDALONE'
                              }
                              className="w-full h-9 pl-3 pr-9 border border-[#B0C4CF] rounded-md text-xs font-mono text-[#0F232E] placeholder-[#809AA8] focus:outline-none focus:border-[#00688E]"
                            />
                            <button
                              type="button"
                              aria-pressed={showInternalCsKey}
                              aria-label={
                                showInternalCsKey
                                  ? 'Sembunyikan kunci Bridge Lapaq'
                                  : 'Tampilkan kunci Bridge Lapaq'
                              }
                              onClick={() => setShowInternalCsKey((v) => !v)}
                              className="absolute right-2 p-1 text-[#5C7685] hover:text-[#0F232E] cursor-pointer"
                            >
                              {showInternalCsKey ? (
                                <EyeOff className="w-4 h-4" />
                              ) : (
                                <Eye className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                          <p id="internal-key-help" className="text-[11px] text-[#5C7685] mt-1">
                            Hanya diperlukan saat menghubungkan ke endpoint diagnostik SANDBOX / PRODUCTION Lapaq.
                          </p>
                        </div>
                      </div>

                      {keyStatusMsg && (
                        <div
                          role="status"
                          className={`px-3 py-2 rounded-md border text-xs font-medium ${
                            keyStatusMsg.ok
                              ? 'bg-[#E7F8F1] border-[#A7E7CB] text-[#0D6945]'
                              : 'bg-[#FDECEC] border-[#F7B4B6] text-[#9E1F23]'
                          }`}
                        >
                          {keyStatusMsg.text}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="submit"
                            disabled={savingKeys}
                            className="h-8 px-3.5 bg-[#00688E] hover:bg-[#005575] disabled:opacity-50 text-white text-xs font-semibold rounded-md inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            {savingKeys ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Save className="w-3.5 h-3.5" />
                            )}
                            <span>Simpan Kunci API</span>
                          </button>

                          <button
                            type="button"
                            disabled={testingKey || (!geminiKeyConfigured && !geminiKeyInput.trim())}
                            onClick={handleTestGeminiConnection}
                            className="h-8 px-3 bg-white hover:bg-[#ECF6FA] disabled:opacity-45 border border-[#B0C4CF] text-[#0F232E] text-xs font-semibold rounded-md inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            {testingKey ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5 text-[#00688E]" />
                            )}
                            <span>Tes Koneksi Gemini</span>
                          </button>
                        </div>

                        {geminiKeySource === 'DB' && (
                          <button
                            type="button"
                            disabled={savingKeys}
                            onClick={handleClearSavedGeminiKey}
                            className="h-8 px-2.5 text-xs font-semibold text-[#9E1F23] hover:bg-[#FDECEC] rounded-md inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Hapus Kunci Tersimpan</span>
                          </button>
                        )}
                      </div>
                    </form>
                  </div>

                  {/* Card 1: Saklar Master, Persona & Orkestrasi Model Gemini */}
                  <div className="bg-white border border-[#D1DEE5] rounded-lg shadow-[0_1px_2px_rgba(17,24,39,0.04)] overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-[#E8EFF3] flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h2 className="text-[13.5px] font-bold text-[#0F232E] flex items-center gap-1.5">
                          <Bot className="w-4 h-4 text-[#00688E]" />
                          <span>Saklar Utama, Persona & Model Gemini</span>
                        </h2>
                        <p className="text-[11.5px] text-[#5C7685]">
                          Atur kapan Agent AI aktif menjawab WhatsApp serta pemilihan model aktif Google Gemini
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10.5px] font-semibold ${
                            geminiKeyConfigured
                              ? 'bg-[#E7F8F1] text-[#0D6945] border-[#A7E7CB]'
                              : 'bg-[#FDECEC] text-[#9E1F23] border-[#F7B4B6]'
                          }`}
                        >
                          {geminiKeyConfigured ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : (
                            <AlertCircle className="w-3 h-3" />
                          )}
                          <span>GEMINI_API_KEY {geminiKeyConfigured ? 'Aktif' : 'Belum Diisi'}</span>
                        </span>
                      </div>
                    </div>

                    <div className="divide-y divide-[#E8EFF3]">
                      <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="text-[13px] font-semibold text-[#0F232E]">
                            Saklar Utama Agentic CS (Master Switch)
                          </div>
                          <div className="text-[11.5px] text-[#5C7685] mt-0.5">
                            Saat OFF, tidak ada pemanggilan LLM maupun jeda debounce pada pesan masuk.
                          </div>
                        </div>
                        <Select
                          value={masterSwitch}
                          onChange={(v) => {
                            const next = v as BotMasterSwitch;
                            setMasterSwitch(next);
                            void fetch('/api/admin/agent/settings', {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ masterSwitch: next }),
                            }).then(() => {
                              void refreshWorkspaceMeta();
                              notify(`Saklar Utama Agentic CS: ${next}`);
                            });
                          }}
                          className="w-full sm:w-64 h-9 px-2.5 border border-[#B0C4CF] rounded-md text-xs bg-white"
                        >
                          <option value="OFF">OFF — Manual Penuh (Nonaktif)</option>
                          <option value="ON_ALWAYS">ON Penuh — Aktif 24 Jam</option>
                          <option value="ON_OUTSIDE_HOURS">ON di Luar Jam Kerja WIB</option>
                        </Select>
                      </div>

                      <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="text-[13px] font-semibold text-[#0F232E]">
                            Mode Bawaan untuk Chat Masuk Baru
                          </div>
                          <div className="text-[11.5px] text-[#5C7685] mt-0.5">
                            Pilih apakah semua chat baru otomatis memakai AI, atau default Tanpa AI sehingga Anda memilih sendiri chat mana yang memakai AI di Inbox.
                          </div>
                        </div>
                        <Select
                          value={defaultChatAgentMode}
                          onChange={(v) => setDefaultChatAgentMode(v as DefaultChatAgentMode)}
                          className="w-full sm:w-72 h-9 px-2.5 border border-[#B0C4CF] rounded-md text-xs bg-white"
                        >
                          <option value="AI_ACTIVE">Otomatis Pakai AI (Bisa dimatikan per chat)</option>
                          <option value="HUMAN_TAKEOVER">Default Tanpa AI (Pilih chat manual di Inbox)</option>
                        </Select>
                      </div>

                      <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-[#0F232E] mb-1">
                            Nama Persona CS
                          </label>
                          <input
                            type="text"
                            value={agentName}
                            onChange={(e) => setAgentName(e.target.value)}
                            placeholder="Rani"
                            className="w-full h-9 px-3 border border-[#B0C4CF] rounded-md text-xs focus:outline-none focus:border-[#00688E]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-[#0F232E] mb-1">
                            Jeda Kumpul Chat / Debounce (ms)
                          </label>
                          <input
                            type="number"
                            min={1000}
                            max={20000}
                            step={500}
                            value={debounceMs}
                            onChange={(e) => setDebounceMs(Number(e.target.value) || 5000)}
                            className="w-full h-9 px-3 border border-[#B0C4CF] rounded-md text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-[#0F232E] mb-1">
                            Batas Balasan AI / Chat / Hari
                          </label>
                          <input
                            type="number"
                            min={5}
                            max={500}
                            value={maxDailyAiTurnsPerChat}
                            onChange={(e) =>
                              setMaxDailyAiTurnsPerChat(Number(e.target.value) || 40)
                            }
                            className="w-full h-9 px-3 border border-[#B0C4CF] rounded-md text-xs font-mono"
                          />
                        </div>
                      </div>

                      <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-[#0F232E] mb-1">
                            Model Utama Percakapan
                          </label>
                          <Select
                            value={primaryModel}
                            onChange={(v) => setPrimaryModel(v)}
                            className="w-full h-9 px-2.5 border border-[#B0C4CF] rounded-md text-xs bg-white"
                          >
                            <option value="gemini-3.6-flash">gemini-3.6-flash (Rekomendasi — Cepat & Stabil)</option>
                            <option value="gemini-3.5-flash">gemini-3.5-flash (Ultra Cepat &lt;1d)</option>
                            <option value="gemini-3.8-flash">gemini-3.8-flash (Auto-Fallback bila 503)</option>
                            <option value="gemini-4-hydrogen">gemini-4-hydrogen (Gen-4 Cepat)</option>
                          </Select>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-[#0F232E] mb-1">
                            Model Eskalasi / Multimodal
                          </label>
                          <Select
                            value={fallbackProModel}
                            onChange={(v) => setFallbackProModel(v)}
                            className="w-full h-9 px-2.5 border border-[#B0C4CF] rounded-md text-xs bg-white"
                          >
                            <option value="gemini-3.6-flash">gemini-3.6-flash (Stabil Free &amp; Paid Tier)</option>
                            <option value="gemini-4-argon">gemini-4-argon (Penalaran Dalam — Paid)</option>
                            <option value="gemini-4-carbon">gemini-4-carbon (Kompleks — Paid)</option>
                          </Select>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-[#0F232E] mb-1">
                            Model Ringan &amp; Embedding
                          </label>
                          <Select
                            value={liteModel}
                            onChange={(v) => setLiteModel(v)}
                            className="w-full h-9 px-2.5 border border-[#B0C4CF] rounded-md text-xs bg-white"
                          >
                            <option value="gemini-3.5-flash-lite">gemini-3.5-flash-lite</option>
                            <option value="gemini-3.5-flash">gemini-3.5-flash</option>
                            <option value="gemini-3.6-flash">gemini-3.6-flash</option>
                          </Select>
                          <div className="text-[10.5px] font-mono text-[#809AA8] mt-1">
                            Vektor: {embeddingModel} (768d)
                          </div>
                        </div>
                      </div>

                      <div className="px-5 py-4 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <div className="text-[13px] font-semibold text-[#0F232E]">
                              Jembatan Diagnostik Lapaq (Zero-Secret Bridge)
                            </div>
                            <div className="text-[11.5px] text-[#5C7685] mt-0.5">
                              Mode STANDALONE berjalan mandiri di VPS tanpa koneksi API internal Lapaq.
                            </div>
                          </div>
                          <Select
                            value={lapaqConnectorMode}
                            onChange={(v) => setLapaqConnectorMode(v as LapaqConnectorMode)}
                            className="w-full sm:w-56 h-9 px-2.5 border border-[#B0C4CF] rounded-md text-xs bg-white"
                          >
                            <option value="STANDALONE">STANDALONE (Mandiri VPS)</option>
                            <option value="SANDBOX_API">SANDBOX_API (Uji Lokal)</option>
                            <option value="PRODUCTION_API">PRODUCTION_API (Live)</option>
                          </Select>
                        </div>

                        {lapaqConnectorMode !== 'STANDALONE' && (
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                            <input
                              type="url"
                              value={lapaqInternalApiUrl}
                              onChange={(e) => setLapaqInternalApiUrl(e.target.value)}
                              placeholder="https://lapaq.id atau http://localhost:3005"
                              className="flex-1 h-9 px-3 border border-[#B0C4CF] rounded-md text-xs font-mono focus:outline-none focus:border-[#00688E]"
                            />
                            <span
                              className={`text-[11px] font-semibold px-2.5 py-1.5 rounded border shrink-0 ${
                                lapaqApiKeyConfigured
                                  ? 'bg-[#E7F8F1] text-[#0D6945] border-[#A7E7CB]'
                                  : 'bg-[#FEF5E4] text-[#8F5A05] border-[#F7D488]'
                              }`}
                            >
                              INTERNAL_CS_API_KEY: {lapaqApiKeyConfigured ? 'Siap' : 'Belum Diatur'}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="px-5 py-4 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[13px] font-semibold text-[#0F232E]">
                            Otomatis Kabari Merchant Saat Tiket Diselesaikan
                          </div>
                          <div className="text-[11.5px] text-[#5C7685] mt-0.5">
                            Jika aktif, tiket yang memiliki persetujuan follow-up otomatis dikabari via WA saat ditandai selesai.
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer shrink-0">
                          <input
                            type="checkbox"
                            checked={autoFollowupOnIssueResolved}
                            onChange={(e) => setAutoFollowupOnIssueResolved(e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-[#B0C4CF] peer-checked:bg-[#00688E] rounded-full transition after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:w-4 after:h-4 after:bg-white after:rounded-full after:transition-all peer-checked:after:translate-x-4" />
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Card 2: 3-Path Knowledge Base Studio */}
                  <div className="bg-white border border-[#D1DEE5] rounded-lg shadow-[0_1px_2px_rgba(17,24,39,0.04)] overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-[#E8EFF3] flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h2 className="text-[13.5px] font-bold text-[#0F232E] flex items-center gap-1.5">
                          <BookOpen className="w-4 h-4 text-[#00688E]" />
                          <span>Basis Pengetahuan Lapaq (3 Jalur Tanpa Rebuild VPS)</span>
                        </h2>
                        <p className="text-[11.5px] text-[#5C7685]">
                          Seluruh dokumen otomatis disanitasi dari nama vendor pembayaran/kurir internal sebelum masuk ke pgvector
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={syncingKb}
                          onClick={handleSyncOnlineKnowledge}
                          className="h-8 px-3 bg-[#ECF6FA] hover:bg-[#D3EBF3] border border-[#A7D6E7] text-[#00688E] text-xs font-semibold rounded-md inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${syncingKb ? 'animate-spin' : ''}`} />
                          <span>{syncingKb ? 'Menyinkronkan...' : 'Sync Tutorial cs.lapaq.id'}</span>
                        </button>

                        <button
                          type="button"
                          disabled={uploadingBundle}
                          onClick={() => bundleInputRef.current?.click()}
                          className="h-8 px-3 bg-white hover:bg-[#F4F8FA] border border-[#B0C4CF] text-[#0F232E] text-xs font-semibold rounded-md inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          {uploadingBundle ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Upload className="w-3.5 h-3.5" />
                          )}
                          <span>Upload Bundle JSON</span>
                        </button>
                        <input
                          ref={bundleInputRef}
                          type="file"
                          accept=".json,application/json"
                          onChange={handleUploadBundleFile}
                          className="hidden"
                        />
                      </div>
                    </div>

                    <div className="p-5 space-y-5">
                      {/* Stats Strip */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="p-3 rounded-lg bg-[#F4F8FA] border border-[#E8EFF3]">
                          <div className="text-[11px] font-semibold text-[#5C7685]">
                            Dokumen Pengetahuan Aktif
                          </div>
                          <div className="text-xl font-bold text-[#0F232E] tabular-nums mt-0.5">
                            {kbStats?.totalActiveChunks ?? 0}
                          </div>
                          <div className="text-[10.5px] text-[#809AA8] mt-0.5">
                            {kbStats?.bySourceType
                              ?.map((s) => `${s.sourceType}: ${s.count}`)
                              .join(' • ') || 'Memuat rincian...'}
                          </div>
                        </div>

                        <div className="p-3 rounded-lg bg-[#F4F8FA] border border-[#E8EFF3]">
                          <div className="text-[11px] font-semibold text-[#5C7685]">
                            Status Embedding pgvector
                          </div>
                          <div className="text-xl font-bold text-[#00688E] tabular-nums mt-0.5">
                            {kbStats?.vectorizedChunks ?? 0} / {kbStats?.totalActiveChunks ?? 0}
                          </div>
                          <div className="text-[10.5px] text-[#809AA8] mt-0.5">
                            Hibrida semantik + kata kunci aktif
                          </div>
                        </div>

                        <div className="p-3 rounded-lg bg-[#F4F8FA] border border-[#E8EFF3]">
                          <div className="text-[11px] font-semibold text-[#5C7685]">
                            Bundle Kode Lapaq Terpasang
                          </div>
                          <div className="text-sm font-bold text-[#0F232E] mt-1">
                            {kbStats?.bundle?.exists
                              ? `${kbStats.bundle.totalChunks ?? 0} chunk kode`
                              : 'Belum ada file bundle'}
                          </div>
                          <div className="text-[10.5px] text-[#809AA8] mt-0.5 truncate">
                            {kbStats?.bundle?.generatedAt
                              ? `Ekstrak: ${new Date(kbStats.bundle.generatedAt).toLocaleDateString('id-ID', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                })}`
                              : 'Jalankan npm run kb:extract-lapaq'}
                          </div>
                        </div>
                      </div>

                      {/* Quick Knowledge Notes CRUD */}
                      <div className="border-t border-[#E8EFF3] pt-4 space-y-3">
                        <div>
                          <h3 className="text-xs font-bold text-[#0F232E]">
                            Catatan Pengetahuan Cepat (Quick Knowledge)
                          </h3>
                          <p className="text-[11px] text-[#5C7685]">
                            Tambahkan pengumuman promo, perubahan aturan, atau panduan baru secara instan tanpa perlu menyentuh kode.
                          </p>
                        </div>

                        <form onSubmit={handleSaveQuickNote} className="space-y-2.5 bg-[#F4F8FA] p-3.5 rounded-lg border border-[#E8EFF3]">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            <div className="sm:col-span-2">
                              <input
                                type="text"
                                value={noteTitle}
                                onChange={(e) => setNoteTitle(e.target.value)}
                                placeholder="Judul pengetahuan (mis. Ketentuan Promo Gratis Trial)"
                                className="w-full h-8 px-3 bg-white border border-[#B0C4CF] rounded-md text-xs focus:outline-none focus:border-[#00688E]"
                              />
                            </div>
                            <Select
                              value={noteCategory}
                              onChange={(v) => setNoteCategory(v)}
                              className="w-full h-8 px-2.5 border border-[#B0C4CF] rounded-md text-xs bg-white"
                            >
                              <option value="Pengumuman">Pengumuman</option>
                              <option value="Panduan Fitur">Panduan Fitur</option>
                              <option value="Info Gangguan">Info Gangguan</option>
                              <option value="Kebijakan">Kebijakan</option>
                            </Select>
                          </div>

                          <textarea
                            rows={2}
                            value={noteContent}
                            onChange={(e) => setNoteContent(e.target.value)}
                            placeholder="Tulis informasi resmi Lapaq yang perlu langsung diketahui Agent..."
                            className="w-full p-2.5 bg-white border border-[#B0C4CF] rounded-md text-xs focus:outline-none focus:border-[#00688E]"
                          />

                          <div className="flex items-center justify-between gap-2">
                            {noteSourceKey ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setNoteSourceKey('');
                                  setNoteTitle('');
                                  setNoteContent('');
                                }}
                                className="text-[11px] font-semibold text-[#5C7685] hover:underline cursor-pointer"
                              >
                                Batal Edit Catatan
                              </button>
                            ) : (
                              <span className="text-[11px] text-[#809AA8]">
                                Langsung diindeks ke basis pengetahuan Agent
                              </span>
                            )}

                            <button
                              type="submit"
                              disabled={savingNote}
                              className="h-8 px-3 bg-[#00688E] hover:bg-[#005575] disabled:opacity-50 text-white text-xs font-semibold rounded-md inline-flex items-center gap-1 cursor-pointer"
                            >
                              {savingNote ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Plus className="w-3.5 h-3.5" />
                              )}
                              <span>{noteSourceKey ? 'Simpan Perubahan' : 'Tambah Catatan'}</span>
                            </button>
                          </div>
                        </form>

                        {quickNotes.length > 0 && (
                          <div className="divide-y divide-[#E8EFF3] border border-[#E8EFF3] rounded-lg">
                            {quickNotes.map((n) => (
                              <div
                                key={n.id}
                                className="p-3 flex items-start justify-between gap-3 hover:bg-[#FAFBFB]"
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-[#0F232E]">
                                      {n.title}
                                    </span>
                                    <span className="px-1.5 py-0.5 rounded bg-[#E8EFF3] text-[#435A68] text-[10px] font-semibold">
                                      {n.category}
                                    </span>
                                  </div>
                                  <p className="text-[11.5px] text-[#435A68] mt-1 whitespace-pre-wrap leading-relaxed">
                                    {n.content}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setNoteSourceKey(n.sourceKey);
                                      setNoteTitle(n.title);
                                      setNoteCategory(n.category);
                                      setNoteContent(n.content);
                                    }}
                                    className="px-2 py-1 text-[11px] font-semibold text-[#00688E] hover:bg-[#ECF6FA] rounded cursor-pointer"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteQuickNote(n.id)}
                                    aria-label={`Hapus catatan ${n.title}`}
                                    className="p-1 text-[#809AA8] hover:text-[#9E1F23] rounded cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {activeTab !== 'agent' && (
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
                            onChange={(e) =>
                              setMaxRecipientsPerCampaign(Number(e.target.value) || 150)
                            }
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
                          Mengatur alert antrean SLA, auto-assign operator, dan jam kerja acuan saklar Agentic CS
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
                          <Select
                            value={assignMode}
                            onChange={(v) => setAssignMode(v as 'MANUAL' | 'ROUND_ROBIN')}
                            className="w-full sm:w-56 h-9 px-2.5 border border-[#B0C4CF] rounded-md text-xs bg-white"
                          >
                            <option value="MANUAL">Manual (Unassigned)</option>
                            <option value="ROUND_ROBIN">Auto-Assign (Round-Robin)</option>
                          </Select>
                        </div>

                        <div className="px-5 py-4 flex items-center justify-between gap-3">
                          <div>
                            <div className="text-[13px] font-semibold text-[#0F232E]">
                              Auto-Reply Statis di Luar Jam Kerja (Saat Bot OFF)
                            </div>
                            <div className="text-[11.5px] text-[#5C7685] mt-0.5">
                              Kirim balasan statis maksimal 1x per 24 jam jika Agentic CS sedang OFF di luar jam kerja.
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
                            <div className="text-[13px] font-semibold text-[#0F232E]">
                              Nama Sesi WAHA
                            </div>
                            <div className="text-[11.5px] text-[#5C7685]">
                              Sesi aktif pada container WAHA.
                            </div>
                          </div>
                          <code className="font-mono text-xs px-2.5 py-1.5 rounded bg-[#F4F8FA] border border-[#D1DEE5]">
                            default
                          </code>
                        </div>
                        <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <div className="text-[13px] font-semibold text-[#0F232E]">
                              Endpoint Webhook
                            </div>
                            <div className="text-[11.5px] text-[#5C7685]">
                              Penerima event pesan masuk & ACK.
                            </div>
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
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminSettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center text-xs text-[#809AA8]">
          Memuat Pengaturan...
        </div>
      }
    >
      <AdminSettingsInner />
    </Suspense>
  );
}
