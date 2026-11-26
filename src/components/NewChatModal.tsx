'use client';

import React, { useState } from 'react';
import { X, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { sanitizePhone, formatDisplayPhone } from '@/lib/phone';

interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onChatCreated: (chatId: string) => void;
}

export default function NewChatModal({ isOpen, onClose, onChatCreated }: NewChatModalProps) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [storeName, setStoreName] = useState('');
  const [tags, setTags] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const cleanNumber = sanitizePhone(phone);
  const previewFormatted = cleanNumber ? formatDisplayPhone(cleanNumber) : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cleanNumber) {
      setError('Masukkan nomor telepon yang valid');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: cleanNumber,
          name: name.trim() || undefined,
          storeName: storeName.trim() || undefined,
          tags: tags.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan kontak');

      setDone(true);
      const chatId = `${cleanNumber}@c.us`;
      setTimeout(() => {
        onChatCreated(chatId);
        onClose();
        setPhone('');
        setName('');
        setStoreName('');
        setTags('');
        setDone(false);
      }, 400);
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-[2px] p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-[10px] shadow-2xl max-w-[440px] w-full overflow-hidden border border-[#B0C4CF]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3.5 border-b border-[#D1DEE5] flex items-center justify-between">
          <h3 className="font-bold text-[14.5px] text-[#0F232E]">Mulai Obrolan Baru</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[#5C7685] hover:text-[#0F232E] p-1 rounded-md hover:bg-[#ECF6FA] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-4 space-y-3.5">
            {error && (
              <div className="p-2.5 bg-[#FDECEC] border border-[#F7B4B6] text-[#9E1F23] text-xs rounded-md flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[#0F232E] mb-1">
                Nomor WhatsApp <span className="text-[#9E1F23]">*</span>
              </label>
              <input
                type="text"
                required
                autoFocus
                placeholder="Contoh: 081234567890"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full h-9 px-3 border border-[#B0C4CF] rounded-md text-[13px] font-mono focus:outline-none focus:border-[#00688E] focus:ring-2 focus:ring-[#00688E]/10"
              />
              {previewFormatted && (
                <p className="text-[11px] text-[#5C7685] mt-1 font-mono tabular-nums">
                  Format: {previewFormatted}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-semibold text-[#0F232E] mb-1">Nama Pemilik</label>
                <input
                  type="text"
                  placeholder="Contoh: Rizky"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-9 px-3 border border-[#B0C4CF] rounded-md text-[13px] focus:outline-none focus:border-[#00688E]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#0F232E] mb-1">Nama Toko</label>
                <input
                  type="text"
                  placeholder="Contoh: Kopi Senja"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  className="w-full h-9 px-3 border border-[#B0C4CF] rounded-md text-[13px] focus:outline-none focus:border-[#00688E]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0F232E] mb-1">Label / Tags (opsional)</label>
              <input
                type="text"
                placeholder="VIP, Follow Up"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                className="w-full h-9 px-3 border border-[#B0C4CF] rounded-md text-[13px] focus:outline-none focus:border-[#00688E]"
              />
            </div>

            {done && (
              <div className="p-2.5 bg-[#E7F8F1] border border-[#A7E7CB] text-[#0D6945] text-xs rounded-md flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Kontak tersimpan! Membuka obrolan...</span>
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
              Batal
            </button>
            <button
              type="submit"
              disabled={loading || !cleanNumber}
              className="h-8 px-3.5 bg-[#00688E] hover:bg-[#005575] disabled:opacity-50 text-white text-xs font-semibold rounded-md flex items-center gap-1.5 cursor-pointer"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{loading ? 'Memeriksa...' : 'Mulai Chat'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
