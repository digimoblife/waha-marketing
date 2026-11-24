'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/navigation';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  FileText,
  Users,
  MessageSquare,
  LogOut,
  Shield,
  Activity,
  Menu,
  X,
  ChevronRight,
  ExternalLink,
  Store,
} from 'lucide-react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.user) setUser(data.user);
      })
      .catch(() => null);
  }, []);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  const navItems = [
    {
      name: 'Penggunaan WAHA',
      href: '/admin',
      icon: LayoutDashboard,
      active: pathname === '/admin',
    },
    {
      name: 'Database Merchant',
      href: '/admin/merchants',
      icon: Store,
      active: pathname === '/admin/merchants',
    },
    {
      name: 'Log Sukses & Error',
      href: '/admin/logs',
      icon: Activity,
      active: pathname === '/admin/logs',
    },
    {
      name: 'User Management',
      href: '/admin/users',
      icon: Users,
      active: pathname === '/admin/users',
    },
  ];

  return (
    <div className="flex h-screen bg-[#F1F5F9] font-sans antialiased overflow-hidden">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
        />
      )}

      {/* TailAdmin Dark Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#1C2434] text-white flex flex-col transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-1/2 -translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Sidebar Brand Header */}
        <div className="h-20 px-6 flex items-center justify-between border-b border-[#2E3A4B]">
          <a href="/admin" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#128C7E] to-[#25D366] flex items-center justify-center text-white font-bold shadow-md">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <span className="text-base font-bold text-white tracking-tight block">
                TailAdmin
              </span>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold block">
                WAHA Management
              </span>
            </div>
          </a>
          <button
            onClick={() => setSidebarOpen(false)}
            className="text-slate-400 hover:text-white lg:hidden p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Menu */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-3 mb-3">
              MENU UTAMA
            </p>
            <nav className="space-y-1.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <a
                    key={item.name}
                    href={item.href}
                    className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition ${
                      item.active
                        ? 'bg-[#333A48] text-white shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-[#333A48]/50'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.name}</span>
                  </a>
                );
              })}
            </nav>
          </div>

          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-3 mb-3">
              APLIKASI
            </p>
            <nav className="space-y-1.5">
              <a
                href="/"
                className="flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium text-emerald-400 hover:bg-emerald-500/10 border border-emerald-500/20 transition"
              >
                <div className="flex items-center gap-3">
                  <MessageSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>WhatsApp Tools</span>
                </div>
                <ExternalLink className="w-3.5 h-3.5 opacity-70" />
              </a>
            </nav>
          </div>
        </div>

        {/* Sidebar Footer (User Info & Logout) */}
        <div className="p-4 border-t border-[#2E3A4B] bg-[#171E2D]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-[#333A48] flex items-center justify-center font-bold text-xs text-white uppercase shrink-0">
                {user?.name ? user.name.charAt(0) : 'A'}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white truncate">
                  {user?.name || 'Administrator'}
                </p>
                <span className="text-[10px] text-emerald-400 font-mono block">
                  {user?.role || 'ADMIN'}
                </span>
              </div>
            </div>
            <button
              onClick={handleLogout}
              title="Keluar"
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Navbar */}
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0 shadow-xs z-10">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 text-slate-600 hover:text-slate-900 lg:hidden rounded-lg hover:bg-slate-100"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-medium text-slate-700">Admin</span>
              <ChevronRight className="w-3 h-3 text-slate-400" />
              <span className="text-slate-900 font-semibold">
                {pathname === '/admin'
                  ? 'Penggunaan WAHA'
                  : pathname === '/admin/merchants'
                  ? 'Database Merchant Lapaq'
                  : pathname === '/admin/logs'
                  ? 'Log Sukses & Error'
                  : 'User Management'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="/"
              className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-[#075E54] text-xs font-semibold rounded-lg transition flex items-center gap-1.5"
            >
              <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
              <span>Buka WA Tools</span>
            </a>
            <div className="h-5 w-px bg-slate-200 mx-1" />
            <button
              onClick={handleLogout}
              className="text-xs font-medium text-slate-600 hover:text-rose-600 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-rose-50 transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Keluar</span>
            </button>
          </div>
        </header>

        {/* Page Content Body */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
