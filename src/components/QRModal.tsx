'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Loader2,
  LogOut,
  RotateCcw,
} from 'lucide-react';

import { formatDisplayPhone } from '@/lib/phone';

interface QRModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: string;
  sessionMe?: { id: string; pushName?: string } | null;
  onRefresh: () => void;
  onStartSession: () => void;
  onLogout?: (resetDb: boolean) => Promise<void>;
}

export default function QRModal({
  isOpen,
  onClose,
  status,
  sessionMe,
  onRefresh,
  onStartSession,
  onLogout,
}: QRModalProps) {
  const [qrTimestamp, setQrTimestamp] = useState(Date.now());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [resetDbOnLogout, setResetDbOnLogout] = useState(false);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    if (!isOpen || status !== 'SCAN_QR_CODE') return;
    const timer = setInterval(() => {
      setQrTimestamp(Date.now());
      onRefresh();
    }, 5000);
    return () => clearInterval(timer);
  }, [isOpen, status, onRefresh]);

  if (!isOpen) return null;

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    setImageError(false);
    setQrTimestamp(Date.now());
    try {
      await onRefresh();
    } finally {
      setTimeout(() => setIsRefreshing(false), 450);
    }
  };

  const handleRestartSession = async () => {
    setIsRestarting(true);
    setImageError(false);
    try {
      await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restart' }),
      });
      setTimeout(() => {
        setQrTimestamp(Date.now());
        onRefresh();
        setIsRestarting(false);
      }, 1400);
    } catch {
      setIsRestarting(false);
    }
  };

  const executeLogout = async () => {
    if (!onLogout) return;
    setIsLoggingOut(true);
    try {
      await onLogout(resetDbOnLogout);
      setConfirmLogout(false);
      setTimeout(() => {
        setQrTimestamp(Date.now());
        onRefresh();
        setIsLoggingOut(false);
      }, 1200);
    } catch {
      setIsLoggingOut(false);
    }
  };

  const isFailed = status === 'FAILED' || status === 'OFFLINE' || status === 'STOPPED';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-[2px] p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-[10px] shadow-2xl max-w-[440px] w-full overflow-hidden border border-[#B0C4CF] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3.5 border-b border-[#D1DEE5] flex items-center justify-between">
          <h3 className="font-bold text-[14.5px] text-[#0F232E]">Koneksi WAHA Engine</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[#5C7685] hover:text-[#0F232E] p-1 rounded-md hover:bg-[#ECF6FA] transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between px-3 py-2.5 rounded-md bg-[#F4F8FA] border border-[#D1DEE5]">
            <div className="text-xs text-[#5C7685]">
              Status Sesi (<code className="font-mono text-[#0F232E]">default</code>)
            </div>
            <span
              className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
                status === 'WORKING'
                  ? 'bg-[#E7F8F1] text-[#0D6945] border-[#A7E7CB]'
                  : status === 'SCAN_QR_CODE'
                  ? 'bg-[#FEF5E4] text-[#8F5A05] border-[#F7D488]'
                  : 'bg-[#FDECEC] text-[#9E1F23] border-[#F7B4B6]'
              }`}
            >
              {status}
            </span>
          </div>

          {status === 'WORKING' ? (
            confirmLogout ? (
              <div className="space-y-3 bg-[#FDECEC] p-4 rounded-md border border-[#F7B4B6]">
                <div className="flex items-center gap-2 text-[#9E1F23] font-semibold text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Konfirmasi Putus Sesi WhatsApp</span>
                </div>
                <p className="text-xs text-[#435A68] leading-relaxed">
                  Sesi WhatsApp aktif akan diputus dari WAHA. Anda bisa memindai nomor baru setelah logout.
                </p>
                <label className="flex items-start gap-2 text-xs text-[#0F232E] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={resetDbOnLogout}
                    onChange={(e) => setResetDbOnLogout(e.target.checked)}
                    className="mt-0.5 accent-[#9E1F23]"
                  />
                  <span>Bersihkan database chat lama (mulai baru untuk nomor berikutnya)</span>
                </label>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setConfirmLogout(false)}
                    disabled={isLoggingOut}
                    className="h-8 px-3 border border-[#B0C4CF] bg-white hover:bg-[#F4F8FA] text-xs font-semibold rounded-md cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={executeLogout}
                    disabled={isLoggingOut}
                    className="h-8 px-3 bg-[#9E1F23] hover:bg-[#991B1B] text-white text-xs font-semibold rounded-md flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    {isLoggingOut ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
                    <span>Ya, Putus Sesi</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="py-3 text-center space-y-3">
                <CheckCircle2 className="w-11 h-11 text-[#0D6945] mx-auto" />
                <div>
                  <h4 className="text-sm font-bold text-[#0F232E]">WhatsApp Terhubung</h4>
                  {sessionMe?.id && (
                    <div className="mt-1.5 inline-flex flex-col items-center px-3 py-1.5 rounded-md bg-[#ECF6FA] border border-[#A7D6E7]">
                      <span className="text-xs font-bold text-[#0F232E]">
                        {sessionMe.pushName || 'Akun Utama WAHA'}
                      </span>
                      <span className="text-[11.5px] font-mono font-semibold text-[#00688E]">
                        {formatDisplayPhone(sessionMe.id.replace(/@.+$/, ''))}
                      </span>
                    </div>
                  )}
                  <p className="text-xs text-[#5C7685] mt-2">
                    Nomor di atas adalah nomor CS WAHA saat ini. Untuk mengetes AI, kirim pesan dari nomor lain menuju nomor di atas.
                  </p>
                </div>
                <div className="pt-2 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmLogout(true)}
                    className="w-full h-8 bg-white hover:bg-[#FDECEC] text-[#9E1F23] border border-[#F7B4B6] text-xs font-semibold rounded-md flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Ganti / Logout Nomor WhatsApp</span>
                  </button>
                </div>
              </div>
            )
          ) : isFailed ? (
            <div className="py-5 px-4 text-center space-y-3 bg-[#FDECEC] rounded-md border border-[#F7B4B6]">
              <AlertCircle className="w-8 h-8 text-[#9E1F23] mx-auto" />
              <div>
                <h4 className="text-sm font-bold text-[#0F232E]">Sesi Tidak Aktif ({status})</h4>
                <p className="text-xs text-[#435A68] mt-1">
                  Mulai ulang sesi WAHA untuk membuat kode QR baru.
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={onStartSession}
                  className="h-8 px-3 bg-white border border-[#B0C4CF] text-xs font-semibold rounded-md hover:bg-[#F4F8FA] cursor-pointer"
                >
                  Start Session
                </button>
                <button
                  type="button"
                  onClick={handleRestartSession}
                  disabled={isRestarting}
                  className="h-8 px-3 bg-[#00688E] hover:bg-[#005575] text-white text-xs font-semibold rounded-md flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {isRestarting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                  <span>Restart & Buat QR</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-center">
              <div className="p-2.5 bg-white border border-[#D1DEE5] rounded-lg inline-flex items-center justify-center relative min-w-[220px] min-h-[220px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={qrTimestamp}
                  src={`/api/session/qr?t=${qrTimestamp}`}
                  alt="WhatsApp QR Code"
                  className="w-52 h-52 object-contain bg-white"
                  onLoad={() => setImageError(false)}
                  onError={() => setImageError(true)}
                />
                {imageError && (
                  <div className="absolute inset-0 bg-white/95 rounded-lg flex flex-col items-center justify-center p-4 space-y-2">
                    <AlertCircle className="w-7 h-7 text-[#8F5A05]" />
                    <p className="text-xs font-semibold text-[#0F232E]">Kode QR sedang disiapkan...</p>
                    <button
                      type="button"
                      onClick={handleRestartSession}
                      disabled={isRestarting}
                      className="h-7 px-3 bg-[#00688E] text-white text-xs font-semibold rounded-md cursor-pointer"
                    >
                      Mulai Sesi Ulang
                    </button>
                  </div>
                )}
              </div>
              <p className="text-xs text-[#5C7685]">
                Buka <strong>WhatsApp → Perangkat Tertaut → Tautkan Perangkat</strong> lalu scan QR di atas.
              </p>
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-[#D1DEE5] bg-[#F4F8FA] flex items-center justify-between text-xs">
          <a
            href="/api/session/qr"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-[#5C7685] hover:text-[#0F232E] hover:underline"
          >
            <span>Buka QR Tab Baru</span>
            <ExternalLink className="w-3 h-3" />
          </a>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={isFailed ? handleRestartSession : handleManualRefresh}
              disabled={isRefreshing || isRestarting}
              className="h-8 px-3 border border-[#B0C4CF] bg-white hover:bg-[#F4F8FA] text-[#0F232E] font-semibold rounded-md flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing || isRestarting ? 'animate-spin' : ''}`} />
              <span>{isFailed ? 'Restart' : 'Refresh'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 bg-[#00688E] hover:bg-[#005575] text-white font-semibold rounded-md cursor-pointer"
            >
              Selesai
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
