'use client';

import React, { useState, useRef } from 'react';
import { X, Upload, CheckCircle2, AlertCircle, Loader2, Download } from 'lucide-react';

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
      if (!res.ok) throw new Error(data.error || 'Gagal memproses file import');

      setResult(data.summary);
      onImportSuccess();
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan saat mengunggah');
    } finally {
      setLoading(false);
    }
  };

  const downloadMerchantCSV = () => {
    const link = document.createElement('a');
    link.href = '/sample_merchant_lapaq.csv';
    link.download = 'sample_merchant_lapaq.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-[2px] p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-[10px] shadow-2xl max-w-[480px] w-full overflow-hidden border border-[#B0C4CF]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3.5 border-b border-[#D1DEE5] flex items-center justify-between">
          <h3 className="font-bold text-[14.5px] text-[#0F232E]">Import Database Merchant (CSV / Excel)</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[#5C7685] hover:text-[#0F232E] p-1 rounded-md hover:bg-[#ECF6FA] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleUpload}>
          <div className="p-4 space-y-3.5">
            {error && (
              <div className="p-2.5 bg-[#FDECEC] border border-[#F7B4B6] text-[#9E1F23] text-xs rounded-md flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="p-3 bg-[#F4F8FA] border border-[#D1DEE5] rounded-md flex items-center justify-between gap-3">
              <div className="text-xs">
                <div className="font-semibold text-[#0F232E]">Format Kolom Merchant Lapaq</div>
                <p className="text-[11px] text-[#5C7685] mt-0.5">
                  Nama Pemilik, Nama Toko, Kategori Bisnis, Nomor HP, Email, Tanggal Akun, Alamat
                </p>
              </div>
              <button
                type="button"
                onClick={downloadMerchantCSV}
                className="h-7 px-2.5 shrink-0 border border-[#B0C4CF] bg-white hover:bg-[#ECF6FA] text-xs font-semibold rounded-md flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Contoh CSV</span>
              </button>
            </div>

            <div
              onClick={() => fileInputRef.current?.click()}
              className="border border-dashed border-[#B0C4CF] hover:border-[#00688E] rounded-lg p-6 text-center cursor-pointer bg-[#F4F8FA] hover:bg-[#ECF6FA]/40 transition"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <Upload className="w-7 h-7 text-[#809AA8] mx-auto mb-2" />
              {file ? (
                <div>
                  <p className="text-[13px] font-semibold text-[#0F232E]">{file.name}</p>
                  <p className="text-[11.5px] text-[#5C7685] tabular-nums">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-[13px] font-semibold text-[#0F232E]">
                    Klik untuk pilih file .csv atau .xlsx
                  </p>
                  <p className="text-[11.5px] text-[#5C7685] mt-0.5">
                    Nomor HP otomatis dinormalisasi (08xx → 628xx)
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0F232E] mb-1">
                Tag Bawaan (opsional)
              </label>
              <input
                type="text"
                placeholder="Contoh: Onboarding, Batch-Nov"
                value={defaultTag}
                onChange={(e) => setDefaultTag(e.target.value)}
                className="w-full h-9 px-3 border border-[#B0C4CF] rounded-md text-[13px] focus:outline-none focus:border-[#00688E]"
              />
            </div>

            {result && (
              <div className="p-3 bg-[#E7F8F1] border border-[#A7E7CB] rounded-md space-y-2">
                <div className="flex items-center gap-1.5 text-[#0D6945] font-semibold text-xs">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Import Selesai</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs tabular-nums">
                  <div className="bg-white p-2 rounded border border-[#D1DEE5]">
                    <span className="text-[#5C7685] block text-[11px]">Total</span>
                    <span className="font-bold text-[#0F232E]">{result.total}</span>
                  </div>
                  <div className="bg-white p-2 rounded border border-[#D1DEE5]">
                    <span className="text-[#0D6945] block text-[11px]">Berhasil</span>
                    <span className="font-bold text-[#0D6945]">{result.success}</span>
                  </div>
                  <div className="bg-white p-2 rounded border border-[#D1DEE5]">
                    <span className="text-[#00688E] block text-[11px]">Aktif WA</span>
                    <span className="font-bold text-[#00688E]">{result.activeWA}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="px-4 py-3 border-t border-[#D1DEE5] bg-[#F4F8FA] flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="h-8 px-3 border border-[#B0C4CF] bg-white hover:bg-[#F4F8FA] text-xs font-semibold rounded-md cursor-pointer"
            >
              Tutup
            </button>
            <button
              type="submit"
              disabled={loading || !file}
              className="h-8 px-3.5 bg-[#00688E] hover:bg-[#005575] disabled:opacity-50 text-white text-xs font-semibold rounded-md flex items-center gap-1.5 cursor-pointer"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{loading ? 'Mengimpor...' : 'Mulai Import'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
