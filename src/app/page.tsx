'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from '@/components/Sidebar';
import ChatRoom from '@/components/ChatRoom';
import QRModal from '@/components/QRModal';
import NewChatModal from '@/components/NewChatModal';
import ImportContactModal from '@/components/ImportContactModal';
import { MessageSquare, ShieldCheck, Users, Send } from 'lucide-react';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'chats' | 'contacts'>('chats');
  const [chats, setChats] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [isQROpen, setIsQROpen] = useState(false);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);

  // WAHA session status
  const [sessionStatus, setSessionStatus] = useState<string>('OFFLINE');
  const [syncing, setSyncing] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Fetch current user
  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.user) setCurrentUser(data.user);
      })
      .catch(() => null);
  }, []);

  // Fetch session status (silent update)
  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch('/api/session');
      const data = await res.json();
      const newStatus = data.status || 'OFFLINE';
      setSessionStatus((prev) => (prev === newStatus ? prev : newStatus));
    } catch {
      setSessionStatus('OFFLINE');
    }
  }, []);

  // Fetch chats list (only updates state if data actually changed to prevent re-renders)
  const fetchChats = useCallback(async () => {
    try {
      const res = await fetch('/api/chats');
      const data = await res.json();
      if (data.chats) {
        setChats((prev) => {
          const chatsWithActive = data.chats.map((c: any) =>
            c.id === selectedChatId ? { ...c, unreadCount: 0 } : c
          );
          const prevKey = prev.map((c) => `${c.id}-${c.lastMessage}-${c.unreadCount}`).join('|');
          const nextKey = chatsWithActive.map((c: any) => `${c.id}-${c.lastMessage}-${c.unreadCount}`).join('|');
          return prevKey === nextKey ? prev : chatsWithActive;
        });
      }
    } catch (err) {
      console.error('Fetch chats error:', err);
    }
  }, [selectedChatId]);

  // Fetch contacts list (only updates state if data changed)
  const fetchContacts = useCallback(async () => {
    try {
      const res = await fetch('/api/contacts');
      const data = await res.json();
      if (data.contacts) {
        setContacts((prev) => {
          const prevKey = prev
            .map(
              (c) =>
                `${c.id}-${c.name}-${c.phone}-${c.tags}-${c.storeName}-${c.businessCategory}`
            )
            .join('|');
          const nextKey = data.contacts
            .map(
              (c: any) =>
                `${c.id}-${c.name}-${c.phone}-${c.tags}-${c.storeName}-${c.businessCategory}`
            )
            .join('|');
          return prevKey === nextKey ? prev : data.contacts;
        });
      }
    } catch (err) {
      console.error('Fetch contacts error:', err);
    }
  }, []);

  // Fetch messages for selected chat (isSilent avoids flickering on background refresh)
  const fetchMessages = useCallback(async (chatId: string, isSilent = false) => {
    if (!isSilent) setLoadingMessages(true);
    try {
      const res = await fetch(`/api/messages?chatId=${encodeURIComponent(chatId)}`);
      const data = await res.json();
      if (data.messages) {
        setMessages((prev) => {
          // If message list hasn't changed, return prev to prevent re-renders
          if (prev.length === data.messages.length) {
            const prevLast = prev[prev.length - 1];
            const nextLast = data.messages[data.messages.length - 1];
            if (prevLast?.id === nextLast?.id && prevLast?.ackStatus === nextLast?.ackStatus) {
              return prev;
            }
          }
          return data.messages;
        });
      }
    } catch (err) {
      console.error('Fetch messages error:', err);
    } finally {
      if (!isSilent) setLoadingMessages(false);
    }
  }, []);

  // Initial load & background intervals
  useEffect(() => {
    fetchSession();
    fetchChats();
    fetchContacts();

    // Background poll for chats & session every 5s (silent)
    const interval = setInterval(() => {
      fetchSession();
      fetchChats();
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchSession, fetchChats, fetchContacts]);

  // Periodic poll for active chat messages (SILENT in background, NO FLICKER)
  useEffect(() => {
    if (!selectedChatId) return;

    fetchMessages(selectedChatId, false); // initial load with spinner
    const msgInterval = setInterval(() => {
      fetchMessages(selectedChatId, true); // silent background update, no spinner, no flicker
    }, 3000);

    return () => clearInterval(msgInterval);
  }, [selectedChatId, fetchMessages]);

  const handleSelectChat = useCallback(async (chatId: string) => {
    setSelectedChatId(chatId);
    setMessages([]); // clear previous chat immediately
    setActiveTab('chats');
    setChats((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, unreadCount: 0 } : c))
    );

    try {
      await fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId }),
      });
      fetchChats();
      fetchMessages(chatId, false);
    } catch (err) {
      console.error('Select chat error:', err);
    }
  }, [fetchChats, fetchMessages]);

  // Support direct URL query parameter ?phone=xxx or ?jid=xxx (e.g. from Admin Merchant database)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const phoneParam = params.get('phone');
      const jidParam = params.get('jid');
      if (phoneParam) {
        const clean = phoneParam.replace(/[^0-9]/g, '');
        const targetJid = clean.endsWith('@c.us') ? clean : `${clean}@c.us`;
        handleSelectChat(targetJid);
      } else if (jidParam) {
        handleSelectChat(jidParam);
      }
    }
  }, [handleSelectChat]);

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

    try {
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
      if (data.message) {
        setMessages((prev) => [...prev, data.message]);
        fetchChats();
      }
    } catch (err) {
      console.error('Send error:', err);
    }
  };

  const handleStartSession = async () => {
    await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start' }),
    });
    fetchSession();
  };

  const handleLogout = async (resetDb = false) => {
    try {
      await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout', resetDb }),
      });
      if (resetDb) {
        setChats([]);
        setContacts([]);
        setMessages([]);
        setSelectedChatId(null);
      }
      await fetchSession();
      await fetchChats();
      await fetchContacts();
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const handleSyncWAHA = async () => {
    setSyncing(true);
    try {
      await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync' }),
      });
      await fetchContacts();
      await fetchChats();
    } finally {
      setSyncing(false);
    }
  };

  // Find chat or fallback to contact info
  const selectedChatData =
    chats.find((c) => c.id === selectedChatId) ||
    (selectedChatId
      ? {
          id: selectedChatId,
          contact: contacts.find((c) => c.jid === selectedChatId),
          name: contacts.find((c) => c.jid === selectedChatId)?.name,
        }
      : undefined);

  return (
    <main className="flex h-screen w-screen bg-[#F0F2F5] overflow-hidden">
      {/* Sidebar (Left) */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        chats={chats}
        contacts={contacts}
        selectedChatId={selectedChatId}
        onSelectChat={handleSelectChat}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        sessionStatus={sessionStatus}
        onOpenQR={() => setIsQROpen(true)}
        onOpenNewChat={() => setIsNewChatOpen(true)}
        onOpenImport={() => setIsImportOpen(true)}
        onSyncWAHA={handleSyncWAHA}
        syncing={syncing}
        currentUser={currentUser}
        onContactDeleted={() => {
          fetchContacts();
          fetchChats();
        }}
      />

      {/* Main Area (Right) */}
      {selectedChatId ? (
        <ChatRoom
          key={selectedChatId}
          chatId={selectedChatId}
          chatData={selectedChatData}
          messages={messages}
          allContacts={contacts}
          onSendMessage={handleSendMessage}
          onClearChat={(mode) => {
            if (mode === 'delete_chat') {
              setSelectedChatId(null);
            }
            setMessages([]);
            fetchChats();
          }}
          onMergeSuccess={(targetJid) => {
            handleSelectChat(targetJid);
            fetchChats();
            fetchContacts();
          }}
          loadingMessages={loadingMessages}
        />
      ) : (
        /* Empty State Screen */
        <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#F0F2F5] border-b-[6px] border-[#25D366] text-center select-none">
          <div className="max-w-md space-y-6">
            <div className="w-20 h-20 rounded-full bg-[#128C7E]/10 flex items-center justify-center mx-auto text-[#075E54] shadow-sm">
              <MessageSquare className="w-10 h-10" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-light text-gray-700">WhatsApp Web Tools</h2>
              <p className="text-xs text-gray-500 leading-relaxed">
                Kirim, terima, dan balas pesan WhatsApp secara langsung dengan engine WAHA.
                Mendukung import database kontak Excel/CSV serta validasi nomor aktif.
              </p>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => setIsNewChatOpen(true)}
                className="p-3 bg-white hover:bg-gray-50 rounded-xl border border-gray-200 text-left space-y-1 shadow-sm transition cursor-pointer"
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-800">
                  <Send className="w-3.5 h-3.5 text-[#128C7E]" />
                  <span>Kirim Pesan Cepat</span>
                </div>
                <p className="text-[11px] text-gray-400">Langsung chat ke nomor tanpa simpan kontak</p>
              </button>

              <button
                onClick={() => setIsImportOpen(true)}
                className="p-3 bg-white hover:bg-gray-50 rounded-xl border border-gray-200 text-left space-y-1 shadow-sm transition cursor-pointer"
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-800">
                  <Users className="w-3.5 h-3.5 text-[#128C7E]" />
                  <span>Import Database</span>
                </div>
                <p className="text-[11px] text-gray-400">Unggah ribuan kontak via Excel atau CSV</p>
              </button>
            </div>

            {/* Security Note */}
            <div className="inline-flex items-center gap-1.5 text-[11px] text-gray-400">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Didukung WAHA WhatsApp HTTP API & SQLite Database</span>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <QRModal
        isOpen={isQROpen}
        onClose={() => setIsQROpen(false)}
        status={sessionStatus}
        onRefresh={fetchSession}
        onStartSession={handleStartSession}
        onLogout={handleLogout}
      />

      <NewChatModal
        isOpen={isNewChatOpen}
        onClose={() => setIsNewChatOpen(false)}
        onChatCreated={(chatId) => {
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
    </main>
  );
}
