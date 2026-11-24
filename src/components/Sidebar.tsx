'use client';

import React, { useState } from 'react';
import {
  MessageSquare,
  Users,
  Search,
  Plus,
  FileSpreadsheet,
  QrCode,
  RefreshCw,
  Check,
  CheckCheck,
  Shield,
  LogOut,
  User,
  Trash2,
  Loader2,
  Store,
  MapPin,
  Tag,
} from 'lucide-react';
import { formatDisplayPhone } from '@/lib/phone';

interface SidebarProps {
  activeTab: 'chats' | 'contacts';
  setActiveTab: (tab: 'chats' | 'contacts') => void;
  chats: any[];
  contacts: any[];
  selectedChatId: string | null;
  onSelectChat: (chatId: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  sessionStatus: string;
  onOpenQR: () => void;
  onOpenNewChat: () => void;
  onOpenImport: () => void;
  onSyncWAHA: () => void;
  syncing: boolean;
  currentUser?: any;
  onContactDeleted?: () => void;
}

export default function Sidebar({
  activeTab,
  setActiveTab,
  chats,
  contacts,
  selectedChatId,
  onSelectChat,
  searchQuery,
  setSearchQuery,
  sessionStatus,
  onOpenQR,
  onOpenNewChat,
  onOpenImport,
  onSyncWAHA,
  syncing,
  currentUser,
  onContactDeleted,
}: SidebarProps) {
  const [contactToDelete, setContactToDelete] = useState<any | null>(null);
  const [deletingContact, setDeletingContact] = useState(false);

  const handleDeleteContact = async (deleteChats = false) => {
    if (!contactToDelete || deletingContact) return;
    setDeletingContact(true);
    try {
      const res = await fetch(
        `/api/contacts?id=${encodeURIComponent(contactToDelete.id)}&deleteChats=${deleteChats}`,
        { method: 'DELETE' }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menghapus kontak');
      setContactToDelete(null);
      if (onContactDeleted) onContactDeleted();
    } catch (err: any) {
      alert(`Gagal: ${err.message}`);
    } finally {
      setDeletingContact(false);
    }
  };
  const filteredChats = chats.filter((c) => {
    const name = (c.contact?.name || c.name || c.id || '').toLowerCase();
    const phone = (c.contact?.phone || '').toLowerCase();
    const lastMsg = (c.lastMessage || '').toLowerCase();
    const q = searchQuery.toLowerCase();
    return name.includes(q) || phone.includes(q) || lastMsg.includes(q);
  });

  const filteredContacts = contacts.filter((c) => {
    const name = (c.name || '').toLowerCase();
    const phone = (c.phone || '').toLowerCase();
    const tags = (c.tags || '').toLowerCase();
    const storeName = (c.storeName || '').toLowerCase();
    const category = (c.businessCategory || '').toLowerCase();
    const address = (c.address || '').toLowerCase();
    const email = (c.email || '').toLowerCase();
    const q = searchQuery.toLowerCase();
    return (
      name.includes(q) ||
      phone.includes(q) ||
      tags.includes(q) ||
      storeName.includes(q) ||
      category.includes(q) ||
      address.includes(q) ||
      email.includes(q)
    );
  });

  const formatChatTime = (dateStr?: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <aside className="w-96 flex flex-col h-full bg-white border-r border-gray-200 select-none">
      {/* Top Header */}
      <header className="h-16 px-4 bg-[#F0F2F5] border-b border-gray-200 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-[#128C7E] flex items-center justify-center text-white font-bold text-sm shadow-sm">
              WA
            </div>
            {/* Status indicator badge */}
            <span
              title={`Status: ${sessionStatus}`}
              className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${
                sessionStatus === 'WORKING'
                  ? 'bg-emerald-500'
                  : sessionStatus === 'SCAN_QR_CODE'
                  ? 'bg-amber-500 animate-pulse'
                  : 'bg-rose-500'
              }`}
            />
          </div>

          <div>
            <h1 className="text-sm font-semibold text-gray-900 leading-tight">WAHA Marketing</h1>
            <button
              onClick={onOpenQR}
              className="text-[11px] text-gray-500 hover:text-[#075E54] flex items-center gap-1 transition"
            >
              <span>{sessionStatus === 'WORKING' ? 'Terhubung' : sessionStatus}</span>
              <QrCode className="w-3 h-3 text-[#128C7E]" />
            </button>
          </div>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1 text-gray-600">
          <button
            onClick={onSyncWAHA}
            disabled={syncing}
            title="Sinkronisasi Kontak dari WA"
            className="p-2 hover:bg-gray-200/80 rounded-full transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin text-[#128C7E]' : ''}`} />
          </button>
          <button
            onClick={onOpenImport}
            title="Import Excel / CSV Kontak"
            className="p-2 hover:bg-gray-200/80 rounded-full transition"
          >
            <FileSpreadsheet className="w-4 h-4 text-[#128C7E]" />
          </button>
          <button
            onClick={onOpenNewChat}
            title="Mulai Chat Baru / Tambah Kontak"
            className="p-2 hover:bg-gray-200/80 rounded-full transition"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Search Bar */}
      <div className="px-3 py-2 bg-white border-b border-gray-100 shrink-0">
        <div className="relative flex items-center bg-[#F0F2F5] rounded-lg px-3 py-1.5 focus-within:bg-white focus-within:ring-1 focus-within:ring-[#128C7E] transition">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input
            type="text"
            placeholder={activeTab === 'chats' ? 'Cari atau mulai chat baru...' : 'Cari kontak atau tag...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent pl-2 text-xs text-gray-800 placeholder-gray-400 focus:outline-none"
          />
        </div>
      </div>

      {/* Navigation Tabs (Chats vs Kontak) */}
      <div className="flex border-b border-gray-200 bg-[#F0F2F5]/60 text-xs font-medium shrink-0">
        <button
          onClick={() => setActiveTab('chats')}
          className={`flex-1 py-2.5 flex items-center justify-center gap-2 border-b-2 transition ${
            activeTab === 'chats'
              ? 'border-[#075E54] text-[#075E54] font-semibold bg-white'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Obrolan ({chats.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('contacts')}
          className={`flex-1 py-2.5 flex items-center justify-center gap-2 border-b-2 transition ${
            activeTab === 'contacts'
              ? 'border-[#075E54] text-[#075E54] font-semibold bg-white'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Buku Kontak ({contacts.length})</span>
        </button>
      </div>

      {/* List Container */}
      <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
        {activeTab === 'chats' ? (
          filteredChats.length === 0 ? (
            <div className="p-8 text-center text-xs text-gray-400 space-y-2">
              <MessageSquare className="w-8 h-8 mx-auto text-gray-300" />
              <p>Belum ada obrolan.</p>
              <button
                onClick={onOpenNewChat}
                className="text-[#128C7E] font-medium hover:underline inline-block"
              >
                + Mulai chat baru
              </button>
            </div>
          ) : (
            filteredChats.map((c) => {
              const isSelected = selectedChatId === c.id;
              const displayName = c.contact?.name || c.name || c.id.replace('@c.us', '');
              const displayPhone = c.contact?.phone ? formatDisplayPhone(c.contact.phone) : '';

              return (
                <div
                  key={c.id}
                  onClick={() => onSelectChat(c.id)}
                  className={`px-3 py-3 flex items-center gap-3 cursor-pointer transition select-none ${
                    isSelected ? 'bg-[#F0F2F5]' : 'hover:bg-gray-50'
                  }`}
                >
                  {/* Avatar */}
                  <div className="w-12 h-12 rounded-full bg-slate-200 shrink-0 flex items-center justify-center text-slate-600 font-bold text-sm overflow-hidden">
                    {c.contact?.profilePicUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.contact.profilePicUrl} alt={displayName} className="w-full h-full object-cover" />
                    ) : (
                      displayName.charAt(0).toUpperCase()
                    )}
                  </div>

                  {/* Chat Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <h4 className="text-sm font-semibold text-gray-900 truncate">{displayName}</h4>
                      <span className="text-[11px] text-gray-400 shrink-0 ml-1">
                        {formatChatTime(c.lastMessageAt)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <p className="truncate pr-2">
                        {c.lastMessage || <span className="italic text-gray-400">Tidak ada pesan</span>}
                      </p>
                      {c.unreadCount > 0 && (
                        <span className="shrink-0 bg-[#25D366] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                          {c.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )
        ) : (
          /* Contacts Tab */
          filteredContacts.length === 0 ? (
            <div className="p-8 text-center text-xs text-gray-400 space-y-2">
              <Users className="w-8 h-8 mx-auto text-gray-300" />
              <p>Belum ada kontak tersimpan.</p>
              <button
                onClick={onOpenImport}
                className="text-[#128C7E] font-medium hover:underline inline-block"
              >
                + Import dari Excel/CSV
              </button>
            </div>
          ) : (
            filteredContacts.map((c) => {
              const displayName = c.name || c.storeName || c.phone;
              const formattedPhone = formatDisplayPhone(c.phone);

              return (
                <div
                  key={c.id}
                  onClick={() => onSelectChat(c.jid)}
                  className="group px-3 py-3 flex items-start gap-3 cursor-pointer hover:bg-gray-50 transition relative"
                >
                  <div className="w-10 h-10 rounded-full bg-[#128C7E]/10 text-[#075E54] shrink-0 flex items-center justify-center font-bold text-sm mt-0.5">
                    {displayName.charAt(0).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <h4 className="text-sm font-semibold text-gray-900 truncate">{displayName}</h4>
                      {c.isWAUser ? (
                        <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium shrink-0">
                          WA Aktif
                        </span>
                      ) : (
                        <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full shrink-0">
                          Unverified
                        </span>
                      )}
                    </div>

                    {/* Merchant Store & Category Badges */}
                    {(c.storeName || c.businessCategory) && (
                      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                        {c.storeName && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-900 bg-amber-50 border border-amber-200/70 px-1.5 py-0.5 rounded">
                            <Store className="w-3 h-3 text-amber-600 shrink-0" />
                            <span className="truncate max-w-[130px]">{c.storeName}</span>
                          </span>
                        )}
                        {c.businessCategory && (
                          <span className="text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200/60 px-1.5 py-0.5 rounded truncate max-w-[100px]">
                            {c.businessCategory}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <p className="truncate flex items-center gap-1">
                        <span>{formattedPhone}</span>
                        {c.address && (
                          <span className="text-gray-400 text-[10px] truncate max-w-[100px] flex items-center gap-0.5">
                            • <MapPin className="w-2.5 h-2.5 shrink-0" />
                            {c.address}
                          </span>
                        )}
                      </p>
                      {c.tags && (
                        <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded truncate max-w-[90px] shrink-0">
                          {c.tags}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Delete Contact Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setContactToDelete(c);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition shrink-0 cursor-pointer"
                    title="Hapus Kontak"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })
          )
        )}
      </div>

      {/* User Footer Bar */}
      <footer className="p-3 bg-[#F0F2F5] border-t border-gray-200 flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-[#128C7E] text-white flex items-center justify-center font-bold text-xs uppercase shadow-xs shrink-0">
              {currentUser?.name ? currentUser.name.charAt(0) : 'U'}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-800 truncate">
                {currentUser?.name || 'Operator'}
              </p>
              <span className="text-[10px] text-gray-500 font-mono block">
                {currentUser?.role || 'OPERATOR'}
              </span>
            </div>
          </div>

          <button
            onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST' });
              window.location.href = '/login';
            }}
            title="Keluar"
            className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-white rounded-lg transition shadow-2xs border border-transparent hover:border-gray-200 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        {currentUser?.role === 'ADMIN' && (
          <a
            href="/admin"
            className="w-full py-1.5 px-3 bg-white hover:bg-emerald-50 border border-gray-200 hover:border-emerald-300 text-xs font-semibold text-[#075E54] rounded-lg transition flex items-center justify-center gap-2 shadow-2xs cursor-pointer"
          >
            <Shield className="w-3.5 h-3.5 text-[#128C7E]" />
            <span>Buka Dashboard Admin</span>
          </a>
        )}
      </footer>

      {/* CONFIRMATION MODAL: HAPUS KONTAK */}
      {contactToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4 border border-gray-100">
            <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto shadow-sm">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-base font-bold text-gray-900">
                Hapus Kontak
              </h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                Yakin ingin menghapus kontak{' '}
                <span className="font-semibold text-gray-800">
                  {contactToDelete.name || contactToDelete.phone}
                </span>{' '}
                ({formatDisplayPhone(contactToDelete.phone)}) dari buku telepon?
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => handleDeleteContact(false)}
                disabled={deletingContact}
                className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white font-semibold text-xs rounded-xl shadow-sm transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
              >
                {deletingContact ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span>Hapus Kontak Saja</span>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleDeleteContact(true)}
                disabled={deletingContact}
                className="w-full py-2 px-4 bg-red-50 hover:bg-red-100 text-red-700 font-semibold text-xs rounded-xl transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
              >
                <span>Hapus Kontak & Obrolannya</span>
              </button>

              <button
                type="button"
                onClick={() => setContactToDelete(null)}
                disabled={deletingContact}
                className="w-full py-2 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs rounded-xl transition cursor-pointer"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
