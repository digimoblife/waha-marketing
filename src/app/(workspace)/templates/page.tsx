'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Plus, Loader2, X, Trash2, Pencil, AlertCircle } from 'lucide-react';
import { useWorkspace } from '@/components/WorkspaceContext';
import Select from '@/components/ui/Select';

interface TemplateItem {
  id: string;
  shortcut: string;
  title: string;
  category: string;
  body: string;
}

export default function TemplatesPage() {
  const { notify } = useWorkspace();
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TemplateItem | null>(null);
  const [shortcut, setShortcut] = useState('/');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Promo');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/templates', { cache: 'no-store' });
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch (err) {
      console.error('Fetch templates error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const openModal = (tpl?: TemplateItem) => {
    setError('');
    if (tpl) {
      setEditing(tpl);
      setShortcut(tpl.shortcut);
      setTitle(tpl.title);
      setCategory(tpl.category);
      setBody(tpl.body);
    } else {
      setEditing(null);
      setShortcut('/');
      setTitle('');
      setCategory('Promo');
      setBody('');
    }
    setModalOpen(true);
  };

  const insertVar = (v: string) => {
    const el = textareaRef.current;
    if (!el) {
      setBody((prev) => prev + v);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + v + body.slice(end);
    setBody(next);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + v.length, start + v.length);
    }, 0);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');

    try {
      const res = await fetch('/api/templates', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editing ? { id: editing.id } : {}),
          shortcut,
          title,
          category,
          body,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan template');

      setModalOpen(false);
      notify(`Template ${data.template.shortcut} berhasil disimpan`);
      fetchTemplates();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (tpl: TemplateItem) => {
    if (!confirm(`Hapus template ${tpl.shortcut} (${tpl.title})?`)) return;
    try {
      const res = await fetch(`/api/templates?id=${encodeURIComponent(tpl.id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Gagal menghapus template');
      notify(`Template ${tpl.shortcut} dihapus`);
      fetchTemplates();
    } catch (err: any) {
      notify(err.message);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto bg-[#F4F8FA]">
      <header className="bg-white border-b border-[#D1DEE5] px-4 md:px-7 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-[17px] font-bold text-[#0F232E] tracking-tight">Template Pesan</h1>
          <p className="text-[12.5px] text-[#5C7685] mt-0.5">
            Kelola template cepat untuk perintah <code className="font-mono text-[#00688E]">/</code>{' '}
            di Inbox dan materi Broadcast.
          </p>
        </div>

        <button
          type="button"
          onClick={() => openModal()}
          className="self-start sm:self-auto h-8 px-3 bg-[#00688E] hover:bg-[#005575] text-white text-[12.5px] font-semibold rounded-md inline-flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Buat Template Baru</span>
        </button>
      </header>

      <div className="p-4 md:p-7 max-w-[1280px] w-full mx-auto">
        {loading ? (
          <div className="py-16 text-center text-xs text-[#809AA8]">
            <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
            Memuat template pesan...
          </div>
        ) : templates.length === 0 ? (
          <div className="bg-white border border-[#D1DEE5] rounded-lg p-12 text-center text-xs text-[#809AA8]">
            Belum ada template. Buat template pertama Anda.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((t) => (
              <div
                key={t.id}
                className="bg-white border border-[#D1DEE5] rounded-lg p-4 shadow-[0_1px_2px_rgba(17,24,39,0.04)] flex flex-col gap-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-[11.5px] font-bold text-[#00688E] bg-[#ECF6FA] border border-[#A7D6E7] px-2 py-0.5 rounded shrink-0">
                      {t.shortcut}
                    </span>
                    <h3 className="text-[13.5px] font-bold text-[#0F232E] truncate">{t.title}</h3>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-[#E8EFF3] border border-[#D1DEE5] text-[10.5px] font-semibold text-[#435A68] shrink-0">
                    {t.category}
                  </span>
                </div>

                <div className="flex-1 bg-[#F4F8FA] border border-[#E8EFF3] rounded-md p-3 text-[12.5px] text-[#435A68] leading-relaxed whitespace-pre-wrap">
                  {t.body}
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openModal(t)}
                      className="h-7 px-2 text-xs font-semibold text-[#435A68] hover:text-[#0F232E] hover:bg-[#ECF6FA] rounded inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Pencil className="w-3 h-3" /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(t)}
                      className="h-7 px-2 text-xs font-semibold text-[#9E1F23] hover:bg-[#FDECEC] rounded inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" /> Hapus
                    </button>
                  </div>

                  <Link
                    href={`/broadcast?templateId=${encodeURIComponent(t.id)}`}
                    className="h-7 px-2.5 bg-white hover:bg-[#F4F8FA] border border-[#B0C4CF] text-[#0F232E] text-xs font-semibold rounded-md inline-flex items-center transition"
                  >
                    Pakai di Broadcast →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit Template Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="bg-white border border-[#B0C4CF] rounded-[10px] shadow-2xl max-w-[480px] w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3.5 border-b border-[#D1DEE5] flex items-center justify-between">
              <h3 className="font-bold text-[14.5px] text-[#0F232E]">
                {editing ? 'Edit Template Pesan' : 'Buat Template Pesan'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 text-[#5C7685] hover:text-[#0F232E] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave}>
              <div className="p-4 space-y-3.5">
                {error && (
                  <div className="p-2.5 bg-[#FDECEC] border border-[#F7B4B6] text-[#9E1F23] text-xs rounded-md flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#0F232E] mb-1">
                      Shortcut (tanpa spasi)
                    </label>
                    <input
                      type="text"
                      required
                      value={shortcut}
                      onChange={(e) => setShortcut(e.target.value)}
                      placeholder="/promo"
                      className="w-full h-9 px-3 border border-[#B0C4CF] rounded-md text-[13px] font-mono focus:outline-none focus:border-[#00688E]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#0F232E] mb-1">Kategori</label>
                    <Select
                      value={category}
                      onChange={(v) => setCategory(v)}
                      className="w-full h-9 px-2.5 border border-[#B0C4CF] rounded-md text-[13px] bg-white focus:outline-none focus:border-[#00688E]"
                    >
                      <option value="Onboarding">Onboarding</option>
                      <option value="Follow Up">Follow Up</option>
                      <option value="Promo">Promo</option>
                      <option value="CS">CS</option>
                      <option value="Umum">Umum</option>
                    </Select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#0F232E] mb-1">
                    Judul Template
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Contoh: Info Promo Gratis Ongkir"
                    className="w-full h-9 px-3 border border-[#B0C4CF] rounded-md text-[13px] focus:outline-none focus:border-[#00688E]"
                  />
                </div>

                <div>
                  <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                    <label className="text-xs font-semibold text-[#0F232E]">Isi Pesan</label>
                    <div className="flex items-center gap-1">
                      {['{nama}', '{nama_toko}', '{kategori}'].map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => insertVar(v)}
                          className="font-mono text-[10.5px] font-semibold px-1.5 py-0.5 rounded bg-[#E8EFF3] border border-[#D1DEE5] text-[#00688E] hover:bg-[#ECF6FA] hover:border-[#A7D6E7] cursor-pointer"
                        >
                          + {v}
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    ref={textareaRef}
                    required
                    rows={4}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Halo Kak {nama} dari {nama_toko}..."
                    className="w-full p-2.5 border border-[#B0C4CF] rounded-md text-[13px] focus:outline-none focus:border-[#00688E]"
                  />
                </div>
              </div>

              <div className="px-4 py-3 border-t border-[#D1DEE5] bg-[#F4F8FA] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="h-8 px-3 border border-[#B0C4CF] bg-white text-xs font-semibold rounded-md cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="h-8 px-3.5 bg-[#00688E] hover:bg-[#005575] text-white text-xs font-semibold rounded-md flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Simpan Template</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
