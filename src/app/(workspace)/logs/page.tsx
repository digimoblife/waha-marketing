'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Loader2 } from 'lucide-react';
import Select from '@/components/ui/Select';

export default function LogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ limit: '150' });
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (typeFilter !== 'ALL') params.set('type', typeFilter);

      const res = await fetch(`/api/admin/logs?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (err) {
      console.error('Fetch logs error:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto bg-[#F4F8FA]">
      <header className="bg-white border-b border-[#D1DEE5] px-4 md:px-7 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-[17px] font-bold text-[#0F232E] tracking-tight">
            Log Aktivitas & Error
          </h1>
          <p className="text-[12.5px] text-[#5C7685] mt-0.5">
            Audit pengiriman pesan, broadcast, webhook masuk, upload media, dan sesi WAHA.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchLogs}
          disabled={loading}
          className="self-start sm:self-auto h-8 px-3 bg-white hover:bg-[#F4F8FA] border border-[#B0C4CF] text-[#0F232E] text-[12.5px] font-semibold rounded-md flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#00688E]' : ''}`} />
          <span>Refresh</span>
        </button>
      </header>

      <div className="p-4 md:p-7 max-w-[1280px] w-full mx-auto">
        <div className="bg-white border border-[#D1DEE5] rounded-lg shadow-[0_1px_2px_rgba(17,24,39,0.04)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E8EFF3] flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-1 flex-wrap">
              {['ALL', 'SUCCESS', 'WARNING', 'ERROR'].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 rounded text-[11.5px] font-semibold transition cursor-pointer ${
                    statusFilter === st
                      ? 'bg-[#0F232E] text-white'
                      : 'text-[#5C7685] hover:bg-[#ECF6FA] hover:text-[#0F232E]'
                  }`}
                >
                  {st === 'ALL' ? 'Semua' : st}
                </button>
              ))}
            </div>

            <Select
              value={typeFilter}
              onChange={(v) => setTypeFilter(v)}
              className="h-8 px-2.5 border border-[#D1DEE5] rounded-md text-xs bg-white focus:outline-none focus:border-[#00688E]"
            >
              <option value="ALL">Semua Tipe</option>
              <option value="MESSAGE_SENT">MESSAGE_SENT</option>
              <option value="MESSAGE_RECEIVED">MESSAGE_RECEIVED</option>
              <option value="BROADCAST">BROADCAST</option>
              <option value="MEDIA_UPLOAD">MEDIA_UPLOAD</option>
              <option value="SESSION_CHANGE">SESSION_CHANGE</option>
              <option value="AUTH">AUTH</option>
              <option value="ERROR">ERROR</option>
            </Select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[12.5px]">
              <thead>
                <tr className="bg-[#F4F8FA] border-b border-[#D1DEE5] text-[11px] font-semibold uppercase tracking-wider text-[#5C7685]">
                  <th className="py-2.5 px-4">Waktu</th>
                  <th className="py-2.5 px-4">Tipe</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Pesan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8EFF3]">
                {loading && logs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-10 text-center text-xs text-[#809AA8]">
                      <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                      Memuat log...
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-10 text-center text-xs text-[#809AA8]">
                      Belum ada data log aktivitas untuk filter ini.
                    </td>
                  </tr>
                ) : (
                  logs.map((l) => (
                    <tr key={l.id} className="hover:bg-[#FAFBFB]">
                      <td className="py-2.5 px-4 font-mono tabular-nums text-[11.5px] text-[#5C7685] whitespace-nowrap">
                        {new Date(l.createdAt).toLocaleString('id-ID', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-[11.5px] font-semibold text-[#0F232E] whitespace-nowrap">
                        {l.type}
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-[10.5px] font-semibold border ${
                            l.status === 'SUCCESS'
                              ? 'bg-[#E7F8F1] text-[#0D6945] border-[#A7E7CB]'
                              : l.status === 'ERROR'
                              ? 'bg-[#FDECEC] text-[#9E1F23] border-[#F7B4B6]'
                              : 'bg-[#FEF5E4] text-[#8F5A05] border-[#F7D488]'
                          }`}
                        >
                          {l.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-[#0F232E]">
                        <div>{l.message}</div>
                        {l.error && (
                          <div className="text-[11px] font-mono text-[#9E1F23] mt-0.5 break-all">
                            {l.error}
                          </div>
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
    </div>
  );
}
