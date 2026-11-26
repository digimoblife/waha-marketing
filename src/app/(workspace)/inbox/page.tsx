'use client';

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { MessageSquare, Plus, Upload } from 'lucide-react';
import { useWorkspace } from '@/components/WorkspaceContext';
import InboxList, { QuickFilter } from '@/components/inbox/InboxList';
import InboxChatPanel from '@/components/inbox/InboxChatPanel';
import MerchantInspector from '@/components/inbox/MerchantInspector';
import ReminderModal from '@/components/inbox/ReminderModal';
import NewChatModal from '@/components/NewChatModal';
import ImportContactModal from '@/components/ImportContactModal';

function InboxWorkspaceInner() {
  const searchParams = useSearchParams();
  const { currentUser, sessionStatus, openQRModal, refreshWorkspaceMeta, notify } = useWorkspace();

  const [chats, setChats] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [operators, setOperators] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [masterTags, setMasterTags] = useState<string[]>([]);

  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');

  const [inspectorDesktopOpen, setInspectorDesktopOpen] = useState(true);
  const [inspectorMobileOpen, setInspectorMobileOpen] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);

  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isReminderOpen, setIsReminderOpen] = useState(false);

  const activeChatIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeChatIdRef.current = selectedChatId;
  }, [selectedChatId]);

  const fetchChats = useCallback(async () => {
    try {
      const res = await fetch('/api/chats', { cache: 'no-store' });
      const data = await res.json();
      if (data.chats) {
        const dedupedMap = new Map<string, any>();
        for (const chat of data.chats) {
          const canonicalId = (chat.id || '').replace(/@s\.whatsapp\.net$/, '@c.us');
          if (!dedupedMap.has(canonicalId)) {
            dedupedMap.set(canonicalId, { ...chat, id: canonicalId });
          }
        }
        const sorted = Array.from(dedupedMap.values()).sort((a, b) => {
          const tA = new Date(a.lastMessageAt || a.updatedAt || 0).getTime();
          const tB = new Date(b.lastMessageAt || b.updatedAt || 0).getTime();
          return tB - tA;
        });

        setChats((prev) => {
          const next = sorted.map((c: any) =>
            c.id === activeChatIdRef.current ? { ...c, unreadCount: 0 } : c
          );
          const prevKey = prev
            .map((c) => `${c.id}:${c.lastMessage}:${c.unreadCount}:${c.status}:${c.assigneeId}:${c.reminderAt}`)
            .join('|');
          const nextKey = next
            .map((c) => `${c.id}:${c.lastMessage}:${c.unreadCount}:${c.status}:${c.assigneeId}:${c.reminderAt}`)
            .join('|');
          return prevKey === nextKey ? prev : next;
        });
      }
    } catch (err) {
      console.error('Fetch chats error:', err);
    }
  }, []);

  const fetchContacts = useCallback(async () => {
    try {
      const res = await fetch('/api/contacts', { cache: 'no-store' });
      const data = await res.json();
      if (data.contacts) setContacts(data.contacts);
    } catch {
      // ignore
    }
  }, []);

  const fetchAuxData = useCallback(async () => {
    try {
      const [opRes, tplRes, pubRes] = await Promise.all([
        fetch('/api/operators', { cache: 'no-store' }),
        fetch('/api/templates', { cache: 'no-store' }),
        fetch('/api/settings/public', { cache: 'no-store' }),
      ]);
      const [opData, tplData, pubData] = await Promise.all([
        opRes.json(),
        tplRes.json(),
        pubRes.json(),
      ]);
      if (opData.operators) setOperators(opData.operators);
      if (tplData.templates) setTemplates(tplData.templates);
      if (pubData.masterTags) setMasterTags(pubData.masterTags);
    } catch {
      // ignore
    }
  }, []);

  const fetchMessages = useCallback(async (chatId: string, isSilent = false) => {
    if (!isSilent) setLoadingMessages(true);
    try {
      const res = await fetch(`/api/messages?chatId=${encodeURIComponent(chatId)}`, {
        cache: 'no-store',
      });
      const data = await res.json();
      if (activeChatIdRef.current !== chatId) return;

      if (data.messages) {
        setMessages((prev) => {
          const prevKey = prev.map((m) => `${m.id}:${m.ackStatus}:${m.mediaUrl || ''}`).join('|');
          const nextKey = data.messages
            .map((m: any) => `${m.id}:${m.ackStatus}:${m.mediaUrl || ''}`)
            .join('|');
          return prevKey === nextKey ? prev : data.messages;
        });
      }
    } catch (err) {
      console.error('Fetch messages error:', err);
    } finally {
      if (!isSilent && activeChatIdRef.current === chatId) setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    fetchChats();
    fetchContacts();
    fetchAuxData();

    const interval = setInterval(() => {
      fetchChats();
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchChats, fetchContacts, fetchAuxData]);

  useEffect(() => {
    if (!selectedChatId) return;
    fetchMessages(selectedChatId, false);
    const msgInterval = setInterval(() => {
      fetchMessages(selectedChatId, true);
    }, 3000);
    return () => clearInterval(msgInterval);
  }, [selectedChatId, fetchMessages]);

  const handleSelectChat = useCallback(
    async (chatId: string) => {
      activeChatIdRef.current = chatId;
      setSelectedChatId(chatId);
      setMobileChatOpen(true);
      setInspectorMobileOpen(false);
      setMessages([]);
      setChats((prev) =>
        prev.map((c) => (c.id === chatId ? { ...c, unreadCount: 0 } : c))
      );

      try {
        await fetch('/api/chats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId }),
        });
        await fetchChats();
        refreshWorkspaceMeta();
      } catch (err) {
        console.error('Select chat error:', err);
      }
    },
    [fetchChats, refreshWorkspaceMeta]
  );

  // Support deep link ?jid=xxx or ?phone=xxx from Merchants / Overview / Bell
  const jidParam = searchParams.get('jid');
  const phoneParam = searchParams.get('phone');
  useEffect(() => {
    if (jidParam) {
      handleSelectChat(jidParam);
    } else if (phoneParam) {
      const clean = phoneParam.replace(/[^0-9]/g, '');
      const targetJid = clean.endsWith('@c.us') ? clean : `${clean}@c.us`;
      handleSelectChat(targetJid);
    }
  }, [jidParam, phoneParam, handleSelectChat]);

  const patchChatMeta = async (payload: Record<string, any>, toastText?: string) => {
    if (!selectedChatId) return;
    try {
      const res = await fetch('/api/chats', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: selectedChatId, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memperbarui chat');
      if (data.chat) {
        setChats((prev) =>
          prev.map((c) => (c.id === selectedChatId ? { ...c, ...data.chat } : c))
        );
      }
      refreshWorkspaceMeta();
      if (toastText) notify(toastText);
    } catch (err: any) {
      notify(err.message || 'Gagal memperbarui');
    }
  };

  const handleSendMessage = async (payload: {
    text?: string;
    replyTo?: string;
    media?: {
      mediaUrl: string;
      dockerUrl: string;
      mediaType: string;
      fileName: string;
      mimeType: string;
      caption?: string;
    };
  }) => {
    if (!selectedChatId) return;
    const body: any = {
      chatId: selectedChatId,
      text: payload.text,
      replyTo: payload.replyTo,
    };
    if (payload.media) {
      body.mediaUrl = payload.media.mediaUrl;
      body.dockerUrl = payload.media.dockerUrl;
      body.mediaType = payload.media.mediaType;
      body.fileName = payload.media.fileName;
      body.mimeType = payload.media.mimeType;
      body.caption = payload.media.caption;
    }

    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!res.ok || !data.message) {
      throw new Error(data.error || 'Gagal mengirim pesan');
    }

    setMessages((prev) => {
      const newStanza = (data.message.id || '').split('_').pop();
      const exists = prev.some((m) => {
        if (m.id === data.message.id) return true;
        const mStanza = (m.id || '').split('_').pop();
        return newStanza && mStanza && newStanza === mStanza;
      });
      return exists ? prev : [...prev, data.message];
    });
    fetchChats();
  };

  const selectedChatData =
    chats.find((c) => c.id === selectedChatId) ||
    (selectedChatId
      ? {
          id: selectedChatId,
          status: 'OPEN',
          contact: contacts.find((c) => c.jid === selectedChatId),
          name: contacts.find((c) => c.jid === selectedChatId)?.name,
        }
      : null);

  return (
    <div className="flex-1 flex min-h-0 h-full w-full overflow-hidden">
      {/* Column 1: Inbox Conversation List (Full width on mobile when no chat open) */}
      <div className={`${mobileChatOpen ? 'hidden md:flex' : 'flex'} w-full md:w-auto h-full`}>
        <InboxList
          chats={chats}
          selectedChatId={selectedChatId}
          onSelectChat={handleSelectChat}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          quickFilter={quickFilter}
          setQuickFilter={setQuickFilter}
          currentUserId={currentUser?.id}
          onOpenNewChat={() => setIsNewChatOpen(true)}
        />
      </div>

      {/* Column 2 & 3: Chat Canvas + Merchant Inspector */}
      <div className={`${mobileChatOpen ? 'flex' : 'hidden md:flex'} flex-1 min-w-0 h-full`}>
        {selectedChatId && selectedChatData ? (
          <>
            <InboxChatPanel
              key={selectedChatId}
              chatId={selectedChatId}
              chatData={selectedChatData}
              messages={messages}
              loadingMessages={loadingMessages}
              operators={operators}
              templates={templates}
              sessionStatus={sessionStatus}
              onOpenQR={openQRModal}
              onBackMobile={() => setMobileChatOpen(false)}
              onToggleInspector={() => {
                if (typeof window !== 'undefined' && window.innerWidth < 1280) {
                  setInspectorMobileOpen((v) => !v);
                } else {
                  setInspectorDesktopOpen((v) => !v);
                }
              }}
              onChangeAssignee={async (assigneeId) => {
                const op = operators.find((o) => o.id === assigneeId);
                await patchChatMeta(
                  { assigneeId: assigneeId || null },
                  op ? `Obrolan ditugaskan ke ${op.name}` : 'PIC obrolan dikosongkan'
                );
              }}
              onChangeStatus={async (status) => {
                const map: Record<string, string> = {
                  OPEN: 'Open',
                  FOLLOW_UP: 'Follow Up',
                  RESOLVED: 'Selesai',
                };
                await patchChatMeta({ status }, `Status diubah ke ${map[status] || status}`);
              }}
              onCompleteReminder={async () => {
                await patchChatMeta({ clearReminder: true }, 'Pengingat follow-up ditandai selesai');
              }}
              onSendMessage={handleSendMessage}
            />

            <MerchantInspector
              chatId={selectedChatId}
              chatData={selectedChatData}
              allContacts={contacts}
              masterTags={masterTags}
              isOpenDesktop={inspectorDesktopOpen}
              isOpenMobile={inspectorMobileOpen}
              onCloseMobile={() => setInspectorMobileOpen(false)}
              onCloseDesktop={() => setInspectorDesktopOpen(false)}
              onOpenReminderModal={() => setIsReminderOpen(true)}
              onCompleteReminder={async () => {
                await patchChatMeta({ clearReminder: true }, 'Pengingat follow-up ditandai selesai');
              }}
              onContactUpdated={() => {
                fetchContacts();
                fetchChats();
              }}
              onMergeSuccess={(targetJid) => {
                handleSelectChat(targetJid);
                fetchChats();
                fetchContacts();
              }}
              onClearChat={(mode) => {
                if (mode === 'delete_chat') {
                  setSelectedChatId(null);
                  setMobileChatOpen(false);
                }
                setMessages([]);
                fetchChats();
              }}
            />
          </>
        ) : (
          /* Clean Empty State */
          <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#F4F8FA] text-center">
            <div className="max-w-sm space-y-5">
              <div className="w-12 h-12 rounded-xl bg-white border border-[#D1DEE5] shadow-xs flex items-center justify-center mx-auto text-[#00688E]">
                <MessageSquare className="w-6 h-6" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-[16px] font-bold text-[#0F232E] tracking-tight">
                  Pilih Obrolan untuk Memulai
                </h2>
                <p className="text-xs text-[#5C7685] leading-relaxed">
                  Kelola percakapan merchant, atur PIC & status follow-up, sisipkan template{' '}
                  <code className="font-mono text-[#00688E]">/</code>, atau mulai obrolan baru.
                </p>
              </div>
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewChatOpen(true)}
                  className="h-8 px-3 bg-[#00688E] hover:bg-[#005575] text-white text-xs font-semibold rounded-md inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Chat Baru</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsImportOpen(true)}
                  className="h-8 px-3 bg-white hover:bg-[#ECF6FA] border border-[#B0C4CF] text-[#0F232E] text-xs font-semibold rounded-md inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Import CSV</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <ReminderModal
        isOpen={isReminderOpen}
        onClose={() => setIsReminderOpen(false)}
        initialAt={selectedChatData?.reminderAt}
        initialNote={selectedChatData?.reminderNote}
        onSave={async (reminderAt, reminderNote) => {
          await patchChatMeta(
            { reminderAt, reminderNote, status: 'FOLLOW_UP' },
            'Pengingat follow-up tersimpan'
          );
        }}
      />

      <NewChatModal
        isOpen={isNewChatOpen}
        onClose={() => setIsNewChatOpen(false)}
        onChatCreated={(chatId) => {
          fetchContacts();
          handleSelectChat(chatId);
        }}
      />

      <ImportContactModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImportSuccess={() => {
          fetchContacts();
          fetchChats();
        }}
      />
    </div>
  );
}

export default function InboxPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center text-xs text-[#809AA8]">
          Memuat Inbox...
        </div>
      }
    >
      <InboxWorkspaceInner />
    </Suspense>
  );
}
