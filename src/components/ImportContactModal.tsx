'use client';

import React, { useState, useRef } from 'react';
import { X, Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, Download } from 'lucide-react';

interface ImportContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: () => void;
}

export default function ImportContactModal({
  isOpen,
  onClose,
  onImportSuccess,
}: ImportContactModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [defaultTag, setDefaultTag] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError('');
      setResult(null);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Pilih file Excel (.xlsx) atau CSV terlebih dahulu');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (defaultTag) formData.append('tag', defaultTag);

      const res = await fetch('/api/contacts/import', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal memproses file import');
      }

      setResult(data.summary);
      onImportSuccess();
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan saat mengunggah file');
    } finally {
      setLoading(false);
    }
  };

  const downloadSampleCSV = () => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      'Nama,Nomor HP,Kategori,Catatan\n' +
      'Ahmad Syarif,081234567890,Customer Baru,Minat produk X\n' +
      'Dewi Lestari,6285712345678,Prospek,Follow up promo akhir tahun\n' +
      'Budi Hartono,087812345678,VIP,Order rutin bulanan\n';

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'template_kontak_whatsapp.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-100">
        {/* Header */}
        <div className="bg-[#075E54] text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-wa-green" />
            <h3 className="font-semibold text-lg">Import Kontak (Excel / CSV)</h3>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded-full hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleUpload} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Download template hint */}
          <div className="flex items-center justify-between bg-blue-50/70 p-3 rounded-xl border border-blue-100">
            <div className="text-xs text-blue-900">
              <p className="font-semibold">Format kolom file yang didukung:</p>
              <p className="text-blue-700">Nama, Nomor HP, Kategori, Catatan</p>
            </div>
            <button
              type="button"
              onClick={downloadSampleCSV}
              className="text-xs bg-white text-blue-700 border border-blue-200 hover:bg-blue-50 px-2.5 py-1.5 rounded-lg flex items-center gap-1 font-medium transition"
            >
              <Download className="w-3.5 h-3.5" />
              Template CSV
            </button>
          </div>

          {/* File Picker / Drag area */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-300 hover:border-[#128C7E] rounded-xl p-6 text-center cursor-pointer bg-gray-50/50 hover:bg-gray-50 transition"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              className="hidden"
            />
            <Upload className="w-10 h-10 text-gray-400 mx-auto mb-2" />
            {file ? (
              <div>
                <p className="text-sm font-semibold text-gray-800">{file.name}</p>
                <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
            ) : (
              <div>
                <p className="text-sm font-medium text-gray-700">
                  Klik untuk pilih file Excel (.xlsx) atau CSV
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Otomatis menormalisasi nomor HP (08xx $\rightarrow$ 628xx)
                </p>
              </div>
            )}
          </div>

          {/* Default Tag input */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
              Tag / Kategori Bawaan (Opsional)
            </label>
            <input
              type="text"
              placeholder="Contoh: Database-Marketing-Nov"
              value={defaultTag}
              onChange={(e) => setDefaultTag(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#128C7E] focus:border-transparent transition"
            />
          </div>

          {/* Summary Result */}
          {result && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-emerald-800 font-semibold text-sm">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Import Selesai!</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="bg-white p-2 rounded-lg border border-emerald-100">
                  <span className="text-gray-500 block">Total</span>
                  <span className="font-bold text-gray-800 text-sm">{result.total}</span>
                </div>
                <div className="bg-white p-2 rounded-lg border border-emerald-100">
                  <span className="text-emerald-600 block">Berhasil</span>
                  <span className="font-bold text-emerald-700 text-sm">{result.success}</span>
                </div>
                <div className="bg-white p-2 rounded-lg border border-emerald-100">
                  <span className="text-wa-teal-dark block">Aktif WA</span>
                  <span className="font-bold text-wa-teal text-sm">{result.activeWA}</span>
                </div>
              </div>
            </div>
          )}

          {/* Footer Submit */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 border border-gray-300 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-50 transition"
            >
              Tutup
            </button>
            <button
              type="submit"
              disabled={loading || !file}
              className="px-5 py-2 bg-[#128C7E] hover:bg-[#075E54] disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-2 shadow-sm transition"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Mengimpor & Memvalidasi...</span>
                </>
              ) : (
                <span>Mulai Import</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
