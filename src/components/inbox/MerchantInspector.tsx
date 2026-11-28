'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Clock,
  Pencil,
  Check,
  Link2,
  Trash2,
  Loader2,
  Plus,
  Copy,
  Bot,
  UserCheck,
} from 'lucide-react';
import { formatDisplayPhone, isLid } from '@/lib/phone';
import { formatAccountDate } from '@/lib/date';
import { useWorkspace } from '../WorkspaceContext';
import Select from '@/components/ui/Select';

interface MerchantInspectorProps {
  chatId: string;
  chatData: any;
  allContacts: any[];
  masterTags: string[];
  isOpenDesktop: boolean;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  onCloseDesktop: () => void;
  onOpenReminderModal: () => void;
  onCompleteReminder: () => Promise<void>;
  onChangeAgentMode?: (mode: 'AI_ACTIVE' | 'HUMAN_TAKEOVER') => Promise<void>;
  onContactUpdated: (updatedContact?: any) => void;
  onMergeSuccess: (targetJid: string) => void;
  onClearChat: (mode: 'clear_messages' | 'delete_chat') => void;
}

export default function MerchantInspector({
  chatId,
  chatData,
  allContacts,
  masterTags,
  isOpenDesktop,
  isOpenMobile,
  onCloseMobile,
  onCloseDesktop,
  onOpenReminderModal,
  onCompleteReminder,
  onChangeAgentMode,
  onContactUpdated,
  onMergeSuccess,
  onClearChat,
}: MerchantInspectorProps) {
  const { notify } = useWorkspace();
  const contact = chatData?.contact || null;

  // Internal Team Notes (Timeline: 3 latest + Save button)
  const [notes, setNotes] = useState<any[]>([]);
  const [notesTotal, setNotesTotal] = useState(0);
  const [showAllNotes, setShowAllNotes] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  // Name / Store edit
  const [editingProfile, setEditingProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editStoreName, setEditStoreName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Tags
  const [addingTag, setAddingTag] = useState(false);
  const [customTag, setCustomTag] = useState('');

  // Merge LID
  const [mergeTargetJid, setMergeTargetJid] = useState('');
  const [merging, setMerging] = useState(false);

  // Delete / Clear Chat
  const [confirmDeleteMode, setConfirmDeleteMode] = useState<'clear_messages' | 'delete_chat' | null>(null);
  const [deletingChat, setDeletingChat] = useState(false);

  const fetchNotes = useCallback(async (contactId: string, all = false) => {
    try {
      const res = await fetch(`/api/contacts/${contactId}/notes?all=${all}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setNotes(data.notes || []);
      setNotesTotal(data.total ?? (data.notes || []).length);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    setShowAllNotes(false);
    setNewNoteText('');
    setEditingProfile(false);
    setAddingTag(false);
    setConfirmDeleteMode(null);
    if (contact?.id) {
      fetchNotes(contact.id, false);
    } else {
      setNotes([]);
      setNotesTotal(0);
    }
  }, [chatId, contact?.id, fetchNotes]);

  const handleSaveNote = async () => {
    const trimmed = newNoteText.trim();
    if (!trimmed || savingNote) return;

    setSavingNote(true);
    try {
      let targetContactId = contact?.id;
      // Ensure contact exists first if this chat has no linked contact yet
      if (!targetContactId) {
        const resC = await fetch('/api/contacts', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jid: chatId, name: chatData?.name || chatId.replace(/@.+$/, '') }),
        });
        const dC = await resC.json();
        targetContactId = dC.contact?.id;
        onContactUpdated(dC.contact);
      }

      if (!targetContactId) {
        notify('Tidak dapat menyimpan catatan untuk obrolan grup');
        return;
      }

      const res = await fetch(`/api/contacts/${targetContactId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: trimmed }),
      });
      if (!res.ok) throw new Error('Gagal menyimpan catatan');

      setNewNoteText('');
      await fetchNotes(targetContactId, showAllNotes);
      notify('Catatan internal tersimpan');
    } catch (err: any) {
      notify(err.message || 'Gagal menyimpan catatan');
    } finally {
      setSavingNote(false);
    }
  };

  const handleToggleAllNotes = async () => {
    if (!contact?.id) return;
    const next = !showAllNotes;
    setShowAllNotes(next);
    await fetchNotes(contact.id, next);
  };

  const currentTags: string[] = (contact?.tags || '')
    .split(',')
    .map((t: string) => t.trim())
    .filter(Boolean);

  const updateTags = async (nextTags: string[]) => {
    const tagString = nextTags.join(', ');
    // Optimistic: reflect the change in the UI immediately
    if (contact) {
      onContactUpdated({ ...contact, tags: tagString });
    }
    try {
      const res = await fetch('/api/contacts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jid: chatId,
          tags: tagString,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memperbarui label');
      onContactUpdated(data.contact);
      return true;
    } catch {
      notify('Gagal memperbarui label');
      onContactUpdated(); // re-sync with server state
      return false;
    }
  };

  const handleAddTag = async (tagValue: string) => {
    const clean = tagValue.trim();
    if (!clean) return;
    if (!currentTags.includes(clean)) {
      const ok = await updateTags([...currentTags, clean]);
      if (ok) notify(`Label "${clean}" ditambahkan`);
    }
    setCustomTag('');
    setAddingTag(false);
  };

  const handleRemoveTag = async (tagValue: string) => {
    const ok = await updateTags(currentTags.filter((t) => t !== tagValue));
    if (ok) notify(`Label "${tagValue}" dihapus`);
  };

  const handleSaveProfile = async () => {
    if (savingProfile) return;
    setSavingProfile(true);
    try {
      const res = await fetch('/api/contacts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jid: chatId,
          name: editName.trim() || undefined,
          storeName: editStoreName.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error('Gagal memperbarui profil');
      setEditingProfile(false);
      onContactUpdated(data.contact);
      notify('Profil merchant diperbarui');
    } catch (err: any) {
      notify(err.message);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleMergeLid = async () => {
    if (!mergeTargetJid || merging) return;
    setMerging(true);
    try {
      const res = await fetch('/api/contacts/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceJid: chatId, targetJid: mergeTargetJid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menggabungkan kontak');
      notify('Kontak LID berhasil digabungkan');
      onMergeSuccess(mergeTargetJid);
    } catch (err: any) {
      notify(err.message);
    } finally {
      setMerging(false);
    }
  };

  const executeClearOrDelete = async () => {
    if (!confirmDeleteMode || deletingChat) return;
    setDeletingChat(true);
    try {
      const res = await fetch(
        `/api/chats?chatId=${encodeURIComponent(chatId)}&mode=${confirmDeleteMode}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error('Gagal menghapus obrolan');
      const mode = confirmDeleteMode;
      setConfirmDeleteMode(null);
      onClearChat(mode);
      notify(mode === 'delete_chat' ? 'Obrolan dihapus' : 'Isi pesan dibersihkan');
    } catch (err: any) {
      notify(err.message);
    } finally {
      setDeletingChat(false);
    }
  };

  const displayPhone = contact?.phone
    ? formatDisplayPhone(contact.phone)
    : formatDisplayPhone(chatId.replace(/@.+$/, ''));
  const isLidChat = isLid(chatId);
  const reminderDue =
    chatData?.reminderAt && new Date(chatData.reminderAt).getTime() <= Date.now();

  const panelClasses = `bg-white border-l border-[#D1DEE5] flex flex-col overflow-hidden transition-all duration-200 ${
    isOpenMobile
      ? 'fixed inset-y-0 right-0 z-50 w-[310px] max-w-[88vw] shadow-2xl flex'
      : isOpenDesktop
      ? 'hidden xl:flex w-[304px] shrink-0'
      : 'hidden'
  }`;

  return (
    <>
      {isOpenMobile && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] xl:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside className={panelClasses}>
        <div className="h-[54px] px-4 border-b border-[#D1DEE5] flex items-center justify-between shrink-0">
          <span className="text-[13.5px] font-bold text-[#0F232E]">Profil Merchant</span>
          <button
            type="button"
            onClick={() => {
              onCloseMobile();
              onCloseDesktop();
            }}
            title="Tutup Panel"
            className="p-1 text-[#5C7685] hover:text-[#0F232E] rounded-md hover:bg-[#ECF6FA] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* 0. Kontrol AI untuk Chat Ini */}
          {!chatData?.isGroup && onChangeAgentMode && (
            <div className="pb-4 border-b border-[#E8EFF3] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#5C7685]">
                  Agentic CS pada Chat Ini
                </span>
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                    chatData?.agentMode === 'HUMAN_TAKEOVER' || chatData?.agentMode === 'WAITING_TECH'
                      ? 'bg-[#F4F8FA] text-[#5C7685] border-[#B0C4CF]'
                      : 'bg-[#E7F8F1] text-[#0D6945] border-[#A7E7CB]'
                  }`}
                >
                  {chatData?.agentMode === 'HUMAN_TAKEOVER'
                    ? 'Nonaktif (Manual)'
                    : chatData?.agentMode === 'WAITING_TECH'
                    ? 'Menunggu Teknis'
                    : 'AI Aktif'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => onChangeAgentMode('AI_ACTIVE')}
                  className={`h-8 px-2 rounded-md border text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    (chatData?.agentMode || 'AI_ACTIVE') === 'AI_ACTIVE' ||
                    chatData?.agentMode === 'STEP_BY_STEP'
                      ? 'bg-[#00688E] border-[#00688E] text-white'
                      : 'bg-white border-[#B0C4CF] text-[#435A68] hover:bg-[#ECF6FA]'
                  }`}
                >
                  <Bot className="w-3.5 h-3.5" />
                  <span>Pakai AI</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeAgentMode('HUMAN_TAKEOVER')}
                  className={`h-8 px-2 rounded-md border text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    chatData?.agentMode === 'HUMAN_TAKEOVER' || chatData?.agentMode === 'WAITING_TECH'
                      ? 'bg-[#0F232E] border-[#0F232E] text-white'
                      : 'bg-white border-[#B0C4CF] text-[#435A68] hover:bg-[#F4F8FA]'
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Tanpa AI</span>
                </button>
              </div>
              <p className="text-[11px] text-[#809AA8] leading-snug">
                Pilih apakah obrolan nomor ini dijawab otomatis oleh Agent AI atau khusus manual oleh operator.
              </p>
            </div>
          )}

          {/* 1. Pengingat Operator */}
          <div className="pb-4 border-b border-[#E8EFF3] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#5C7685]">
                Pengingat Operator
              </span>
              {chatData?.reminderAt && (
                <button
                  type="button"
                  onClick={onOpenReminderModal}
                  className="text-[11px] font-semibold text-[#00688E] hover:underline cursor-pointer"
                >
                  Ubah
                </button>
              )}
            </div>

            {chatData?.reminderAt ? (
              <div
                className={`p-2.5 rounded-md border space-y-1.5 ${
                  reminderDue
                    ? 'bg-[#FDECEC] border-[#F7B4B6]'
                    : 'bg-[#FEF5E4] border-[#F7D488]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-[11.5px] font-bold flex items-center gap-1 tabular-nums ${
                      reminderDue ? 'text-[#9E1F23]' : 'text-[#8F5A05]'
                    }`}
                  >
                    <Clock className="w-3 h-3" />
                    {new Date(chatData.reminderAt).toLocaleString('id-ID', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <button
                    type="button"
                    onClick={onCompleteReminder}
                    className="text-[11px] font-semibold text-[#0F232E] hover:underline cursor-pointer"
                  >
                    Selesai
                  </button>
                </div>
                <p className="text-xs text-[#0F232E] leading-snug">
                  {chatData.reminderNote || 'Follow up merchant'}
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={onOpenReminderModal}
                className="w-full h-8 bg-white hover:bg-[#F4F8FA] border border-[#B0C4CF] text-[#0F232E] text-xs font-semibold rounded-md transition cursor-pointer"
              >
                + Atur Pengingat Follow-Up
              </button>
            )}
          </div>

          {/* 2. Identitas Toko */}
          <div className="pb-4 border-b border-[#E8EFF3] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#5C7685]">
                Identitas Toko
              </span>
              <div className="flex items-center gap-1.5">
                {contact && (
                  <span
                    className={`text-[10.5px] font-semibold px-1.5 py-0.5 rounded border ${
                      contact.isWAUser
                        ? 'bg-[#E7F8F1] text-[#0D6945] border-[#A7E7CB]'
                        : 'bg-[#FEF5E4] text-[#8F5A05] border-[#F7D488]'
                    }`}
                  >
                    {contact.isWAUser ? 'Aktif WA' : 'Unverified'}
                  </span>
                )}
                {!editingProfile && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditName(contact?.name || chatData?.name || '');
                      setEditStoreName(contact?.storeName || '');
                      setEditingProfile(true);
                    }}
                    title="Edit Nama / Toko"
                    className="p-1 text-[#5C7685] hover:text-[#0F232E] rounded hover:bg-[#ECF6FA] cursor-pointer"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {editingProfile ? (
              <div className="space-y-2 bg-[#F4F8FA] p-2.5 rounded-md border border-[#D1DEE5]">
                <div>
                  <label className="text-[11px] text-[#5C7685] block mb-0.5">Nama Toko</label>
                  <input
                    type="text"
                    value={editStoreName}
                    onChange={(e) => setEditStoreName(e.target.value)}
                    className="w-full h-7 px-2 bg-white border border-[#B0C4CF] rounded text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[#5C7685] block mb-0.5">Nama Pemilik</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full h-7 px-2 bg-white border border-[#B0C4CF] rounded text-xs"
                  />
                </div>
                <div className="flex justify-end gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setEditingProfile(false)}
                    className="h-6 px-2 text-[11px] border border-[#B0C4CF] bg-white rounded cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    disabled={savingProfile}
                    onClick={handleSaveProfile}
                    className="h-6 px-2 text-[11px] bg-[#00688E] text-white font-semibold rounded flex items-center gap-1 cursor-pointer"
                  >
                    <Check className="w-3 h-3" /> Simpan
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-[12.5px]">
                <div>
                  <div className="text-[11px] text-[#809AA8]">Nama Toko</div>
                  <div className="font-medium text-[#0F232E]">{contact?.storeName || '—'}</div>
                </div>
                <div>
                  <div className="text-[11px] text-[#809AA8]">Pemilik / Kontak</div>
                  <div className="font-medium text-[#0F232E]">
                    {contact?.name || chatData?.name || '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[#809AA8]">WhatsApp</div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(displayPhone);
                      notify(`Disalin: ${displayPhone}`);
                    }}
                    className="font-mono tabular-nums text-[#00688E] hover:underline font-medium inline-flex items-center gap-1 cursor-pointer"
                  >
                    <span>{displayPhone}</span>
                    <Copy className="w-3 h-3 opacity-60" />
                  </button>
                </div>
                {(contact?.businessCategory || contact?.address) && (
                  <div>
                    <div className="text-[11px] text-[#809AA8]">Kategori & Lokasi</div>
                    <div className="font-medium text-[#0F232E]">
                      {[contact?.businessCategory, contact?.address].filter(Boolean).join(' — ')}
                    </div>
                  </div>
                )}
                {contact?.email && (
                  <div>
                    <div className="text-[11px] text-[#809AA8]">Email</div>
                    <div className="font-medium text-[#0F232E] break-all">{contact.email}</div>
                  </div>
                )}
                {contact?.accountCreatedAt && (
                  <div>
                    <div className="text-[11px] text-[#809AA8]">Bergabung</div>
                    <div className="font-medium text-[#0F232E] tabular-nums">
                      {formatAccountDate(contact.accountCreatedAt)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 3. Label / Tags */}
          <div className="pb-4 border-b border-[#E8EFF3] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#5C7685]">
                Label / Tags
              </span>
              <button
                type="button"
                onClick={() => setAddingTag((v) => !v)}
                className="text-[11px] font-semibold text-[#00688E] hover:underline inline-flex items-center gap-0.5 cursor-pointer"
              >
                <Plus className="w-3 h-3" /> Tambah
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {currentTags.length > 0 ? (
                currentTags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#E8EFF3] border border-[#D1DEE5] text-[11.5px] font-medium text-[#435A68]"
                  >
                    {t}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(t)}
                      className="text-[#809AA8] hover:text-[#9E1F23] cursor-pointer leading-none"
                    >
                      ×
                    </button>
                  </span>
                ))
              ) : (
                <span className="text-xs text-[#809AA8]">Belum ada label</span>
              )}
            </div>

            {addingTag && (
              <div className="pt-1 space-y-2">
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={customTag}
                    onChange={(e) => setCustomTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag(customTag);
                      }
                    }}
                    placeholder="Ketik label..."
                    className="flex-1 h-7 px-2 border border-[#B0C4CF] rounded text-xs focus:outline-none focus:border-[#00688E]"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddTag(customTag)}
                    className="h-7 px-2.5 bg-[#00688E] text-white text-xs font-semibold rounded cursor-pointer"
                  >
                    OK
                  </button>
                </div>
                {masterTags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {masterTags
                      .filter((mt) => !currentTags.includes(mt))
                      .map((mt) => (
                        <button
                          key={mt}
                          type="button"
                          onClick={() => handleAddTag(mt)}
                          className="text-[10.5px] px-1.5 py-0.5 rounded bg-[#ECF6FA] border border-[#A7D6E7] text-[#00688E] font-medium hover:bg-[#D3EBF3] cursor-pointer"
                        >
                          + {mt}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 4. Catatan Internal Tim (Save Button + 3 Catatan Terakhir) */}
          <div className="pb-4 border-b border-[#E8EFF3] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#5C7685]">
                Catatan Internal Tim
              </span>
              <span className="text-[10.5px] text-[#809AA8] tabular-nums">
                {notesTotal} catatan
              </span>
            </div>

            <div className="space-y-1.5">
              <textarea
                rows={2}
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                placeholder="Tulis catatan baru untuk tim..."
                className="w-full p-2 border border-[#B0C4CF] rounded-md text-xs resize-none focus:outline-none focus:border-[#00688E]"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={savingNote || !newNoteText.trim()}
                  onClick={handleSaveNote}
                  className="h-7 px-2.5 bg-[#00688E] hover:bg-[#005575] disabled:opacity-50 text-white text-[11.5px] font-semibold rounded-md inline-flex items-center gap-1 cursor-pointer"
                >
                  {savingNote && <Loader2 className="w-3 h-3 animate-spin" />}
                  <span>Simpan Catatan</span>
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              {notes.length === 0 ? (
                <p className="text-[11.5px] text-[#809AA8]">Belum ada catatan internal.</p>
              ) : (
                notes.map((n) => (
                  <div
                    key={n.id}
                    className="p-2.5 rounded-md bg-[#F4F8FA] border border-[#E8EFF3] space-y-1"
                  >
                    <p className="text-xs text-[#0F232E] leading-snug whitespace-pre-wrap">{n.body}</p>
                    <div className="flex items-center justify-between text-[10.5px] text-[#809AA8]">
                      <span className="font-semibold text-[#435A68]">{n.authorName}</span>
                      <span className="tabular-nums">
                        {new Date(n.createdAt).toLocaleString('id-ID', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                ))
              )}

              {notesTotal > 3 && (
                <button
                  type="button"
                  onClick={handleToggleAllNotes}
                  className="text-[11.5px] font-semibold text-[#00688E] hover:underline cursor-pointer"
                >
                  {showAllNotes ? 'Tampilkan 3 terakhir' : `Lihat semua (${notesTotal} catatan)`}
                </button>
              )}
            </div>
          </div>

          {/* 5. Merge LID (Preserved existing capability) */}
          {isLidChat && (
            <div className="pb-4 border-b border-[#E8EFF3] space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#8F5A05]">
                <Link2 className="w-3.5 h-3.5" />
                <span>Gabungkan LID ke Kontak</span>
              </div>
              <Select
                value={mergeTargetJid}
                onChange={(v) => setMergeTargetJid(v)}
                className="w-full h-8 px-2 border border-[#B0C4CF] rounded-md text-xs bg-white"
              >
                <option value="">Pilih kontak tujuan...</option>
                {allContacts
                  .filter((c) => !isLid(c.jid))
                  .map((c) => (
                    <option key={c.id} value={c.jid}>
                      {c.storeName || c.name || c.phone} ({c.phone})
                    </option>
                  ))}
              </Select>
              <button
                type="button"
                disabled={!mergeTargetJid || merging}
                onClick={handleMergeLid}
                className="w-full h-7 bg-[#00688E] hover:bg-[#005575] disabled:opacity-50 text-white text-xs font-semibold rounded-md cursor-pointer"
              >
                {merging ? 'Menggabungkan...' : 'Gabungkan Obrolan'}
              </button>
            </div>
          )}

          {/* 6. Kelola Obrolan */}
          <div className="space-y-2">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#5C7685] block">
              Kelola Obrolan
            </span>
            {confirmDeleteMode ? (
              <div className="p-2.5 bg-[#FDECEC] border border-[#F7B4B6] rounded-md space-y-2">
                <p className="text-[11.5px] text-[#9E1F23] font-medium">
                  {confirmDeleteMode === 'delete_chat'
                    ? 'Hapus obrolan ini beserta seluruh riwayat pesannya?'
                    : 'Bersihkan semua isi pesan di obrolan ini?'}
                </p>
                <div className="flex justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteMode(null)}
                    className="h-7 px-2.5 bg-white border border-[#B0C4CF] text-xs font-semibold rounded cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    disabled={deletingChat}
                    onClick={executeClearOrDelete}
                    className="h-7 px-2.5 bg-[#9E1F23] text-white text-xs font-semibold rounded cursor-pointer"
                  >
                    {deletingChat ? 'Memproses...' : 'Ya, Lanjutkan'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteMode('clear_messages')}
                  className="flex-1 h-7 px-2 border border-[#B0C4CF] bg-white hover:bg-[#F4F8FA] text-[11.5px] font-medium text-[#435A68] rounded-md cursor-pointer"
                >
                  Bersihkan Pesan
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteMode('delete_chat')}
                  className="h-7 px-2.5 border border-[#F7B4B6] bg-white hover:bg-[#FDECEC] text-[11.5px] font-medium text-[#9E1F23] rounded-md inline-flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" /> Hapus
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
