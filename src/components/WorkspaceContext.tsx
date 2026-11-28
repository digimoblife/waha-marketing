'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

export interface CurrentUser {
  id: string;
  username: string;
  name: string;
  role: 'ADMIN' | 'OPERATOR' | string;
  isActive: boolean;
}

export interface ReminderItem {
  chatId: string;
  title: string;
  reminderAt: string;
  reminderNote: string;
  isDue: boolean;
}

export type BotSwitchState = 'OFF' | 'ON_ALWAYS' | 'ON_OUTSIDE_HOURS';

interface WorkspaceContextValue {
  currentUser: CurrentUser | null;
  sessionStatus: string;
  sessionMe: { id: string; pushName?: string } | null;
  unreadCount: number;
  openIssuesCount: number;
  botSwitch: BotSwitchState;
  agentName: string;
  reminders: ReminderItem[];
  openQRModal: () => void;
  openCommandPalette: () => void;
  refreshSession: () => Promise<void>;
  refreshWorkspaceMeta: () => Promise<void>;
  updateBotSwitch: (nextMode: BotSwitchState) => Promise<void>;
  notify: (msg: string) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspace must be used inside WorkspaceProvider');
  }
  return ctx;
}

export function WorkspaceProvider({
  children,
  onOpenQR,
  onOpenCmd,
  onToast,
}: {
  children: React.ReactNode;
  onOpenQR: () => void;
  onOpenCmd: () => void;
  onToast: (msg: string) => void;
}) {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [sessionStatus, setSessionStatus] = useState<string>('OFFLINE');
  const [sessionMe, setSessionMe] = useState<{ id: string; pushName?: string } | null>(null);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [openIssuesCount, setOpenIssuesCount] = useState<number>(0);
  const [botSwitch, setBotSwitch] = useState<BotSwitchState>('OFF');
  const [agentName, setAgentName] = useState<string>('Rani');
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const notifiedRemindersRef = useRef<Set<string>>(new Set());

  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch('/api/session', { cache: 'no-store' });
      const data = await res.json();
      setSessionStatus(data.status || 'OFFLINE');
      setSessionMe(data.session?.me || null);
    } catch {
      setSessionStatus('OFFLINE');
      setSessionMe(null);
    }
  }, []);

  const refreshWorkspaceMeta = useCallback(async () => {
    try {
      const [res, pubRes] = await Promise.all([
        fetch('/api/chats', { cache: 'no-store' }),
        fetch('/api/settings/public', { cache: 'no-store' }),
      ]);
      if (pubRes.ok) {
        const pubData = await pubRes.json();
        if (typeof pubData.openIssuesCount === 'number') {
          setOpenIssuesCount(pubData.openIssuesCount);
        }
        if (pubData.agentStatus?.masterSwitch) {
          setBotSwitch(pubData.agentStatus.masterSwitch);
        }
        if (pubData.agentStatus?.agentName) {
          setAgentName(pubData.agentStatus.agentName);
        }
      }

      if (!res.ok) return;
      const data = await res.json();
      const chats: any[] = data.chats || [];

      const totalUnread = chats.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
      setUnreadCount(totalUnread);

      const nowMs = Date.now();
      const activeRem: ReminderItem[] = chats
        .filter((c) => Boolean(c.reminderAt))
        .map((c) => {
          const dueMs = new Date(c.reminderAt).getTime();
          const isDue = !Number.isNaN(dueMs) && dueMs <= nowMs;
          const title = c.contact?.storeName || c.contact?.name || c.name || c.id;
          return {
            chatId: c.id,
            title,
            reminderAt: c.reminderAt,
            reminderNote: c.reminderNote || 'Follow up merchant',
            isDue,
          };
        })
        .sort((a, b) => new Date(a.reminderAt).getTime() - new Date(b.reminderAt).getTime());

      setReminders(activeRem);

      // Trigger one-time Browser Notification & toast for newly due reminders
      for (const r of activeRem) {
        const key = `${r.chatId}_${r.reminderAt}`;
        if (r.isDue && !notifiedRemindersRef.current.has(key)) {
          notifiedRemindersRef.current.add(key);
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            new Notification(`Pengingat Follow-Up: ${r.title}`, {
              body: r.reminderNote,
            });
          }
        }
      }
    } catch {
      // silent background polling
    }
  }, []);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (d.user) setCurrentUser(d.user);
      })
      .catch(() => null);

    refreshSession();
    refreshWorkspaceMeta();

    const interval = setInterval(() => {
      refreshSession();
      refreshWorkspaceMeta();
    }, 10000);

    return () => clearInterval(interval);
  }, [refreshSession, refreshWorkspaceMeta]);

  const updateBotSwitch = useCallback(
    async (nextMode: BotSwitchState) => {
      const prev = botSwitch;
      setBotSwitch(nextMode);
      try {
        const res = await fetch('/api/admin/agent/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ masterSwitch: nextMode }),
        });
        const data = await res.json();
        if (!res.ok) {
          setBotSwitch(prev);
          throw new Error(data.error || 'Gagal mengubah saklar Agentic CS');
        }
        const label =
          nextMode === 'ON_ALWAYS'
            ? 'ON Penuh (24 Jam)'
            : nextMode === 'ON_OUTSIDE_HOURS'
            ? 'ON Luar Jam Kerja'
            : 'OFF (Manual Penuh)';
        onToast(`Agentic CS (${agentName}): ${label}`);
      } catch (err: any) {
        onToast(err.message || 'Gagal mengubah saklar Agent');
      }
    },
    [botSwitch, agentName, onToast]
  );

  return (
    <WorkspaceContext.Provider
      value={{
        currentUser,
        sessionStatus,
        sessionMe,
        unreadCount,
        openIssuesCount,
        botSwitch,
        agentName,
        reminders,
        openQRModal: onOpenQR,
        openCommandPalette: onOpenCmd,
        refreshSession,
        refreshWorkspaceMeta,
        updateBotSwitch,
        notify: onToast,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}
