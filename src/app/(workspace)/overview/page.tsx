'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { RefreshCw, Loader2 } from 'lucide-react';
import { useWorkspace } from '@/components/WorkspaceContext';

export default function AdminOverviewPage() {
  const { openQRModal, notify } = useWorkspace();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchOverview = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await fetch('/api/admin/overview', { cache: 'no-store' });
      const json = await res.json();
      if (res.ok) setData(json);
    } catch (err) {
      console.error('Fetch overview error:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview(false);
    const interval = setInterval(() => fetchOverview(true), 15000);
    return () => clearInterval(interval);
  }, [fetchOverview]);

  const waha = data?.wahaSession || {};
  const guardrail = data?.guardrail || {
    sentToday: 0,
    maxDailyMessages: 500,
    minDelaySec: 10,
    outInRatio: 0,
  };
  const kpis = data?.kpis || {};
  const workload: any[] = data?.workload || [];
  const slaAlerts: any[] = data?.slaAlerts || [];
  const traffic7d: any[] = data?.traffic7d || [];
  const funnel = data?.funnel || { open: 0, followUp: 0, resolved: 0, total: 0 };
  const errBreak = data?.errorBreakdown || { notWa: 0, timeout: 0, other: 0 };
  const recentLogs: any[] = data?.recentLogs || [];

  const quotaPct = Math.min(
    100,
    Math.round((guardrail.sentToday / Math.max(1, guardrail.maxDailyMessages)) * 100)
  );
  const quotaBarColor =
    quotaPct >= 85 ? '#DC2626' : quotaPct >= 65 ? '#D97706' : '#00688E';

  const maxTraffic = Math.max(
    10,
    ...traffic7d.map((d) => Math.max(d.out || 0, d.in || 0))
  );
  const roundedCeiling = Math.ceil(maxTraffic / 10) * 10;

  const funnelTotal = Math.max(1, funnel.total || 0);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto bg-[#F4F8FA]">
      {/* Page Header */}
      <header className="bg-white border-b border-[#D1DEE5] px-4 md:px-7 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-[17px] font-bold text-[#0F232E] tracking-tight">
            Overview & Monitoring Admin
          </h1>
          <p className="text-[12.5px] text-[#5C7685] mt-0.5">
            Kesehatan WAHA, guardrail anti-ban, workload operator, SLA balasan, dan trafik 7 hari.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => fetchOverview(false)}
            disabled={loading}
            className="h-8 px-3 bg-white hover:bg-[#F4F8FA] border border-[#B0C4CF] text-[#0F232E] text-xs font-semibold rounded-md inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#00688E]' : ''}`} />
            <span>Refresh</span>
          </button>
          <Link
            href="/settings"
            className="h-8 px-3 bg-white hover:bg-[#F4F8FA] border border-[#B0C4CF] text-[#0F232E] text-xs font-semibold rounded-md inline-flex items-center"
          >
            Pengaturan Guardrail & SLA
          </Link>
          <button
            type="button"
            onClick={openQRModal}
            className="h-8 px-3 bg-[#00688E] hover:bg-[#005575] text-white text-xs font-semibold rounded-md cursor-pointer"
          >
            Kelola Sesi / QR
          </button>
        </div>
      </header>

      <div className="p-4 md:p-7 max-w-[1280px] w-full mx-auto space-y-5">
        {loading && !data ? (
          <div className="py-16 text-center text-xs text-[#809AA8]">
            <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
            Memuat data monitoring...
          </div>
        ) : (
          <>
            {/* Row 1: Engine Status + Anti-Ban Guardrail */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-7 bg-white border border-[#D1DEE5] rounded-lg px-4 py-3.5 shadow-[0_1px_2px_rgba(17,24,39,0.04)] flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      waha.status === 'WORKING'
                        ? 'bg-[#16A34A] shadow-[0_0_0_3px_rgba(22,163,74,0.18)]'
                        : waha.status === 'SCAN_QR_CODE'
                        ? 'bg-[#D97706] animate-pulse'
                        : 'bg-[#DC2626]'
                    }`}
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[13.5px] font-bold text-[#0F232E]">
                        WAHA Engine (NOWEB)
                      </span>
                      <span
                        className={`text-[10.5px] font-semibold px-2 py-0.5 rounded border ${
                          waha.status === 'WORKING'
                            ? 'bg-[#E7F8F1] text-[#0D6945] border-[#A7E7CB]'
                            : waha.status === 'SCAN_QR_CODE'
                            ? 'bg-[#FEF5E4] text-[#8F5A05] border-[#F7D488]'
                            : 'bg-[#FDECEC] text-[#9E1F23] border-[#F7B4B6]'
                        }`}
                      >
                        {waha.status || 'OFFLINE'}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#5C7685] mt-0.5">
                      <span>
                        Akun:{' '}
                        <strong className="font-mono tabular-nums text-[#0F232E]">
                          {waha.me?.id ? waha.me.id.replace('@c.us', '') : 'Belum Terhubung'}
                        </strong>
                      </span>
                      <span>•</span>
                      <span>
                        Ping:{' '}
                        <code className="font-mono text-[11px] bg-[#E8EFF3] px-1.5 py-0.5 rounded text-[#0F232E]">
                          {waha.latencyMs ?? 0}ms
                        </code>
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    fetchOverview(false);
                    notify(`Ping WAHA selesai (${waha.status || 'OFFLINE'})`);
                  }}
                  className="h-7 px-2.5 bg-white hover:bg-[#F4F8FA] border border-[#B0C4CF] text-xs font-semibold rounded-md cursor-pointer"
                >
                  Tes Koneksi
                </button>
              </div>

              <div className="lg:col-span-5 bg-white border border-[#D1DEE5] rounded-lg px-4 py-3.5 shadow-[0_1px_2px_rgba(17,24,39,0.04)] flex flex-col justify-center gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#0F232E]">Guardrail Anti-Ban Harian</span>
                  <span
                    className={`text-[10.5px] font-semibold px-2 py-0.5 rounded border tabular-nums ${
                      quotaPct >= 85
                        ? 'bg-[#FDECEC] text-[#9E1F23] border-[#F7B4B6]'
                        : quotaPct >= 65
                        ? 'bg-[#FEF5E4] text-[#8F5A05] border-[#F7D488]'
                        : 'bg-[#E7F8F1] text-[#0D6945] border-[#A7E7CB]'
                    }`}
                  >
                    {quotaPct >= 85 ? 'HAMPIR PENUH' : quotaPct >= 65 ? 'WASPADA' : 'AMAN'} • Rasio{' '}
                    {guardrail.outInRatio}:1
                  </span>
                </div>
                <div className="h-2 w-full bg-[#E8EFF3] rounded-full overflow-hidden">
                  <div
                    className="h-full transition-all duration-300"
                    style={{ width: `${quotaPct}%`, backgroundColor: quotaBarColor }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11.5px] text-[#5C7685] tabular-nums">
                  <span>
                    Terkirim hari ini:{' '}
                    <strong className="text-[#0F232E]">
                      {guardrail.sentToday} / {guardrail.maxDailyMessages}
                    </strong>
                  </span>
                  <span>
                    Min. delay:{' '}
                    <strong className="font-mono text-[#0F232E]">{guardrail.minDelaySec}s</strong>
                  </span>
                </div>
              </div>
            </div>

            {/* Row 2: Unified Horizontal KPI Strip (Zero Rainbow Slop) */}
            <div className="bg-white border border-[#D1DEE5] rounded-lg shadow-[0_1px_2px_rgba(17,24,39,0.04)] grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-[#D1DEE5]">
              <div className="p-4 sm:p-5 space-y-1">
                <div className="flex items-center justify-between text-xs text-[#5C7685] font-medium">
                  <span>Pesan Keluar (7h)</span>
                  <span className="font-mono text-[11px] font-semibold text-[#0D6945] tabular-nums">
                    {kpis.received7d ?? 0} masuk
                  </span>
                </div>
                <div className="text-[26px] font-bold tracking-tight text-[#0F232E] tabular-nums leading-tight">
                  {kpis.sent7d ?? 0}
                </div>
                <div className="text-[11.5px] text-[#5C7685] tabular-nums">
                  {kpis.activeWAContacts ?? 0} / {kpis.totalContacts ?? 0} kontak aktif WA
                </div>
              </div>

              <div className="p-4 sm:p-5 space-y-1">
                <div className="flex items-center justify-between text-xs text-[#5C7685] font-medium">
                  <span>Response Rate (7h)</span>
                </div>
                <div className="text-[26px] font-bold tracking-tight text-[#0F232E] tabular-nums leading-tight">
                  {kpis.responseRate ?? 0}%
                </div>
                <div className="text-[11.5px] text-[#5C7685]">
                  Obrolan keluar yang dibalas merchant
                </div>
              </div>

              <div className="p-4 sm:p-5 space-y-1">
                <div className="flex items-center justify-between text-xs text-[#5C7685] font-medium">
                  <span>Delivery Success</span>
                  <span className="font-mono text-[11px] font-semibold text-[#0D6945] tabular-nums">
                    {kpis.deliverySuccessRate ?? 100}%
                  </span>
                </div>
                <div className="text-[26px] font-bold tracking-tight text-[#0F232E] tabular-nums leading-tight">
                  {kpis.errorCount7d ?? 0}
                </div>
                <div className="text-[11.5px] text-[#5C7685]">
                  Total error operasional 7 hari terakhir
                </div>
              </div>

              <div className="p-4 sm:p-5 space-y-1">
                <div className="flex items-center justify-between text-xs text-[#5C7685] font-medium">
                  <span>SLA Perlu Tindakan</span>
                  <span
                    className={`text-[10.5px] font-semibold px-1.5 py-0.5 rounded border tabular-nums ${
                      (kpis.slaAlertCount ?? 0) > 0
                        ? 'bg-[#FEF5E4] text-[#8F5A05] border-[#F7D488]'
                        : 'bg-[#E7F8F1] text-[#0D6945] border-[#A7E7CB]'
                    }`}
                  >
                    {(kpis.slaAlertCount ?? 0) > 0 ? `${kpis.slaAlertCount} Alert` : 'Normal'}
                  </span>
                </div>
                <div className="text-[26px] font-bold tracking-tight text-[#0F232E] tabular-nums leading-tight">
                  {kpis.slaAlertCount ?? 0}
                </div>
                <div className="text-[11.5px] text-[#5C7685]">
                  Unassigned / belum dibalas / overdue
                </div>
              </div>
            </div>

            {/* Row 3: Operator Workload + SLA & Overdue Alert Queue */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className="lg:col-span-7 bg-white border border-[#D1DEE5] rounded-lg shadow-[0_1px_2px_rgba(17,24,39,0.04)] overflow-hidden">
                <div className="px-4 py-3.5 border-b border-[#E8EFF3] flex items-center justify-between">
                  <div>
                    <h2 className="text-[13.5px] font-bold text-[#0F232E]">
                      Workload & Performa Operator
                    </h2>
                    <p className="text-[11.5px] text-[#5C7685]">
                      Distribusi status obrolan aktif per PIC secara real-time
                    </p>
                  </div>
                  <Link
                    href="/users"
                    className="text-xs font-semibold text-[#00688E] hover:underline"
                  >
                    Kelola Tim →
                  </Link>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-[12.5px]">
                    <thead>
                      <tr className="bg-[#F4F8FA] border-b border-[#D1DEE5] text-[11px] font-semibold uppercase tracking-wider text-[#5C7685]">
                        <th className="py-2.5 px-4">Operator</th>
                        <th className="py-2.5 px-3 text-center">Open</th>
                        <th className="py-2.5 px-3 text-center">Follow Up</th>
                        <th className="py-2.5 px-3 text-center">Selesai</th>
                        <th className="py-2.5 px-3 text-center">Pengingat</th>
                        <th className="py-2.5 px-4 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8EFF3]">
                      {workload.map((op) => {
                        const isUnassigned = op.id === 'UNASSIGNED';
                        return (
                          <tr key={op.id} className="hover:bg-[#FAFBFB]">
                            <td className="py-2.5 px-4">
                              <span
                                className={`font-semibold ${
                                  isUnassigned && op.total > 0 ? 'text-[#9E1F23]' : 'text-[#0F232E]'
                                }`}
                              >
                                {op.name}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono tabular-nums">{op.open}</td>
                            <td className="py-2.5 px-3 text-center font-mono tabular-nums">{op.followUp}</td>
                            <td className="py-2.5 px-3 text-center font-mono tabular-nums">{op.resolved}</td>
                            <td className="py-2.5 px-3 text-center font-mono tabular-nums">
                              {op.reminders > 0 ? (
                                <span className="px-1.5 py-0.5 rounded bg-[#FEF5E4] border border-[#F7D488] text-[#8F5A05] text-[11px] font-semibold">
                                  {op.reminders}
                                </span>
                              ) : (
                                '0'
                              )}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-[#435A68]">
                              {op.total}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="lg:col-span-5 bg-white border border-[#D1DEE5] rounded-lg shadow-[0_1px_2px_rgba(17,24,39,0.04)] overflow-hidden flex flex-col">
                <div className="px-4 py-3.5 border-b border-[#E8EFF3]">
                  <h2 className="text-[13.5px] font-bold text-[#0F232E]">Antrean SLA & Overdue</h2>
                  <p className="text-[11.5px] text-[#5C7685]">
                    Obrolan unassigned, belum dibalas, atau pengingat jatuh tempo
                  </p>
                </div>

                <div className="flex-1 divide-y divide-[#E8EFF3] max-h-[290px] overflow-y-auto">
                  {slaAlerts.length === 0 ? (
                    <div className="py-10 text-center text-xs text-[#809AA8]">
                      Semua obrolan tertangani sesuai SLA.
                    </div>
                  ) : (
                    slaAlerts.map((item) => (
                      <div
                        key={`${item.chatId}-${item.type}`}
                        className="px-4 py-2.5 flex items-center justify-between gap-2.5 hover:bg-[#FAFBFB]"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[12.5px] font-semibold text-[#0F232E] truncate">
                              {item.title}
                            </span>
                            <span
                              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0 ${
                                item.type === 'UNASSIGNED'
                                  ? 'bg-[#FDECEC] text-[#9E1F23] border-[#F7B4B6]'
                                  : item.type === 'OVERDUE'
                                  ? 'bg-[#FEF5E4] text-[#8F5A05] border-[#F7D488]'
                                  : 'bg-[#ECF6FA] text-[#00688E] border-[#A7D6E7]'
                              }`}
                            >
                              {item.type === 'UNASSIGNED'
                                ? 'Unassigned'
                                : item.type === 'OVERDUE'
                                ? 'Overdue'
                                : 'Belum Dibalas'}
                            </span>
                          </div>
                          <p className="text-[11.5px] text-[#5C7685] truncate mt-0.5">
                            {item.detail}
                          </p>
                        </div>

                        <Link
                          href={`/inbox?jid=${encodeURIComponent(item.chatId)}`}
                          className="h-6 px-2 bg-white hover:bg-[#F4F8FA] border border-[#B0C4CF] text-[#0F232E] text-[11px] font-semibold rounded inline-flex items-center shrink-0"
                        >
                          Buka →
                        </Link>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Row 4: 7-Day Traffic Chart + Funnel & Error Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className="lg:col-span-7 bg-white border border-[#D1DEE5] rounded-lg shadow-[0_1px_2px_rgba(17,24,39,0.04)] overflow-hidden">
                <div className="px-4 py-3.5 border-b border-[#E8EFF3] flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-[13.5px] font-bold text-[#0F232E]">
                      Trafik Pesan 7 Hari Terakhir
                    </h2>
                    <p className="text-[11.5px] text-[#5C7685]">
                      Perbandingan pesan keluar vs pesan masuk
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-[11.5px] text-[#435A68]">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-[#00688E]" /> Keluar
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-[#CBD5E1]" /> Masuk
                    </span>
                  </div>
                </div>

                <div className="p-4">
                  <svg viewBox="0 0 560 185" className="w-full h-[185px]">
                    <line x1="36" y1="20" x2="544" y2="20" stroke="#E8EFF3" strokeWidth="1" />
                    <line x1="36" y1="64" x2="544" y2="64" stroke="#E8EFF3" strokeWidth="1" />
                    <line x1="36" y1="108" x2="544" y2="108" stroke="#E8EFF3" strokeWidth="1" />
                    <line x1="36" y1="152" x2="544" y2="152" stroke="#D1DEE5" strokeWidth="1" />
                    <g fontSize="10" fill="#809AA8" textAnchor="end" className="font-mono">
                      <text x="28" y="24">{roundedCeiling}</text>
                      <text x="28" y="68">{Math.round((roundedCeiling * 2) / 3)}</text>
                      <text x="28" y="112">{Math.round(roundedCeiling / 3)}</text>
                      <text x="28" y="156">0</text>
                    </g>

                    {traffic7d.map((item, i) => {
                      const x = 58 + i * 70;
                      const hOut = Math.round(((item.out || 0) / roundedCeiling) * 132);
                      const hIn = Math.round(((item.in || 0) / roundedCeiling) * 132);
                      return (
                        <g key={item.key}>
                          <rect
                            x={x}
                            y={152 - hOut}
                            width="18"
                            height={Math.max(0, hOut)}
                            rx="3"
                            fill="#00688E"
                          >
                            <title>{`${item.label} Keluar: ${item.out}`}</title>
                          </rect>
                          <rect
                            x={x + 22}
                            y={152 - hIn}
                            width="18"
                            height={Math.max(0, hIn)}
                            rx="3"
                            fill="#CBD5E1"
                          >
                            <title>{`${item.label} Masuk: ${item.in}`}</title>
                          </rect>
                          <text x={x + 20} y="174" textAnchor="middle" fontSize="11" fill="#5C7685">
                            {item.label}
                          </text>
                        </g>
                      );
                    })}
                  </svg>

                  {/* Merchant Funnel Strip */}
                  <div className="mt-4 pt-4 border-t border-[#E8EFF3]">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2 text-xs">
                      <span className="font-bold text-[#0F232E]">Funnel Status Obrolan</span>
                      <span className="text-[#5C7685] tabular-nums">
                        Open: <strong>{funnel.open}</strong> • Follow Up:{' '}
                        <strong>{funnel.followUp}</strong> • Selesai:{' '}
                        <strong>{funnel.resolved}</strong>
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full overflow-hidden bg-[#E8EFF3] flex gap-0.5">
                      <div
                        style={{ width: `${(funnel.open / funnelTotal) * 100}%` }}
                        className="bg-[#00688E]"
                        title={`Open: ${funnel.open}`}
                      />
                      <div
                        style={{ width: `${(funnel.followUp / funnelTotal) * 100}%` }}
                        className="bg-[#D97706]"
                        title={`Follow Up: ${funnel.followUp}`}
                      />
                      <div
                        style={{ width: `${(funnel.resolved / funnelTotal) * 100}%` }}
                        className="bg-[#16A34A]"
                        title={`Selesai: ${funnel.resolved}`}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 bg-white border border-[#D1DEE5] rounded-lg shadow-[0_1px_2px_rgba(17,24,39,0.04)] overflow-hidden flex flex-col">
                <div className="px-4 py-3.5 border-b border-[#E8EFF3] flex items-center justify-between">
                  <div>
                    <h2 className="text-[13.5px] font-bold text-[#0F232E]">Log & Error Pengiriman</h2>
                    <p className="text-[11.5px] text-[#5C7685]">Ringkasan error 7h & kejadian terbaru</p>
                  </div>
                  <Link href="/logs" className="text-xs font-semibold text-[#00688E] hover:underline">
                    Semua Log →
                  </Link>
                </div>

                <div className="px-4 py-3 bg-[#F4F8FA] border-b border-[#E8EFF3] grid grid-cols-3 gap-2 text-center tabular-nums">
                  <div>
                    <div className="font-mono text-sm font-bold text-[#9E1F23]">{errBreak.notWa}</div>
                    <div className="text-[10.5px] text-[#5C7685]">Bukan No. WA</div>
                  </div>
                  <div>
                    <div className="font-mono text-sm font-bold text-[#8F5A05]">{errBreak.timeout}</div>
                    <div className="text-[10.5px] text-[#5C7685]">Timeout WAHA</div>
                  </div>
                  <div>
                    <div className="font-mono text-sm font-bold text-[#435A68]">{errBreak.other}</div>
                    <div className="text-[10.5px] text-[#5C7685]">Error Lain</div>
                  </div>
                </div>

                <div className="divide-y divide-[#E8EFF3] flex-1">
                  {recentLogs.length === 0 ? (
                    <div className="py-8 text-center text-xs text-[#809AA8]">
                      Belum ada aktivitas log.
                    </div>
                  ) : (
                    recentLogs.map((l) => (
                      <div key={l.id} className="px-4 py-2.5 flex items-center justify-between gap-2.5 text-xs">
                        <div className="min-w-0">
                          <div className="font-medium text-[#0F232E] truncate">{l.message}</div>
                          <div className="font-mono text-[10.5px] text-[#809AA8] tabular-nums">
                            {new Date(l.createdAt).toLocaleTimeString('id-ID', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}{' '}
                            • {l.type}
                          </div>
                        </div>
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0 ${
                            l.status === 'SUCCESS'
                              ? 'bg-[#E7F8F1] text-[#0D6945] border-[#A7E7CB]'
                              : l.status === 'ERROR'
                              ? 'bg-[#FDECEC] text-[#9E1F23] border-[#F7B4B6]'
                              : 'bg-[#FEF5E4] text-[#8F5A05] border-[#F7D488]'
                          }`}
                        >
                          {l.status}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
