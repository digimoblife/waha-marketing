'use client';

import React, { useState, useEffect } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  Filter,
  Info,
} from 'lucide-react';

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const url = `/api/admin/logs?status=${statusFilter}&limit=100`;
      const res = await fetch(url);
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (err) {
      console.error('Fetch logs error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [statusFilter]);

  const filteredLogs = logs.filter((l) => {
    const q = searchQuery.toLowerCase();
    const msg = (l.message || '').toLowerCase();
    const type = (l.type || '').toLowerCase();
    const details = (l.details || '').toLowerCase();
    return msg.includes(q) || type.includes(q) || details.includes(q);
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">
            Log Sukses & Error
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Riwayat log sistem, pengiriman pesan, error webhook, dan autentikasi user.
          </p>
        </div>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="self-start sm:self-auto px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl shadow-xs transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#128C7E]' : ''}`} />
          <span>Muat Ulang</span>
        </button>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Status Filter Buttons */}
        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 ${
              statusFilter === 'ALL'
                ? 'bg-slate-800 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Semua Log
          </button>
          <button
            onClick={() => setStatusFilter('SUCCESS')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 flex items-center gap-1.5 ${
              statusFilter === 'SUCCESS'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Sukses</span>
          </button>
          <button
            onClick={() => setStatusFilter('ERROR')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 flex items-center gap-1.5 ${
              statusFilter === 'ERROR'
                ? 'bg-rose-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Error / Gagal</span>
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Cari pesan atau tipe..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#128C7E] focus:bg-white"
          />
        </div>
      </div>

      {/* Logs Table (TailAdmin Style) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/70 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10.5px]">
              <tr>
                <th className="py-3.5 px-4">Waktu</th>
                <th className="py-3.5 px-4">Tipe Log</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Pesan Aktivitas</th>
                <th className="py-3.5 px-4">Detail / Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    Memuat log aktivitas...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    Tidak ada log yang sesuai dengan filter.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3 px-4 text-slate-500 whitespace-nowrap font-mono text-[11px]">
                      {new Date(l.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-mono text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                        {l.type}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          l.status === 'SUCCESS'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : l.status === 'ERROR'
                            ? 'bg-rose-100 text-rose-800 border border-rose-200'
                            : 'bg-amber-100 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {l.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-800 font-medium max-w-sm">
                      {l.message}
                    </td>
                    <td className="py-3 px-4 text-slate-500 max-w-xs break-words">
                      {l.error ? (
                        <span className="text-rose-600 font-mono text-[11px] block">
                          {l.error}
                        </span>
                      ) : l.details ? (
                        <span className="font-mono text-[10.5px] text-slate-600 truncate block">
                          {l.details}
                        </span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
