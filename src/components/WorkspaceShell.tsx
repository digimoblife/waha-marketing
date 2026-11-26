'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  MessageSquare,
  Store,
  Send,
  FileText,
  LayoutDashboard,
  Activity,
  Users,
  Settings,
  Bell,
  Search,
  LogOut,
  ChevronRight,
  Menu,
  X,
} from 'lucide-react';
import { WorkspaceProvider, useWorkspace } from './WorkspaceContext';
import QRModal from './QRModal';
import CommandPalette from './CommandPalette';

const PAGE_TITLES: Record<string, string> = {
  '/inbox': 'Inbox & Chat',
  '/merchants': 'Database Merchant',
  '/broadcast': 'Broadcast & Campaign',
  '/templates': 'Template Pesan',
  '/overview': 'Overview Admin',
  '/logs': 'Log Aktivitas',
  '/users': 'Manajemen Tim',
  '/settings': 'Pengaturan Sistem',
};

function ShellInner({
  children,
  isQROpen,
  setIsQROpen,
  isCmdOpen,
  setIsCmdOpen,
  toastMsg,
}: {
  children: React.ReactNode;
  isQROpen: boolean;
  setIsQROpen: (v: boolean) => void;
  isCmdOpen: boolean;
  setIsCmdOpen: (v: boolean) => void;
  toastMsg: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser, sessionStatus, unreadCount, reminders, refreshSession, refreshWorkspaceMeta, notify } =
    useWorkspace();

  const [expanded, setExpanded] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const isAdmin = currentUser?.role === 'ADMIN';

  // Keyboard shortcuts: Cmd+K (Command Palette) & Cmd+B (Expand/Collapse Sidebar)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCmdOpen(true);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setExpanded((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setIsCmdOpen]);

  const handleLogoutApp = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  const handleStartSession = async () => {
    await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start' }),
    });
    await refreshSession();
  };

  const handleLogoutWAHA = async (resetDb = false) => {
    await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logout', resetDb }),
    });
    await refreshSession();
    await refreshWorkspaceMeta();
    notify('Sesi WhatsApp berhasil diputus');
  };

  const requestDesktopNotif = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      notify('Browser tidak mendukung notifikasi desktop');
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      notify('Notifikasi desktop diaktifkan untuk pengingat follow-up');
    } else {
      notify('Izin notifikasi desktop ditolak oleh browser');
    }
  };

  const coreNav = [
    { href: '/inbox', label: 'Inbox & Chat', icon: MessageSquare, badge: unreadCount },
    { href: '/merchants', label: 'Database Merchant', icon: Store },
    { href: '/broadcast', label: 'Broadcast', icon: Send },
    { href: '/templates', label: 'Template Pesan', icon: FileText },
  ];

  const adminNav = [
    { href: '/overview', label: 'Overview Admin', icon: LayoutDashboard },
    { href: '/logs', label: 'Log Aktivitas', icon: Activity },
    { href: '/users', label: 'Manajemen Tim', icon: Users },
    { href: '/settings', label: 'Pengaturan', icon: Settings },
  ];

  const pageTitle = PAGE_TITLES[pathname] || 'WAHA Marketing';
  const initials = (currentUser?.name || currentUser?.username || 'WM')
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const statusColor =
    sessionStatus === 'WORKING'
      ? 'bg-[#16A34A]'
      : sessionStatus === 'SCAN_QR_CODE'
      ? 'bg-[#D97706] animate-pulse'
      : 'bg-[#DC2626]';

  const statusTextColor =
    sessionStatus === 'WORKING'
      ? 'text-[#0D6945]'
      : sessionStatus === 'SCAN_QR_CODE'
      ? 'text-[#8F5A05]'
      : 'text-[#9E1F23]';

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#F4F8FA] text-[#0F232E]">
      {/* Mobile Drawer Backdrop */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] md:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Expandable / Collapsible Architectural Sidebar Rail */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 flex flex-col bg-[#F4F8FA] border-r border-[#D1DEE5] py-3 transition-all duration-200 shrink-0 ${
          mobileNavOpen ? 'translate-x-0 w-[244px] shadow-2xl' : '-translate-x-full md:translate-x-0'
        } ${expanded ? 'md:w-[224px]' : 'md:w-[60px]'}`}
      >
        {/* Rail Header */}
        <div
          className={`flex items-center px-2.5 mb-2.5 ${
            expanded || mobileNavOpen ? 'flex-row justify-between gap-2' : 'flex-col gap-1.5'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href="/inbox"
              onClick={() => setMobileNavOpen(false)}
              className={`flex items-center justify-center shrink-0 overflow-hidden rounded-lg ${
                expanded || mobileNavOpen ? 'h-8' : 'w-9 h-9'
              }`}
              title="LAPAQ Workspace"
            >
              {expanded || mobileNavOpen ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src="/lapaq-logo.png"
                  alt="LAPAQ"
                  className="h-7 w-auto object-contain block"
                />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src="/lapaq-logo.png"
                  alt="LAPAQ"
                  className="w-9 h-9 object-cover object-left rounded-lg block"
                />
              )}
            </Link>
          </div>

          {/* Desktop Expand/Collapse Toggle */}
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            title="Expand / Collapse Sidebar (⌘B)"
            className="hidden md:flex w-7 h-7 rounded-md items-center justify-center text-[#5C7685] hover:bg-[#ECF6FA] hover:text-[#0F232E] transition cursor-pointer shrink-0"
          >
            <ChevronRight
              className={`w-4 h-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            />
          </button>

          {/* Mobile Close Drawer */}
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            className="md:hidden w-7 h-7 rounded-md flex items-center justify-center text-[#5C7685] hover:bg-[#ECF6FA]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto px-2.5 space-y-1">
          {coreNav.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const showLabel = expanded || mobileNavOpen;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileNavOpen(false)}
                title={!showLabel ? item.label : undefined}
                className={`relative flex items-center rounded-lg transition border ${
                  showLabel ? 'h-9 px-2.5 gap-2.5 justify-start' : 'w-10 h-10 mx-auto justify-center'
                } ${
                  active
                    ? 'bg-white text-[#00688E] border-[#D1DEE5] shadow-[0_1px_2px_rgba(17,24,39,0.04)] font-semibold'
                    : 'border-transparent text-[#5C7685] hover:bg-[#ECF6FA] hover:text-[#0F232E]'
                }`}
              >
                <Icon className="w-[18px] h-[18px] shrink-0" strokeWidth={1.85} />
                {showLabel && (
                  <span className={`text-[12.5px] truncate flex-1 ${active ? 'text-[#0F232E]' : ''}`}>
                    {item.label}
                  </span>
                )}
                {item.badge && item.badge > 0 ? (
                  <span
                    className={`min-w-[17px] h-[17px] px-1 rounded-full bg-[#00688E] text-white text-[10px] font-bold tabular-nums flex items-center justify-center ${
                      showLabel ? 'ml-auto' : 'absolute -top-0.5 -right-0.5 border-2 border-[#F4F8FA]'
                    }`}
                  >
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}

          {isAdmin && (
            <>
              <div className="my-2 border-t border-[#D1DEE5]" />
              {adminNav.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const showLabel = expanded || mobileNavOpen;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileNavOpen(false)}
                    title={!showLabel ? item.label : undefined}
                    className={`relative flex items-center rounded-lg transition border ${
                      showLabel ? 'h-9 px-2.5 gap-2.5 justify-start' : 'w-10 h-10 mx-auto justify-center'
                    } ${
                      active
                        ? 'bg-white text-[#00688E] border-[#D1DEE5] shadow-[0_1px_2px_rgba(17,24,39,0.04)] font-semibold'
                        : 'border-transparent text-[#5C7685] hover:bg-[#ECF6FA] hover:text-[#0F232E]'
                    }`}
                  >
                    <Icon className="w-[18px] h-[18px] shrink-0" strokeWidth={1.85} />
                    {showLabel && (
                      <span className={`text-[12.5px] truncate flex-1 ${active ? 'text-[#0F232E]' : ''}`}>
                        {item.label}
                      </span>
                    )}
                  </Link>
                );
              })}
            </>
          )}
        </nav>

        {/* Rail Footer Utilities */}
        <div className="mt-auto pt-2 px-2.5 space-y-1.5 border-t border-[#E8EFF3]">
          {/* Reminder Bell */}
          <button
            type="button"
            onClick={() => setNotifOpen((prev) => !prev)}
            title={!(expanded || mobileNavOpen) ? 'Pengingat Follow-Up' : undefined}
            className={`relative flex items-center rounded-lg text-[#5C7685] hover:bg-[#ECF6FA] hover:text-[#0F232E] transition cursor-pointer ${
              expanded || mobileNavOpen ? 'w-full h-9 px-2.5 gap-2.5 justify-start' : 'w-10 h-10 mx-auto justify-center'
            }`}
          >
            <Bell className="w-[18px] h-[18px] shrink-0" strokeWidth={1.85} />
            {(expanded || mobileNavOpen) && (
              <span className="text-[12.5px] font-medium truncate flex-1 text-left">Pengingat</span>
            )}
            {reminders.length > 0 && (
              <span
                className={`min-w-[17px] h-[17px] px-1 rounded-full bg-[#D97706] text-white text-[10px] font-bold tabular-nums flex items-center justify-center ${
                  expanded || mobileNavOpen
                    ? 'ml-auto'
                    : 'absolute -top-0.5 -right-0.5 border-2 border-[#F4F8FA]'
                }`}
              >
                {reminders.length}
              </span>
            )}
          </button>

          {/* Command Palette */}
          <button
            type="button"
            onClick={() => {
              setMobileNavOpen(false);
              setIsCmdOpen(true);
            }}
            title={!(expanded || mobileNavOpen) ? 'Cari Cepat (⌘K)' : undefined}
            className={`flex items-center rounded-lg text-[#5C7685] hover:bg-[#ECF6FA] hover:text-[#0F232E] transition cursor-pointer ${
              expanded || mobileNavOpen ? 'w-full h-9 px-2.5 gap-2.5 justify-start' : 'w-10 h-10 mx-auto justify-center'
            }`}
          >
            <Search className="w-[18px] h-[18px] shrink-0" strokeWidth={1.85} />
            {(expanded || mobileNavOpen) && (
              <span className="text-[12.5px] font-medium truncate flex-1 text-left">Cari Cepat</span>
            )}
            {(expanded || mobileNavOpen) && (
              <kbd className="text-[10px] font-mono text-[#809AA8]">⌘K</kbd>
            )}
          </button>

          {/* WAHA Live Status Button */}
          <button
            type="button"
            onClick={() => {
              setMobileNavOpen(false);
              setIsQROpen(true);
            }}
            title={`WAHA Engine: ${sessionStatus}`}
            className={`flex items-center rounded-lg bg-white border border-[#D1DEE5] hover:border-[#B0C4CF] transition cursor-pointer ${
              expanded || mobileNavOpen ? 'w-full h-9 px-2.5 gap-2.5 justify-start' : 'w-10 h-10 mx-auto justify-center'
            }`}
          >
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusColor}`} />
            {(expanded || mobileNavOpen) && (
              <span className={`text-[11.5px] font-semibold truncate ${statusTextColor}`}>
                WAHA: {sessionStatus}
              </span>
            )}
          </button>

          {/* User Info & Logout */}
          <div
            className={`flex items-center rounded-lg ${
              expanded || mobileNavOpen
                ? 'w-full h-10 px-2 bg-white border border-[#D1DEE5] justify-between gap-2'
                : 'flex-col gap-1.5 pt-1'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <div
                title={`${currentUser?.name || 'User'} (${currentUser?.role || 'OPERATOR'})`}
                className="w-7 h-7 rounded-full bg-[#D1DEE5] border border-[#B0C4CF] text-[#0F232E] text-[11px] font-bold flex items-center justify-center shrink-0"
              >
                {initials}
              </div>
              {(expanded || mobileNavOpen) && (
                <div className="min-w-0 leading-tight">
                  <div className="text-[12px] font-semibold text-[#0F232E] truncate">
                    {currentUser?.name || 'Pengguna'}
                  </div>
                  <div className="text-[10px] font-mono text-[#5C7685] uppercase">
                    {currentUser?.role || 'OPERATOR'}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleLogoutApp}
              title="Keluar"
              className="p-1.5 rounded-md text-[#5C7685] hover:text-[#9E1F23] hover:bg-[#FDECEC] transition cursor-pointer shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Notification Bell Popover */}
      {notifOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
          <div className="fixed left-3 right-3 top-14 md:top-auto md:right-auto md:bottom-16 md:left-[68px] md:w-[330px] z-50 bg-white border border-[#B0C4CF] rounded-lg shadow-xl overflow-hidden">
            <div className="px-3.5 py-2.5 border-b border-[#E8EFF3] flex items-center justify-between">
              <span className="text-[12.5px] font-bold text-[#0F232E]">Pengingat Follow-Up</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={requestDesktopNotif}
                  className="text-[11px] font-semibold text-[#00688E] hover:underline cursor-pointer"
                >
                  Aktifkan Alarm
                </button>
                <button
                  type="button"
                  onClick={() => setNotifOpen(false)}
                  className="p-1 text-[#5C7685] hover:text-[#0F232E] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="max-h-[260px] overflow-y-auto divide-y divide-[#E8EFF3]">
              {reminders.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#809AA8]">
                  Tidak ada pengingat follow-up aktif.
                </div>
              ) : (
                reminders.map((r) => (
                  <button
                    key={r.chatId}
                    type="button"
                    onClick={() => {
                      setNotifOpen(false);
                      router.push(`/inbox?jid=${encodeURIComponent(r.chatId)}`);
                    }}
                    className="w-full text-left px-3.5 py-2.5 hover:bg-[#F4F8FA] transition cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12.5px] font-semibold text-[#0F232E] truncate">
                        {r.title}
                      </span>
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0 tabular-nums ${
                          r.isDue
                            ? 'bg-[#FDECEC] text-[#9E1F23] border-[#F7B4B6]'
                            : 'bg-[#FEF5E4] text-[#8F5A05] border-[#F7D488]'
                        }`}
                      >
                        {r.isDue
                          ? 'Jatuh Tempo'
                          : new Date(r.reminderAt).toLocaleString('id-ID', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                      </span>
                    </div>
                    <p className="text-[11.5px] text-[#435A68] mt-0.5 truncate">{r.reminderNote}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden bg-white">
        {/* Mobile Top Navigation Bar (<= 768px) */}
        <header className="md:hidden h-12 px-3 bg-white border-b border-[#D1DEE5] flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="p-1.5 rounded-md text-[#435A68] hover:bg-[#ECF6FA]"
              aria-label="Buka Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="text-[14px] font-bold text-[#0F232E] truncate">{pageTitle}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setNotifOpen((prev) => !prev)}
              className="relative p-1.5 rounded-md text-[#435A68] hover:bg-[#ECF6FA]"
            >
              <Bell className="w-4 h-4" />
              {reminders.length > 0 && (
                <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-[#D97706]" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setIsQROpen(true)}
              className="h-7 px-2 rounded-md border border-[#B0C4CF] bg-white text-[11px] font-semibold flex items-center gap-1.5"
            >
              <span className={`w-2 h-2 rounded-full ${statusColor}`} />
              <span>WAHA</span>
            </button>
          </div>
        </header>

        {/* Active Page Body */}
        <main className="flex-1 min-h-0 flex flex-col overflow-hidden">{children}</main>
      </div>

      {/* Global QR Modal & Command Palette */}
      <QRModal
        isOpen={isQROpen}
        onClose={() => setIsQROpen(false)}
        status={sessionStatus}
        onRefresh={refreshSession}
        onStartSession={handleStartSession}
        onLogout={handleLogoutWAHA}
      />

      <CommandPalette isOpen={isCmdOpen} onClose={() => setIsCmdOpen(false)} />

      {/* Global Toast */}
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-[100] bg-[#0F232E] text-white px-3.5 py-2 rounded-md text-[12.5px] font-medium shadow-xl">
          {toastMsg}
        </div>
      )}
    </div>
  );
}

export default function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const [isQROpen, setIsQROpen] = useState(false);
  const [isCmdOpen, setIsCmdOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 2800);
  };

  return (
    <WorkspaceProvider
      onOpenQR={() => setIsQROpen(true)}
      onOpenCmd={() => setIsCmdOpen(true)}
      onToast={showToast}
    >
      <ShellInner
        isQROpen={isQROpen}
        setIsQROpen={setIsQROpen}
        isCmdOpen={isCmdOpen}
        setIsCmdOpen={setIsCmdOpen}
        toastMsg={toastMsg}
      >
        {children}
      </ShellInner>
    </WorkspaceProvider>
  );
}
