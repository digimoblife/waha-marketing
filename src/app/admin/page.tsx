'use client';

import React, { useState, useEffect } from 'react';
import {
  Send,
  Inbox,
  FileImage,
  Users,
  CheckCircle2,
  AlertTriangle,
  Server,
  RefreshCw,
  ArrowUpRight,
  ShieldAlert,
  Clock,
} from 'lucide-react';

export default function AdminDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/stats');
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Fetch stats error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  const stats = data?.stats || {};
  const waha = data?.wahaSession || {};
  const logs = data?.recentLogs || [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Title & Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">
            Dashboard Penggunaan WAHA
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Monitoring performa pengiriman pesan, engine WhatsApp, dan log aktivitas real-time.
          </p>
        </div>
        <button
          onClick={fetchStats}
          disabled={loading}
          className="self-start sm:self-auto px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl shadow-xs transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#128C7E]' : ''}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* WAHA Engine Status Banner */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 shrink-0">
            <Server className="w-5 h-5 text-[#128C7E]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-800">
                Engine WAHA: <span className="font-mono text-[#075E54]">NOWEB</span>
              </h3>
              <span
                className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                  waha.status === 'WORKING'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : waha.status === 'SCAN_QR_CODE'
                    ? 'bg-amber-100 text-amber-800 border border-amber-200 animate-pulse'
                    : 'bg-rose-100 text-rose-800 border border-rose-200'
                }`}
              >
                {waha.status || 'OFFLINE'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Target Webhook: <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700 font-mono text-[11px]">/api/webhook</code> • Sesi: <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700 font-mono text-[11px]">default</code>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs text-slate-600">
          <div className="text-right">
            <span className="text-[11px] text-slate-400 block">Akun WhatsApp:</span>
            <span className="font-semibold text-slate-800">
              {waha.me?.id ? waha.me.id.replace('@c.us', '') : 'Belum Terhubung'}
            </span>
          </div>
          <a
            href="/"
            className="px-3.5 py-2 bg-[#128C7E] hover:bg-[#075E54] text-white font-semibold text-xs rounded-xl shadow-xs transition"
          >
            Buka QR Scanner
          </a>
        </div>
      </div>

      {/* 4 Stat Cards (TailAdmin Style) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Messages */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Send className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
              Pesan Keluar
            </span>
          </div>
          <div className="mt-4">
            <h4 className="text-2xl font-bold text-slate-800">
              {stats.totalSent ?? 0}
            </h4>
            <p className="text-xs text-slate-400 mt-1">
              Dari total {stats.totalMessages ?? 0} pesan tersimpan
            </p>
          </div>
        </div>

        {/* Card 2: Received Messages */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Inbox className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
              Pesan Masuk
            </span>
          </div>
          <div className="mt-4">
            <h4 className="text-2xl font-bold text-slate-800">
              {stats.totalReceived ?? 0}
            </h4>
            <p className="text-xs text-slate-400 mt-1">
              Diterima via webhook WAHA
            </p>
          </div>
        </div>

        {/* Card 3: Media Sent */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <FileImage className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-semibold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
              Media
            </span>
          </div>
          <div className="mt-4">
            <h4 className="text-2xl font-bold text-slate-800">
              {stats.totalMedia ?? 0}
            </h4>
            <p className="text-xs text-slate-400 mt-1">
              Foto, Video, dan Dokumen
            </p>
          </div>
        </div>

        {/* Card 4: Total Contacts & Users */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
              {stats.totalUsers ?? 1} Pengguna
            </span>
          </div>
          <div className="mt-4">
            <h4 className="text-2xl font-bold text-slate-800">
              {stats.totalContacts ?? 0}
            </h4>
            <p className="text-xs text-slate-400 mt-1">
              Kontak di buku telepon ({stats.totalChats ?? 0} obrolan)
            </p>
          </div>
        </div>
      </div>

      {/* Grid: Success vs Error Rates & Quick Log Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Success/Error Rate Box */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-5">
          <div>
            <h3 className="text-sm font-bold text-slate-800">
              Kesehatan Operasional
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Rasio keberhasilan pengiriman dan respon API.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                <span className="text-emerald-700 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Log Berhasil
                </span>
                <span className="text-slate-800">{stats.successCount ?? 0} aksi</span>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full"
                  style={{
                    width: `${
                      (stats.successCount + stats.errorCount > 0)
                        ? Math.round(
                            (stats.successCount /
                              (stats.successCount + stats.errorCount)) *
                              100
                          )
                        : 100
                    }%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                <span className="text-rose-700 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Log Gagal / Error
                </span>
                <span className="text-slate-800">{stats.errorCount ?? 0} error</span>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-rose-500 rounded-full"
                  style={{
                    width: `${
                      (stats.successCount + stats.errorCount > 0)
                        ? Math.round(
                            (stats.errorCount /
                              (stats.successCount + stats.errorCount)) *
                              100
                          )
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-500">Log Sukses & Error Lengkap</span>
            <a
              href="/admin/logs"
              className="text-xs font-semibold text-[#128C7E] hover:underline flex items-center gap-1"
            >
              <span>Buka Log</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Recent Activity Table (2 columns on large) */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-800">
                  Log Aktivitas Terbaru
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Aktivitas autentikasi, pesan, dan engine WAHA
                </p>
              </div>
              <a
                href="/admin/logs"
                className="text-xs font-semibold text-[#128C7E] hover:underline"
              >
                Lihat Semua
              </a>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-medium">
                    <th className="pb-2">Waktu</th>
                    <th className="pb-2">Tipe</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2">Pesan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-slate-400">
                        Belum ada data log aktivitas.
                      </td>
                    </tr>
                  ) : (
                    logs.map((l: any) => (
                      <tr key={l.id} className="hover:bg-slate-50/80 transition">
                        <td className="py-2.5 text-slate-400 whitespace-nowrap">
                          {new Date(l.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </td>
                        <td className="py-2.5 font-mono text-[11px] text-slate-600">
                          {l.type}
                        </td>
                        <td className="py-2.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              l.status === 'SUCCESS'
                                ? 'bg-emerald-50 text-emerald-700'
                                : l.status === 'ERROR'
                                ? 'bg-rose-50 text-rose-700'
                                : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {l.status}
                          </span>
                        </td>
                        <td className="py-2.5 text-slate-700 font-medium truncate max-w-xs">
                          {l.message}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
