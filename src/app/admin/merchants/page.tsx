'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Store,
  Users,
  Search,
  Filter,
  RefreshCw,
  Download,
  Upload,
  MessageSquare,
  Trash2,
  CheckCircle2,
  AlertCircle,
  MapPin,
  Mail,
  Calendar,
  Phone,
  Tag,
  Loader2,
  X,
  FileSpreadsheet,
} from 'lucide-react';
import { formatDisplayPhone } from '@/lib/phone';
import { formatAccountDate } from '@/lib/date';

export default function AdminMerchantsPage() {
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [waStatusFilter, setWaStatusFilter] = useState('ALL');
  const [contactToDelete, setContactToDelete] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Import Modal state inside page
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [importResult, setImportResult] = useState<any | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchContacts = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/contacts');
      const data = await res.json();
      setContacts(data.contacts || []);
    } catch (err) {
      console.error('Fetch contacts error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContacts();
  }, []);

  // Extract unique categories for filter dropdown
  const categories = Array.from(
    new Set(
      contacts
        .map((c) => c.businessCategory)
        .filter((cat): cat is string => Boolean(cat && cat.trim()))
    )
  ).sort();

  // Filter contacts
  const filteredContacts = contacts.filter((c) => {
    const q = searchQuery.toLowerCase();
    const name = (c.name || '').toLowerCase();
    const phone = (c.phone || '').toLowerCase();
    const storeName = (c.storeName || '').toLowerCase();
    const category = (c.businessCategory || '').toLowerCase();
    const address = (c.address || '').toLowerCase();
    const email = (c.email || '').toLowerCase();

    const matchesSearch =
      name.includes(q) ||
      phone.includes(q) ||
      storeName.includes(q) ||
      category.includes(q) ||
      address.includes(q) ||
      email.includes(q);

    const matchesCategory =
      selectedCategory === 'ALL' ||
      (c.businessCategory && c.businessCategory.toLowerCase() === selectedCategory.toLowerCase());

    const matchesWA =
      waStatusFilter === 'ALL' ||
      (waStatusFilter === 'ACTIVE' && c.isWAUser) ||
      (waStatusFilter === 'UNVERIFIED' && !c.isWAUser);

    return matchesSearch && matchesCategory && matchesWA;
  });

  // Calculate statistics
  const totalCount = contacts.length;
  const merchantCount = contacts.filter((c) => c.storeName || c.businessCategory).length;
  const activeWACount = contacts.filter((c) => c.isWAUser).length;

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
      fetchContacts();
    } catch (err: any) {
      alert(`Gagal: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile) {
      setImportError('Pilih file CSV atau Excel terlebih dahulu');
      return;
    }

    setImporting(true);
    setImportError('');
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append('file', importFile);

      const res = await fetch('/api/contacts/import', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memproses import');

      setImportResult(data.summary);
      fetchContacts();
    } catch (err: any) {
      setImportError(err.message || 'Terjadi kesalahan saat mengunggah');
    } finally {
      setImporting(false);
    }
  };

  const downloadSampleTemplate = () => {
    const link = document.createElement('a');
    link.href = '/sample_merchant_lapaq.csv';
    link.download = 'sample_merchant_lapaq.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Title & Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">
              Database Merchant Lapaq
            </h1>
            <span className="text-xs bg-amber-100 text-amber-800 font-semibold px-2 py-0.5 rounded-full border border-amber-200">
              Marketing
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Kelola data merchant lengkap dengan 7 parameter untuk keperluan campaign WhatsApp broadcast & chat.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={downloadSampleTemplate}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            title="Unduh Template CSV Merchant Lapaq"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Template CSV</span>
          </button>

          <button
            onClick={() => {
              setImportFile(null);
              setImportError('');
              setImportResult(null);
              setIsImportModalOpen(true);
            }}
            className="px-3.5 py-2 bg-[#128C7E] hover:bg-[#075E54] text-white text-xs font-semibold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import Data Merchant</span>
          </button>

          <button
            onClick={fetchContacts}
            disabled={loading}
            className="p-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl shadow-xs transition flex items-center justify-center cursor-pointer disabled:opacity-50"
            title="Muat Ulang"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#128C7E]' : ''}`} />
          </button>
        </div>
      </div>

      {/* 3 Metrics Cards (TailAdmin Style) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Store className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
              Lapaq Merchant
            </span>
          </div>
          <div className="mt-4">
            <h4 className="text-2xl font-bold text-slate-800">{merchantCount}</h4>
            <p className="text-xs text-slate-400 mt-1">
              Dari total {totalCount} kontak di buku telepon
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
              WA Terverifikasi
            </span>
          </div>
          <div className="mt-4">
            <h4 className="text-2xl font-bold text-slate-800">{activeWACount}</h4>
            <p className="text-xs text-slate-400 mt-1">
              {totalCount > 0
                ? `${Math.round((activeWACount / totalCount) * 100)}% nomor terdaftar di WhatsApp`
                : 'Belum ada data'}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Tag className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">
              Kategori Terdaftar
            </span>
          </div>
          <div className="mt-4">
            <h4 className="text-2xl font-bold text-slate-800">{categories.length}</h4>
            <p className="text-xs text-slate-400 mt-1 truncate">
              {categories.slice(0, 3).join(', ') || 'Belum ada kategori'}
            </p>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar Toolbar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="w-full md:w-96 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari toko, pemilik, hp, email, kota..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#128C7E] focus:bg-white transition"
          />
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          {/* Category Dropdown */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs text-slate-500 font-medium">Kategori:</span>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded-xl px-2.5 py-1.5 font-medium focus:outline-none focus:ring-2 focus:ring-[#128C7E] cursor-pointer"
            >
              <option value="ALL">Semua Kategori ({categories.length})</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* WA Status Dropdown */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs text-slate-500 font-medium">Status WA:</span>
            <select
              value={waStatusFilter}
              onChange={(e) => setWaStatusFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded-xl px-2.5 py-1.5 font-medium focus:outline-none focus:ring-2 focus:ring-[#128C7E] cursor-pointer"
            >
              <option value="ALL">Semua</option>
              <option value="ACTIVE">WA Aktif</option>
              <option value="UNVERIFIED">Unverified</option>
            </select>
          </div>
        </div>
      </div>

      {/* Merchant Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-3.5 px-4">Nama Toko & Kategori</th>
                <th className="py-3.5 px-4">Nama Pemilik</th>
                <th className="py-3.5 px-4">No Telepon / WhatsApp</th>
                <th className="py-3.5 px-4">Email & Alamat</th>
                <th className="py-3.5 px-4">Tgl Buat Akun</th>
                <th className="py-3.5 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[#128C7E]" />
                    <span>Memuat data merchant...</span>
                  </td>
                </tr>
              ) : filteredContacts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 space-y-2">
                    <Store className="w-8 h-8 mx-auto text-slate-300" />
                    <p className="font-medium text-slate-600">Tidak ada data merchant yang cocok</p>
                    <p className="text-[11px] text-slate-400">
                      Coba ubah kata kunci pencarian atau import file Excel/CSV Merchant.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredContacts.map((c) => {
                  const displayPhone = formatDisplayPhone(c.phone);
                  return (
                    <tr key={c.id} className="hover:bg-slate-50/70 transition">
                      {/* 1. Toko & Kategori */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          <div className="font-bold text-slate-900 flex items-center gap-1.5">
                            <Store className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>{c.storeName || <span className="italic text-slate-400">Toko belum dinamai</span>}</span>
                          </div>
                          {c.businessCategory ? (
                            <span className="inline-block text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200/60 px-2 py-0.5 rounded-md">
                              {c.businessCategory}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400">Tanpa Kategori</span>
                          )}
                        </div>
                      </td>

                      {/* 2. Pemilik */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-800">
                          {c.name || <span className="italic text-slate-400">-</span>}
                        </div>
                        {c.tags && (
                          <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.2 rounded inline-block mt-0.5">
                            {c.tags}
                          </span>
                        )}
                      </td>

                      {/* 3. Phone & Status WA */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          <span className="font-mono font-medium text-slate-700 block">
                            {displayPhone}
                          </span>
                          {c.isWAUser ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              WA Aktif
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                              Unverified
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 4. Email & Alamat */}
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="space-y-1">
                          {c.email ? (
                            <span className="text-slate-600 flex items-center gap-1 truncate" title={c.email}>
                              <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="truncate">{c.email}</span>
                            </span>
                          ) : null}
                          {c.address ? (
                            <span className="text-slate-500 text-[11px] flex items-center gap-1 line-clamp-2" title={c.address}>
                              <MapPin className="w-3 h-3 text-red-500 shrink-0" />
                              <span>{c.address}</span>
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">Alamat belum diisi</span>
                          )}
                        </div>
                      </td>

                      {/* 5. Tanggal Pembuatan Akun */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-600">
                        {c.accountCreatedAt ? (
                          <span className="flex items-center gap-1 text-slate-700">
                            <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>{formatAccountDate(c.accountCreatedAt)}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px] italic">-</span>
                        )}
                      </td>

                      {/* 6. Aksi */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <a
                            href={`/?phone=${encodeURIComponent(c.phone)}`}
                            className="px-2.5 py-1.5 bg-[#128C7E] hover:bg-[#075E54] text-white font-semibold rounded-lg text-xs transition flex items-center gap-1 shadow-2xs"
                            title="Chat WhatsApp Sekarang"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>Chat WA</span>
                          </a>

                          <button
                            type="button"
                            onClick={() => setContactToDelete(c)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            title="Hapus Data Merchant"
                          >
                            <Trash2 className="w-4 h-4" />
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

        {/* Footer info */}
        <div className="p-4 bg-slate-50/70 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <span>
            Menampilkan <strong className="text-slate-800">{filteredContacts.length}</strong> dari{' '}
            <strong className="text-slate-800">{contacts.length}</strong> data kontak
          </span>
          <span className="text-[11px] text-slate-400">
            Terhubung otomatis ke WhatsApp Web Tools
          </span>
        </div>
      </div>

      {/* CONFIRMATION MODAL: HAPUS MERCHANT */}
      {contactToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4 border border-gray-100">
            <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto shadow-sm">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-base font-bold text-gray-900">Hapus Data Merchant</h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                Yakin ingin menghapus merchant{' '}
                <span className="font-semibold text-gray-800">
                  {contactToDelete.storeName || contactToDelete.name || contactToDelete.phone}
                </span>{' '}
                ({formatDisplayPhone(contactToDelete.phone)})?
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => handleDelete(false)}
                disabled={deleting}
                className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white font-semibold text-xs rounded-xl shadow-sm transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
              >
                {deleting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span>Hapus Merchant Saja</span>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleDelete(true)}
                disabled={deleting}
                className="w-full py-2 px-4 bg-red-50 hover:bg-red-100 text-red-700 font-semibold text-xs rounded-xl transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
              >
                <span>Hapus Merchant & Obrolan WA</span>
              </button>

              <button
                type="button"
                onClick={() => setContactToDelete(null)}
                disabled={deleting}
                className="w-full py-2 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs rounded-xl transition cursor-pointer"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IMPORT MODAL DARI DASHBOARD ADMIN */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-100">
            <div className="bg-[#1C2434] text-white px-6 py-4 flex items-center justify-between border-b border-[#2E3A4B]">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-[#25D366]" />
                <h3 className="font-semibold text-base">Import Data Merchant Lapaq</h3>
              </div>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="text-white/80 hover:text-white p-1 rounded-full hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleImportSubmit} className="p-6 space-y-4">
              {importError && (
                <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{importError}</span>
                </div>
              )}

              {/* Template guide */}
              <div className="bg-gradient-to-r from-amber-50 to-emerald-50 p-3.5 rounded-xl border border-amber-200/80 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-xs">
                    <span className="font-bold text-amber-950 block">7 Parameter Kolom:</span>
                    <p className="text-amber-900/80 mt-0.5 text-[11px] leading-relaxed">
                      1. Nama Pemilik, 2. Nama Toko, 3. Kategori Bisnis, 4. Nomor Telepon/HP, 5. Email, 6. Tanggal pembuatan akun, 7. Alamat
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={downloadSampleTemplate}
                    className="shrink-0 text-xs bg-amber-600 hover:bg-amber-700 text-white font-semibold px-2.5 py-1.5 rounded-lg flex items-center gap-1 shadow-2xs transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    CSV
                  </button>
                </div>
              </div>

              {/* File picker drop area */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 hover:border-[#128C7E] rounded-xl p-6 text-center cursor-pointer bg-gray-50/50 hover:bg-gray-50 transition"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setImportFile(e.target.files[0]);
                      setImportError('');
                      setImportResult(null);
                    }
                  }}
                  className="hidden"
                />
                <Upload className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                {importFile ? (
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{importFile.name}</p>
                    <p className="text-xs text-gray-500">{(importFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      Klik untuk pilih file Excel (.xlsx) atau CSV
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Otomatis menormalisasi nomor HP dan verifikasi status aktif WhatsApp
                    </p>
                  </div>
                )}
              </div>

              {/* Import Result Summary */}
              {importResult && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-emerald-800 font-semibold text-sm">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Import Berhasil! Data langsung masuk ke buku kontak depan.</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="bg-white p-2 rounded-lg border border-emerald-100">
                      <span className="text-gray-500 block">Total</span>
                      <span className="font-bold text-gray-800 text-sm">{importResult.total}</span>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-emerald-100">
                      <span className="text-emerald-600 block">Berhasil</span>
                      <span className="font-bold text-emerald-700 text-sm">{importResult.success}</span>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-emerald-100">
                      <span className="text-emerald-700 block">WA Aktif</span>
                      <span className="font-bold text-emerald-700 text-sm">{importResult.activeWA}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Modal footer */}
              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(false)}
                  disabled={importing}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-50 transition cursor-pointer"
                >
                  Tutup
                </button>
                <button
                  type="submit"
                  disabled={importing || !importFile}
                  className="px-5 py-2 bg-[#128C7E] hover:bg-[#075E54] disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-2 shadow-sm transition cursor-pointer"
                >
                  {importing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Mengimpor & Memverifikasi...</span>
                    </>
                  ) : (
                    <span>Mulai Import</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
