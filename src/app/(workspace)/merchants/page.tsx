'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Search,
  RefreshCw,
  Upload,
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  MessageSquare,
} from 'lucide-react';
import { formatDisplayPhone } from '@/lib/phone';
import { formatAccountDate } from '@/lib/date';
import ImportContactModal from '@/components/ImportContactModal';
import NewChatModal from '@/components/NewChatModal';
import { useWorkspace } from '@/components/WorkspaceContext';
import { useRouter } from 'next/navigation';
import Select from '@/components/ui/Select';

export default function MerchantsPage() {
  const router = useRouter();
  const { notify } = useWorkspace();
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [waFilter, setWaFilter] = useState('ALL');

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchContacts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/contacts', { cache: 'no-store' });
      const data = await res.json();
      setContacts(data.contacts || []);
    } catch (err) {
      console.error('Fetch contacts error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const handleSyncWAHA = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync' }),
      });
      const data = await res.json();
      await fetchContacts();
      notify(`Sinkronisasi selesai (${data.synced ?? 0} kontak diproses)`);
    } catch {
      notify('Gagal sinkronisasi kontak WAHA');
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async (deleteChats = false) => {
    if (!contactToDelete || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/contacts?id=${encodeURIComponent(contactToDelete.id)}&deleteChats=${deleteChats}`,
        { method: 'DELETE' }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menghapus data');
      setContactToDelete(null);
      notify('Merchant berhasil dihapus');
      fetchContacts();
    } catch (err: any) {
      notify(`Gagal: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  };

  const categories = Array.from(
    new Set(
      contacts
        .map((c) => c.businessCategory)
        .filter((cat): cat is string => Boolean(cat && cat.trim()))
    )
  ).sort();

  const filtered = contacts.filter((c) => {
    const q = searchQuery.trim().toLowerCase();
    const matchQ =
      !q ||
      (c.name || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q) ||
      (c.storeName || '').toLowerCase().includes(q) ||
      (c.businessCategory || '').toLowerCase().includes(q) ||
      (c.address || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.tags || '').toLowerCase().includes(q);

    const matchCat =
      selectedCategory === 'ALL' ||
      (c.businessCategory && c.businessCategory.toLowerCase() === selectedCategory.toLowerCase());

    const matchWA =
      waFilter === 'ALL' ||
      (waFilter === 'ACTIVE' && c.isWAUser) ||
      (waFilter === 'UNVERIFIED' && !c.isWAUser);

    return matchQ && matchCat && matchWA;
  });

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto bg-[#F4F8FA]">
      {/* Page Header */}
      <header className="bg-white border-b border-[#D1DEE5] px-4 md:px-7 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-[17px] font-bold text-[#0F232E] tracking-tight">
            Database Merchant
          </h1>
          <p className="text-[12.5px] text-[#5C7685] mt-0.5">
            Satu sumber kebenaran kontak & merchant — langsung terhubung ke Inbox dan Broadcast.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleSyncWAHA}
            disabled={syncing}
            className="h-8 px-3 bg-white hover:bg-[#F4F8FA] border border-[#B0C4CF] text-[#0F232E] text-[12.5px] font-semibold rounded-md flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin text-[#00688E]' : ''}`} />
            <span>Sync WAHA</span>
          </button>

          <button
            type="button"
            onClick={() => setIsNewOpen(true)}
            className="h-8 px-3 bg-white hover:bg-[#F4F8FA] border border-[#B0C4CF] text-[#0F232E] text-[12.5px] font-semibold rounded-md flex items-center gap-1.5 transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah</span>
          </button>

          <button
            type="button"
            onClick={() => setIsImportOpen(true)}
            className="h-8 px-3 bg-[#00688E] hover:bg-[#005575] text-white text-[12.5px] font-semibold rounded-md flex items-center gap-1.5 transition cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import CSV / Excel</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="p-4 md:p-7 max-w-[1280px] w-full mx-auto space-y-4">
        <div className="bg-white border border-[#D1DEE5] rounded-lg shadow-[0_1px_2px_rgba(17,24,39,0.04)] overflow-hidden">
          {/* Toolbar */}
          <div className="px-4 py-3 border-b border-[#E8EFF3] flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative w-full sm:w-[270px]">
                <Search className="w-3.5 h-3.5 text-[#809AA8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari toko, pemilik, nomor, kota..."
                  className="w-full h-8 pl-8 pr-3 border border-[#D1DEE5] rounded-md text-[12.5px] focus:outline-none focus:border-[#00688E]"
                />
              </div>

              <Select
                value={selectedCategory}
                onChange={(v) => setSelectedCategory(v)}
                className="h-8 px-2.5 border border-[#D1DEE5] rounded-md text-[12.5px] bg-white focus:outline-none focus:border-[#00688E]"
              >
                <option value="ALL">Semua Kategori</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </Select>

              <Select
                value={waFilter}
                onChange={(v) => setWaFilter(v)}
                className="h-8 px-2.5 border border-[#D1DEE5] rounded-md text-[12.5px] bg-white focus:outline-none focus:border-[#00688E]"
              >
                <option value="ALL">Semua Status WA</option>
                <option value="ACTIVE">Aktif WA</option>
                <option value="UNVERIFIED">Belum Verifikasi</option>
              </Select>
            </div>

            <span className="text-xs text-[#5C7685] tabular-nums">
              Menampilkan {filtered.length} dari {contacts.length} kontak
            </span>
          </div>

          {/* Data Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[12.5px]">
              <thead>
                <tr className="bg-[#F4F8FA] border-b border-[#D1DEE5] text-[11px] font-semibold uppercase tracking-wider text-[#5C7685]">
                  <th className="py-2.5 px-4">Toko & Pemilik</th>
                  <th className="py-2.5 px-4">WhatsApp</th>
                  <th className="py-2.5 px-4">Kategori</th>
                  <th className="py-2.5 px-4">Kota / Info</th>
                  <th className="py-2.5 px-4">Tags</th>
                  <th className="py-2.5 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8EFF3]">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-xs text-[#809AA8]">
                      <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                      Memuat database merchant...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-xs text-[#809AA8]">
                      Belum ada data kontak yang cocok. Import CSV/Excel atau tambah kontak baru.
                    </td>
                  </tr>
                ) : (
                  filtered.map((c) => {
                    const tags = (c.tags || '')
                      .split(',')
                      .map((t: string) => t.trim())
                      .filter(Boolean);
                    return (
                      <tr key={c.id} className="hover:bg-[#FAFBFB] transition">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-[#0F232E]">
                            {c.storeName || c.name || formatDisplayPhone(c.phone)}
                          </div>
                          <div className="text-[11.5px] text-[#5C7685]">
                            {c.storeName && c.name ? c.name : c.pushName || '-'}
                            {c.email ? ` • ${c.email}` : ''}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-mono tabular-nums text-[12px] text-[#0F232E]">
                            {formatDisplayPhone(c.phone)}
                          </div>
                          <div
                            className={`text-[11px] font-semibold mt-0.5 ${
                              c.isWAUser ? 'text-[#0D6945]' : 'text-[#8F5A05]'
                            }`}
                          >
                            ● {c.isWAUser ? 'Aktif WA' : 'Belum Verifikasi'}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {c.businessCategory ? (
                            <span className="inline-flex px-2 py-0.5 rounded bg-[#E8EFF3] border border-[#D1DEE5] text-[11px] font-semibold text-[#435A68]">
                              {c.businessCategory}
                            </span>
                          ) : (
                            <span className="text-[#809AA8]">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-[#435A68]">
                          <div className="truncate max-w-[200px]">{c.address || '—'}</div>
                          {c.accountCreatedAt && (
                            <div className="text-[11px] text-[#809AA8] tabular-nums">
                              Daftar: {formatAccountDate(c.accountCreatedAt)}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-wrap gap-1">
                            {tags.length > 0 ? (
                              tags.slice(0, 3).map((t: string) => (
                                <span
                                  key={t}
                                  className="inline-flex px-1.5 py-0.5 rounded bg-[#ECF6FA] border border-[#A7D6E7] text-[#00688E] text-[10.5px] font-semibold"
                                >
                                  {t}
                                </span>
                              ))
                            ) : (
                              <span className="text-[#809AA8]">—</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <Link
                              href={`/inbox?jid=${encodeURIComponent(c.jid)}`}
                              className="h-7 px-2.5 bg-white hover:bg-[#F4F8FA] border border-[#B0C4CF] text-[#0F232E] text-xs font-semibold rounded-md inline-flex items-center gap-1 transition"
                            >
                              <MessageSquare className="w-3 h-3 text-[#00688E]" />
                              <span>Chat</span>
                            </Link>
                            <button
                              type="button"
                              onClick={() => setContactToDelete(c)}
                              title="Hapus Kontak"
                              className="w-7 h-7 rounded-md text-[#809AA8] hover:text-[#9E1F23] hover:bg-[#FDECEC] inline-flex items-center justify-center transition cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
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

      {/* Modals */}
      <ImportContactModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImportSuccess={fetchContacts}
      />

      <NewChatModal
        isOpen={isNewOpen}
        onClose={() => setIsNewOpen(false)}
        onChatCreated={(jid) => {
          fetchContacts();
          router.push(`/inbox?jid=${encodeURIComponent(jid)}`);
        }}
      />

      {/* Delete Confirm Modal */}
      {contactToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          onClick={() => setContactToDelete(null)}
        >
          <div
            className="bg-white border border-[#B0C4CF] rounded-[10px] shadow-2xl max-w-sm w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 space-y-2">
              <div className="flex items-center gap-2 text-[#9E1F23] font-bold text-sm">
                <AlertCircle className="w-4 h-4" />
                <span>Hapus Merchant / Kontak</span>
              </div>
              <p className="text-xs text-[#435A68] leading-relaxed">
                Hapus <strong>{contactToDelete.storeName || contactToDelete.name || contactToDelete.phone}</strong> dari database?
              </p>
            </div>
            <div className="px-4 py-3 bg-[#F4F8FA] border-t border-[#D1DEE5] flex flex-col gap-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => handleDelete(false)}
                className="w-full h-8 bg-white hover:bg-[#ECF6FA] border border-[#B0C4CF] text-xs font-semibold rounded-md cursor-pointer"
              >
                Hapus Kontak Saja (Riwayat Chat Tetap Ada)
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => handleDelete(true)}
                className="w-full h-8 bg-[#9E1F23] hover:bg-[#991B1B] text-white text-xs font-semibold rounded-md cursor-pointer"
              >
                Hapus Kontak + Seluruh Riwayat Chat
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => setContactToDelete(null)}
                className="w-full h-7 text-xs text-[#5C7685] hover:text-[#0F232E] cursor-pointer"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
