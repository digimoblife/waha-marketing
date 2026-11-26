'use client';

import React, { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Lock, User, ArrowRight, Loader2 } from 'lucide-react';

function LoginForm() {
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get('redirect') || '/inbox';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password || loading) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Login gagal');
      }

      window.location.href = redirectUrl === '/' ? '/inbox' : redirectUrl;
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-[#FDECEC] border border-[#F7B4B6] text-[#9E1F23] text-xs rounded-md flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#DC2626] shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-[#0F232E] mb-1.5">
          Username
        </label>
        <div className="relative">
          <User className="w-4 h-4 text-[#809AA8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            required
            autoFocus
            placeholder="Masukkan username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full h-9 pl-9 pr-3 bg-white border border-[#B0C4CF] rounded-md text-[13px] text-[#0F232E] placeholder-[#809AA8] focus:outline-none focus:border-[#00688E] focus:ring-2 focus:ring-[#00688E]/10 transition"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-[#0F232E] mb-1.5">
          Password
        </label>
        <div className="relative">
          <Lock className="w-4 h-4 text-[#809AA8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="password"
            required
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full h-9 pl-9 pr-3 bg-white border border-[#B0C4CF] rounded-md text-[13px] text-[#0F232E] placeholder-[#809AA8] focus:outline-none focus:border-[#00688E] focus:ring-2 focus:ring-[#00688E]/10 transition"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full h-9 mt-2 px-4 bg-[#00688E] hover:bg-[#005575] text-white text-[13px] font-semibold rounded-md transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Memverifikasi...</span>
          </>
        ) : (
          <>
            <span>Masuk ke Workspace</span>
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#F4F8FA] flex items-center justify-center p-6">
      <div className="w-full max-w-[380px] bg-white border border-[#D1DEE5] rounded-[10px] p-7 shadow-sm space-y-6">
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/lapaq-logo.png"
            alt="LAPAQ"
            className="h-9 w-auto object-contain"
          />
          <div>
            <h1 className="text-[15px] font-bold text-[#0F232E] tracking-tight">
              WAHA Marketing Workspace
            </h1>
            <p className="text-xs text-[#5C7685]">
              Masuk untuk mengakses Inbox, Broadcast, & Monitoring
            </p>
          </div>
        </div>

        <Suspense
          fallback={
            <div className="py-6 text-center text-xs text-[#809AA8]">
              Memuat form login...
            </div>
          }
        >
          <LoginForm />
        </Suspense>

        <div className="pt-4 border-t border-[#E8EFF3] text-center text-[11px] text-[#809AA8]">
          WAHA Unified Messaging & Marketing Workspace
        </div>
      </div>
    </div>
  );
}
