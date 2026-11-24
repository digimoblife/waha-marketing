'use client';

import React, { useState } from 'react';
import { X, UserPlus, Phone, Tag, FileText, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { sanitizePhone, formatDisplayPhone } from '@/lib/phone';

interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onChatCreated: (chatId: string) => void;
}

export default function NewChatModal({ isOpen, onClose, onChatCreated }: NewChatModalProps) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [tags, setTags] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkResult, setCheckResult] = useState<{ checked: boolean; exists: boolean } | null>(null);
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
          tags: tags.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal menyimpan kontak');
      }

      setCheckResult({
        checked: true,
        exists: data.existsOnWhatsApp ?? true,
      });

      // Open the chat room
      const chatId = `${cleanNumber}@c.us`;
      setTimeout(() => {
        onChatCreated(chatId);
        onClose();
        // Reset form
        setPhone('');
        setName('');
        setTags('');
        setNotes('');
        setCheckResult(null);
      }, 600);
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan saat memproses');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-gray-100">
        {/* Header */}
        <div className="bg-[#075E54] text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-wa-green" />
            <h3 className="font-semibold text-lg">Mulai Chat Baru / Kontak</h3>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded-full hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Nomor HP */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
              Nomor WhatsApp <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Contoh: 08123456789 atau 628123456789"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#128C7E] focus:border-transparent transition"
              />
            </div>
            {previewFormatted && (
              <p className="text-[11px] text-gray-500 mt-1">
                Format standar: <span className="font-semibold text-gray-700">{previewFormatted}</span>
              </p>
            )}
          </div>

          {/* Nama Kontak */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
              Nama Kontak (Opsional)
            </label>
            <input
              type="text"
              placeholder="Contoh: Budi Santoso"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#128C7E] focus:border-transparent transition"
            />
          </div>

          {/* Kategori / Tag */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <Tag className="w-3.5 h-3.5 text-gray-400" />
              Tag / Label (Pisahkan dengan koma)
            </label>
            <input
              type="text"
              placeholder="Contoh: Customer, VIP, Promo-Nov"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#128C7E] focus:border-transparent transition"
            />
          </div>

          {/* Catatan Tambahan */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-gray-400" />
              Catatan Kontak
            </label>
            <textarea
              rows={2}
              placeholder="Catatan mengenai pelanggan/klien..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#128C7E] focus:border-transparent transition resize-none"
            />
          </div>

          {/* Live Check Result */}
          {checkResult && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
              <span>Kontak tersimpan! Membuka obrolan...</span>
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
              Batal
            </button>
            <button
              type="submit"
              disabled={loading || !cleanNumber}
              className="px-5 py-2 bg-[#128C7E] hover:bg-[#075E54] disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-2 shadow-sm transition"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Memeriksa & Menyimpan...</span>
                </>
              ) : (
                <span>Buka Chat</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
