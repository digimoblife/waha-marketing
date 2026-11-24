'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  QrCode,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Loader2,
  LogOut,
  RotateCcw,
} from 'lucide-react';

interface QRModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: string;
  onRefresh: () => void;
  onStartSession: () => void;
  onLogout?: (resetDb: boolean) => Promise<void>;
}

export default function QRModal({
  isOpen,
  onClose,
  status,
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

  // Auto-refresh QR code image every 5 seconds when in SCAN_QR_CODE
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
      setTimeout(() => setIsRefreshing(false), 500);
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
      // Wait for engine to start fresh
      setTimeout(() => {
        setQrTimestamp(Date.now());
        onRefresh();
        setIsRestarting(false);
      }, 1500);
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
      }, 1500);
    } catch {
      setIsLoggingOut(false);
    }
  };

  const isFailed = status === 'FAILED';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-gray-100 flex flex-col">
        {/* Modal Header */}
        <div className="bg-[#075E54] text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-wa-green" />
            <h3 className="font-semibold text-lg">Koneksi & Sesi WhatsApp</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white p-1.5 rounded-full hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 text-center space-y-4">
          {/* Status Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-gray-100">
            <span>Status Engine:</span>
            <span
              className={`px-2 py-0.5 rounded-full ${
                status === 'WORKING'
                  ? 'bg-emerald-100 text-emerald-800'
                  : status === 'SCAN_QR_CODE'
                  ? 'bg-amber-100 text-amber-800 animate-pulse'
                  : 'bg-red-100 text-red-700'
              }`}
            >
              {status === 'WORKING'
                ? 'Terhubung (Online)'
                : status === 'SCAN_QR_CODE'
                ? 'Siap Scan QR Code'
                : status === 'FAILED'
                ? 'Sesi Gagal (FAILED)'
                : status}
            </span>
          </div>

          {status === 'WORKING' ? (
            confirmLogout ? (
              /* Confirmation Logout Screen */
              <div className="py-4 space-y-4 text-left bg-red-50/70 p-4 rounded-xl border border-red-200">
                <div className="flex items-center gap-2 text-red-700 font-semibold text-sm">
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                  <span>Konfirmasi Logout Nomor WhatsApp</span>
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Sesi WhatsApp yang aktif akan diputus dari engine WAHA. Anda dapat memindai nomor baru setelah logout.
                </p>

                <label className="flex items-start gap-2 text-xs text-gray-700 pt-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={resetDbOnLogout}
                    onChange={(e) => setResetDbOnLogout(e.target.checked)}
                    className="mt-0.5 rounded border-gray-300 text-red-600 focus:ring-red-500"
                  />
                  <span>
                    <strong>Bersihkan database chat lama</strong> (Mulai lembaran baru untuk nomor berikutnya)
                  </span>
                </label>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setConfirmLogout(false)}
                    disabled={isLoggingOut}
                    className="px-3 py-1.5 border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-xs rounded-lg font-medium transition cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={executeLogout}
                    disabled={isLoggingOut}
                    className="px-4 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs rounded-lg font-semibold flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                  >
                    {isLoggingOut ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
                    <span>{isLoggingOut ? 'Memutuskan Sesi...' : 'Ya, Logout Sekarang'}</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Connected Screen */
              <div className="py-6 space-y-3">
                <CheckCircle2 className="w-16 h-16 text-wa-green mx-auto" />
                <h4 className="text-xl font-bold text-gray-800">WhatsApp Sudah Terhubung!</h4>
                <p className="text-sm text-gray-500 max-w-xs mx-auto">
                  Akun WhatsApp Anda aktif dan siap digunakan untuk mengirim dan menerima pesan.
                </p>

                <div className="pt-4 flex flex-col gap-2 max-w-xs mx-auto">
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full py-2 bg-[#128C7E] hover:bg-[#075E54] text-white text-xs font-semibold rounded-lg cursor-pointer transition shadow"
                  >
                    Lanjut Menggunakan Web WhatsApp
                  </button>

                  <button
                    type="button"
                    onClick={() => setConfirmLogout(true)}
                    className="w-full py-2 bg-white hover:bg-red-50 text-red-600 border border-red-200 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Ganti / Logout Nomor WhatsApp</span>
                  </button>
                </div>
              </div>
            )
          ) : isFailed ? (
            /* Explicit FAILED Screen with Restart Button */
            <div className="py-8 space-y-4 bg-red-50/50 p-6 rounded-2xl border border-red-100">
              <div className="w-14 h-14 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
                <AlertCircle className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-gray-900 text-base">Sesi WhatsApp Terputus (FAILED)</h4>
                <p className="text-xs text-gray-600 max-w-xs mx-auto leading-relaxed">
                  Sesi WhatsApp sebelumnya gagal atau telah terputus dari perangkat Anda. Klik tombol di bawah untuk membuat QR Code baru.
                </p>
              </div>

              <button
                type="button"
                onClick={handleRestartSession}
                disabled={isRestarting}
                className="w-full py-2.5 bg-[#128C7E] hover:bg-[#075E54] disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
              >
                {isRestarting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Mempersiapkan QR Code Baru...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4" />
                    <span>Buat QR Code Baru Sekarang</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            /* QR Scan Screen (SCAN_QR_CODE or STARTING) */
            <div className="space-y-4">
              <div className="p-2.5 bg-white border-2 border-dashed border-[#128C7E]/40 rounded-xl inline-block shadow-inner relative min-w-[240px] min-h-[240px] flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={qrTimestamp}
                  src={`/api/session/qr?t=${qrTimestamp}`}
                  alt="WhatsApp QR Code"
                  className="w-56 h-56 mx-auto rounded-lg object-contain bg-white block"
                  onLoad={() => setImageError(false)}
                  onError={() => setImageError(true)}
                />

                {imageError && (
                  <div className="absolute inset-0 bg-white/95 rounded-xl flex flex-col items-center justify-center p-4 text-center space-y-2">
                    <AlertCircle className="w-10 h-10 text-amber-500" />
                    <p className="text-xs font-semibold text-gray-700">Kode QR sedang disiapkan...</p>
                    <button
                      type="button"
                      onClick={handleRestartSession}
                      disabled={isRestarting}
                      className="px-3 py-1.5 bg-[#128C7E] hover:bg-[#075E54] text-white text-xs rounded-lg cursor-pointer flex items-center gap-1.5 transition"
                    >
                      {isRestarting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                      <span>Mulai Sesi Ulang</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="text-xs text-gray-600 space-y-1 text-left bg-gray-50 p-3.5 rounded-xl border border-gray-100">
                <p className="font-semibold text-gray-800 text-[13px] mb-1">Cara scan dengan nomor baru:</p>
                <p>1. Buka <strong>WhatsApp</strong> di HP Anda</p>
                <p>2. Buka menu <strong>Perangkat Tertaut</strong> (titik tiga di Android atau Pengaturan di iPhone)</p>
                <p>3. Ketuk <strong>Tautkan Perangkat</strong> lalu arahkan kamera ke kode QR di atas</p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-gray-50 px-6 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500 shrink-0">
          <a
            href="/api/session/qr"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-gray-500 hover:text-[#075E54] hover:underline"
          >
            <span>Buka QR Tab Baru</span>
            <ExternalLink className="w-3 h-3" />
          </a>

          <button
            type="button"
            onClick={isFailed ? handleRestartSession : handleManualRefresh}
            disabled={isRefreshing || isRestarting}
            className="flex items-center gap-1.5 text-[#128C7E] hover:text-[#075E54] font-semibold cursor-pointer px-2.5 py-1 rounded-md hover:bg-gray-200/60 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing || isRestarting ? 'animate-spin' : ''}`} />
            <span>{isFailed ? 'Restart Sesi' : isRefreshing ? 'Memperbarui...' : 'Refresh QR'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
