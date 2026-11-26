'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, MessageSquare, Store, Send, FileText, LayoutDashboard, Activity, Users, Settings, QrCode } from 'lucide-react';
import { useWorkspace } from './WorkspaceContext';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const { currentUser, openQRModal } = useWorkspace();
  const [query, setQuery] = useState('');
  const [contacts, setContacts] = useState<any[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setTimeout(() => inputRef.current?.focus(), 30);
    fetch('/api/contacts')
      .then((r) => r.json())
      .then((d) => setContacts(d.contacts || []))
      .catch(() => null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isAdmin = currentUser?.role === 'ADMIN';

  const navActions = [
    { label: 'Buka Inbox & Chat', hint: 'Halaman', icon: MessageSquare, run: () => router.push('/inbox') },
    { label: 'Buka Database Merchant', hint: 'Halaman', icon: Store, run: () => router.push('/merchants') },
    { label: 'Buka Broadcast & Campaign', hint: 'Marketing', icon: Send, run: () => router.push('/broadcast') },
    { label: 'Buka Template Pesan', hint: 'Marketing', icon: FileText, run: () => router.push('/templates') },
    ...(isAdmin
      ? [
          { label: 'Buka Overview Admin', hint: 'Admin', icon: LayoutDashboard, run: () => router.push('/overview') },
          { label: 'Buka Log Aktivitas', hint: 'Admin', icon: Activity, run: () => router.push('/logs') },
          { label: 'Buka Manajemen Tim', hint: 'Admin', icon: Users, run: () => router.push('/users') },
          { label: 'Buka Pengaturan Sistem', hint: 'Admin', icon: Settings, run: () => router.push('/settings') },
        ]
      : []),
    { label: 'Kelola Koneksi & QR WAHA', hint: 'Engine', icon: QrCode, run: () => openQRModal() },
  ];

  const q = query.trim().toLowerCase();
  const filteredNav = navActions.filter(
    (a) => a.label.toLowerCase().includes(q) || a.hint.toLowerCase().includes(q)
  );
  const filteredContacts = contacts
    .filter((c) => {
      if (!q) return true;
      return (
        (c.name || '').toLowerCase().includes(q) ||
        (c.storeName || '').toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q)
      );
    })
    .slice(0, 8);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-black/40 backdrop-blur-[2px] px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[520px] bg-white border border-[#B0C4CF] rounded-[10px] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[#D1DEE5]">
          <Search className="w-4 h-4 text-[#809AA8] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Loncat ke halaman atau cari merchant / nomor..."
            className="w-full text-[13.5px] text-[#0F232E] placeholder-[#809AA8] focus:outline-none"
          />
          <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#E8EFF3] border border-[#D1DEE5] text-[#5C7685]">
            ESC
          </kbd>
        </div>

        <div className="max-h-[340px] overflow-y-auto p-1.5 space-y-1">
          {filteredNav.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                onClick={() => {
                  onClose();
                  item.run();
                }}
                className="w-full flex items-center justify-between px-2.5 py-2 rounded-md hover:bg-[#F4F8FA] text-left transition cursor-pointer"
              >
                <span className="flex items-center gap-2.5 text-[12.5px] font-medium text-[#0F232E]">
                  <Icon className="w-4 h-4 text-[#5C7685]" />
                  {item.label}
                </span>
                <span className="text-[11px] font-mono text-[#809AA8]">{item.hint}</span>
              </button>
            );
          })}

          {filteredContacts.length > 0 && (
            <>
              <div className="px-2.5 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-[#809AA8]">
                Merchant & Kontak
              </div>
              {filteredContacts.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    onClose();
                    router.push(`/inbox?jid=${encodeURIComponent(c.jid)}`);
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-2 rounded-md hover:bg-[#F4F8FA] text-left transition cursor-pointer"
                >
                  <span className="text-[12.5px] text-[#0F232E] truncate">
                    <span className="font-semibold">{c.storeName || c.name || c.phone}</span>
                    {c.storeName && c.name ? (
                      <span className="text-[#5C7685]"> ({c.name})</span>
                    ) : null}
                  </span>
                  <span className="text-[11px] font-mono tabular-nums text-[#809AA8] shrink-0 ml-2">
                    {c.phone}
                  </span>
                </button>
              ))}
            </>
          )}

          {filteredNav.length === 0 && filteredContacts.length === 0 && (
            <div className="py-8 text-center text-xs text-[#809AA8]">
              Tidak ada hasil untuk &ldquo;{query}&rdquo;
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
