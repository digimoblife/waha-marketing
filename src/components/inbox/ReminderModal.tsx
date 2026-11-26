'use client';

import React, { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';

interface ReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialAt?: string | null;
  initialNote?: string | null;
  onSave: (reminderAt: string, reminderNote: string) => Promise<void>;
}

function toDatetimeLocalValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export default function ReminderModal({
  isOpen,
  onClose,
  initialAt,
  initialNote,
  onSave,
}: ReminderModalProps) {
  const [when, setWhen] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (initialAt) {
      const parsed = new Date(initialAt);
      if (!Number.isNaN(parsed.getTime())) {
        setWhen(toDatetimeLocalValue(parsed));
      }
    } else {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(10, 0, 0, 0);
      setWhen(toDatetimeLocalValue(d));
    }
    setNote(initialNote || '');
  }, [isOpen, initialAt, initialNote]);

  if (!isOpen) return null;

  const setPreset = (days: number, addHours = 0) => {
    const d = new Date();
    if (days > 0) {
      d.setDate(d.getDate() + days);
      d.setHours(10, 0, 0, 0);
    } else {
      d.setHours(d.getHours() + addHours);
    }
    setWhen(toDatetimeLocalValue(d));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!when || saving) return;
    setSaving(true);
    try {
      await onSave(new Date(when).toISOString(), note.trim() || 'Follow up merchant');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-[2px] p-4"
      onClick={onClose}
    >
      <div
        className="bg-white border border-[#B0C4CF] rounded-[10px] shadow-2xl max-w-[430px] w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3.5 border-b border-[#D1DEE5] flex items-center justify-between">
          <h3 className="font-bold text-[14.5px] text-[#0F232E]">Atur Pengingat Follow-Up</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[#5C7685] hover:text-[#0F232E] rounded-md hover:bg-[#ECF6FA] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-4 space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-[#0F232E] mb-1.5">
                Pilih Waktu Cepat
              </label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setPreset(0, 1)}
                  className="h-7 px-2.5 border border-[#B0C4CF] bg-white hover:bg-[#F4F8FA] text-xs font-semibold rounded-md cursor-pointer"
                >
                  1 Jam Lagi
                </button>
                <button
                  type="button"
                  onClick={() => setPreset(1, 0)}
                  className="h-7 px-2.5 border border-[#B0C4CF] bg-white hover:bg-[#F4F8FA] text-xs font-semibold rounded-md cursor-pointer"
                >
                  Besok 10:00
                </button>
                <button
                  type="button"
                  onClick={() => setPreset(3, 0)}
                  className="h-7 px-2.5 border border-[#B0C4CF] bg-white hover:bg-[#F4F8FA] text-xs font-semibold rounded-md cursor-pointer"
                >
                  3 Hari Lagi
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0F232E] mb-1">
                Tanggal & Jam Pengingat
              </label>
              <input
                type="datetime-local"
                required
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                className="w-full h-9 px-3 border border-[#B0C4CF] rounded-md text-[13px] font-mono focus:outline-none focus:border-[#00688E]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0F232E] mb-1">
                Catatan Pengingat
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Contoh: Tanyakan kelanjutan upload produk & promo"
                className="w-full h-9 px-3 border border-[#B0C4CF] rounded-md text-[13px] focus:outline-none focus:border-[#00688E]"
              />
            </div>

            <div className="p-2.5 bg-[#F4F8FA] border border-[#D1DEE5] rounded-md text-[11.5px] text-[#435A68] leading-relaxed">
              Saat jatuh tempo, pengingat akan muncul di <strong>Lonceng Notifikasi</strong>,{' '}
              <strong>Desktop Notification</strong>, dan tab <em>Pengingat</em> di Inbox.
            </div>
          </div>

          <div className="px-4 py-3 border-t border-[#D1DEE5] bg-[#F4F8FA] flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 border border-[#B0C4CF] bg-white text-xs font-semibold rounded-md cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving || !when}
              className="h-8 px-3.5 bg-[#00688E] hover:bg-[#005575] text-white text-xs font-semibold rounded-md flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Simpan Pengingat</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
