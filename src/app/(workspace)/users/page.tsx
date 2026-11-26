'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Loader2, X, AlertCircle } from 'lucide-react';
import { useWorkspace } from '@/components/WorkspaceContext';
import Select from '@/components/ui/Select';

export default function UsersPage() {
  const { notify } = useWorkspace();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'OPERATOR' | 'ADMIN'>('OPERATOR');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/users', { cache: 'no-store' });
      const data = await res.json();
      setUsers(data.users || []);
    } catch (err) {
      console.error('Fetch users error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, username, password, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal membuat user');

      setModalOpen(false);
      setName('');
      setUsername('');
      setPassword('');
      setRole('OPERATOR');
      notify(`Akun ${data.user.name} berhasil ditambahkan`);
      fetchUsers();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto bg-[#F4F8FA]">
      <header className="bg-white border-b border-[#D1DEE5] px-4 md:px-7 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-[17px] font-bold text-[#0F232E] tracking-tight">Manajemen Tim</h1>
          <p className="text-[12.5px] text-[#5C7685] mt-0.5">
            Kelola akun Admin & Operator yang menangani Inbox, Merchant, dan Broadcast.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="self-start sm:self-auto h-8 px-3 bg-[#00688E] hover:bg-[#005575] text-white text-[12.5px] font-semibold rounded-md flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Tambah Anggota</span>
        </button>
      </header>

      <div className="p-4 md:p-7 max-w-[1280px] w-full mx-auto">
        <div className="bg-white border border-[#D1DEE5] rounded-lg shadow-[0_1px_2px_rgba(17,24,39,0.04)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[12.5px]">
              <thead>
                <tr className="bg-[#F4F8FA] border-b border-[#D1DEE5] text-[11px] font-semibold uppercase tracking-wider text-[#5C7685]">
                  <th className="py-2.5 px-4">Nama</th>
                  <th className="py-2.5 px-4">Username</th>
                  <th className="py-2.5 px-4">Role</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Obrolan Di-assign</th>
                  <th className="py-2.5 px-4">Dibuat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8EFF3]">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-xs text-[#809AA8]">
                      <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                      Memuat daftar tim...
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id} className="hover:bg-[#FAFBFB]">
                      <td className="py-3 px-4 font-semibold text-[#0F232E]">{u.name}</td>
                      <td className="py-3 px-4 font-mono text-[12px] text-[#435A68]">{u.username}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-[10.5px] font-semibold border ${
                            u.role === 'ADMIN'
                              ? 'bg-[#ECF6FA] text-[#00688E] border-[#A7D6E7]'
                              : 'bg-[#E8EFF3] text-[#435A68] border-[#D1DEE5]'
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10.5px] font-semibold border ${
                            u.isActive
                              ? 'bg-[#E7F8F1] text-[#0D6945] border-[#A7E7CB]'
                              : 'bg-[#FDECEC] text-[#9E1F23] border-[#F7B4B6]'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              u.isActive ? 'bg-[#16A34A]' : 'bg-[#DC2626]'
                            }`}
                          />
                          {u.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-[#435A68]">
                        {u._count?.assignedChats ?? 0} chat
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-[11.5px] text-[#5C7685]">
                        {new Date(u.createdAt).toLocaleDateString('id-ID', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add Member Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="bg-white border border-[#B0C4CF] rounded-[10px] shadow-2xl max-w-[420px] w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3.5 border-b border-[#D1DEE5] flex items-center justify-between">
              <h3 className="font-bold text-[14.5px] text-[#0F232E]">Tambah Anggota Tim</h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 text-[#5C7685] hover:text-[#0F232E] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreate}>
              <div className="p-4 space-y-3.5">
                {error && (
                  <div className="p-2.5 bg-[#FDECEC] border border-[#F7B4B6] text-[#9E1F23] text-xs rounded-md flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-[#0F232E] mb-1">Nama Lengkap</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Contoh: Dina Maharani"
                    className="w-full h-9 px-3 border border-[#B0C4CF] rounded-md text-[13px] focus:outline-none focus:border-[#00688E]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#0F232E] mb-1">Username</label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Contoh: dina.cs"
                    className="w-full h-9 px-3 border border-[#B0C4CF] rounded-md text-[13px] font-mono focus:outline-none focus:border-[#00688E]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#0F232E] mb-1">Password</label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimal 6 karakter"
                    className="w-full h-9 px-3 border border-[#B0C4CF] rounded-md text-[13px] focus:outline-none focus:border-[#00688E]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#0F232E] mb-1">Role</label>
                  <Select
                    value={role}
                    onChange={(v) => setRole(v as 'OPERATOR' | 'ADMIN')}
                    className="w-full h-9 px-3 border border-[#B0C4CF] rounded-md text-[13px] bg-white focus:outline-none focus:border-[#00688E]"
                  >
                    <option value="OPERATOR">OPERATOR (Inbox, Merchant, Broadcast, Template)</option>
                    <option value="ADMIN">ADMIN (Akses Penuh + Monitoring & Pengaturan)</option>
                  </Select>
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
                  disabled={submitting}
                  className="h-8 px-3.5 bg-[#00688E] hover:bg-[#005575] text-white text-xs font-semibold rounded-md flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Simpan Anggota</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
