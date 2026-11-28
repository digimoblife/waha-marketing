'use client';

import React from 'react';
import { Search, Plus, Clock, MessageSquare, Bot, UserCheck } from 'lucide-react';
import { formatDisplayPhone } from '@/lib/phone';
import Select from '@/components/ui/Select';

export type QuickFilter = 'all' | 'unread' | 'ai_on' | 'ai_off' | 'waiting_tech' | 'mine' | 'reminder';

interface InboxListProps {
  chats: any[];
  selectedChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onToggleChatAi?: (chatId: string, nextMode: 'AI_ACTIVE' | 'HUMAN_TAKEOVER') => void;
  onBulkSetChatAi?: (nextMode: 'AI_ACTIVE' | 'HUMAN_TAKEOVER', chatIds: string[]) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  statusFilter: string;
  setStatusFilter: (s: string) => void;
  quickFilter: QuickFilter;
  setQuickFilter: (f: QuickFilter) => void;
  currentUserId?: string;
  botSwitch?: 'OFF' | 'ON_ALWAYS' | 'ON_OUTSIDE_HOURS';
  isAdmin?: boolean;
  onEnableMasterBot?: () => void;
  onOpenNewChat: () => void;
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  OPEN: {
    label: 'Open',
    cls: 'bg-[#ECF6FA] text-[#00688E] border-[#A7D6E7]',
  },
  FOLLOW_UP: {
    label: 'Follow Up',
    cls: 'bg-[#FEF5E4] text-[#8F5A05] border-[#F7D488]',
  },
  RESOLVED: {
    label: 'Selesai',
    cls: 'bg-[#E7F8F1] text-[#0D6945] border-[#A7E7CB]',
  },
};

const AGENT_MODE_BADGE: Record<string, { label: string; cls: string; isHuman?: boolean }> = {
  AI_ACTIVE: {
    label: 'AI',
    cls: 'bg-[#E7F8F1] text-[#0D6945] border-[#A7E7CB]',
  },
  STEP_BY_STEP: {
    label: 'Panduan AI',
    cls: 'bg-[#ECF6FA] text-[#00688E] border-[#A7D6E7]',
  },
  WAITING_TECH: {
    label: 'Eskalasi',
    cls: 'bg-[#FDECEC] text-[#9E1F23] border-[#F7B4B6]',
  },
  HUMAN_TAKEOVER: {
    label: 'Manual',
    cls: 'bg-[#FEF5E4] text-[#8F5A05] border-[#F7D488]',
    isHuman: true,
  },
};

function formatChatTime(dateStr?: string | null) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
}

export default function InboxList({
  chats,
  selectedChatId,
  onSelectChat,
  onToggleChatAi,
  onBulkSetChatAi,
  searchQuery,
  setSearchQuery,
  statusFilter,
  setStatusFilter,
  quickFilter,
  setQuickFilter,
  currentUserId,
  botSwitch = 'OFF',
  isAdmin = false,
  onEnableMasterBot,
  onOpenNewChat,
}: InboxListProps) {
  const isAiEnabledMode = (mode?: string) =>
    (mode || 'AI_ACTIVE') === 'AI_ACTIVE' || mode === 'STEP_BY_STEP';

  const filtered = chats.filter((c) => {
    const q = searchQuery.trim().toLowerCase();
    const name = (c.contact?.name || c.name || c.id || '').toLowerCase();
    const store = (c.contact?.storeName || '').toLowerCase();
    const phone = (c.contact?.phone || '').toLowerCase();
    const lastMsg = (c.lastMessage || '').toLowerCase();

    if (q && !(name.includes(q) || store.includes(q) || phone.includes(q) || lastMsg.includes(q))) {
      return false;
    }
    if (statusFilter !== 'ALL' && (c.status || 'OPEN') !== statusFilter) {
      return false;
    }
    if (quickFilter === 'unread' && !(c.unreadCount > 0)) return false;
    if (quickFilter === 'ai_on' && (c.isGroup || !isAiEnabledMode(c.agentMode))) return false;
    if (quickFilter === 'ai_off' && (c.isGroup || isAiEnabledMode(c.agentMode))) return false;
    if (quickFilter === 'mine' && (!currentUserId || c.assigneeId !== currentUserId)) return false;
    if (quickFilter === 'reminder' && !c.reminderAt) return false;
    if (quickFilter === 'waiting_tech' && c.agentMode !== 'WAITING_TECH') return false;
    return true;
  });

  const nonGroupFilteredIds = filtered.filter((c) => !c.isGroup).map((c) => c.id);

  return (
    <div className="w-full md:w-[324px] shrink-0 border-r border-[#D1DEE5] flex flex-col bg-white h-full">
      {/* Header */}
      <div className="h-[54px] px-3.5 border-b border-[#D1DEE5] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-[14.5px] font-bold text-[#0F232E] tracking-tight">Inbox</h2>
          <span className="px-1.5 py-0.5 rounded bg-[#E8EFF3] border border-[#D1DEE5] text-[11px] font-semibold text-[#435A68] tabular-nums">
            {filtered.length}
          </span>
        </div>

        <button
          type="button"
          onClick={onOpenNewChat}
          className="h-7 px-2.5 bg-[#00688E] hover:bg-[#005575] text-white text-xs font-semibold rounded-md inline-flex items-center gap-1 transition cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Chat Baru</span>
        </button>
      </div>

      {/* Master Switch OFF Warning Banner */}
      {botSwitch === 'OFF' && (
        <div className="px-3 py-2 bg-[#FEF5E4] border-b border-[#F7D488] flex items-center justify-between gap-2 text-[11px] text-[#8F5A05] shrink-0">
          <span className="font-medium leading-snug">
            <strong>Saklar Utama AI masih OFF.</strong> Nyalakan agar chat bertanda AI ON dijawab otomatis.
          </span>
          {isAdmin && onEnableMasterBot && (
            <button
              type="button"
              onClick={onEnableMasterBot}
              className="px-2 py-1 rounded bg-[#00688E] hover:bg-[#005575] text-white font-bold text-[10.5px] shrink-0 cursor-pointer"
            >
              Nyalakan AI
            </button>
          )}
        </div>
      )}

      {/* Controls: Search + Status Filter + Quick Pills */}
      <div className="p-2.5 border-b border-[#E8EFF3] space-y-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1 min-w-0">
            <Search className="w-3.5 h-3.5 text-[#809AA8] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari merchant, toko..."
              className="w-full h-8 pl-8 pr-2.5 border border-[#D1DEE5] rounded-md text-[12px] text-[#0F232E] placeholder-[#809AA8] focus:outline-none focus:border-[#00688E]"
            />
          </div>

          <Select
            value={statusFilter}
            onChange={(v) => setStatusFilter(v)}
            title="Filter Status"
            className="h-8 w-[104px] px-2 border border-[#D1DEE5] rounded-md text-[11.5px] font-medium bg-white text-[#0F232E] focus:outline-none focus:border-[#00688E] shrink-0"
          >
            <option value="ALL">All Status</option>
            <option value="OPEN">Open</option>
            <option value="FOLLOW_UP">Follow Up</option>
            <option value="RESOLVED">Selesai</option>
          </Select>
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          {(
            [
              { key: 'all', label: 'Semua' },
              { key: 'unread', label: 'Belum Dibaca' },
              { key: 'ai_on', label: 'AI: ON' },
              { key: 'ai_off', label: 'AI: OFF' },
              { key: 'waiting_tech', label: 'Eskalasi' },
              { key: 'mine', label: 'Milik Saya' },
              { key: 'reminder', label: 'Pengingat' },
            ] as const
          ).map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setQuickFilter(f.key)}
              className={`px-2 py-1 rounded text-[11px] font-semibold transition cursor-pointer ${
                quickFilter === f.key
                  ? 'bg-[#0F232E] text-white'
                  : 'text-[#5C7685] hover:bg-[#ECF6FA] hover:text-[#0F232E]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Bulk AI Selector Bar */}
        {onBulkSetChatAi && nonGroupFilteredIds.length > 0 && (
          <div className="pt-1.5 border-t border-[#E8EFF3] flex items-center justify-between gap-1.5 text-[11px]">
            <span className="text-[#5C7685] font-medium truncate">
              Atur AI ({nonGroupFilteredIds.length} chat):
            </span>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => onBulkSetChatAi('AI_ACTIVE', nonGroupFilteredIds)}
                className="px-2 py-0.5 rounded border border-[#A7E7CB] bg-[#E7F8F1] hover:bg-[#D5F3E6] text-[#0D6945] font-semibold cursor-pointer"
              >
                Semua AI ON
              </button>
              <button
                type="button"
                onClick={() => onBulkSetChatAi('HUMAN_TAKEOVER', nonGroupFilteredIds)}
                className="px-2 py-0.5 rounded border border-[#D1DEE5] bg-[#F4F8FA] hover:bg-[#E8EFF3] text-[#435A68] font-semibold cursor-pointer"
              >
                Semua AI OFF
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#E8EFF3]">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#809AA8] space-y-2">
            <MessageSquare className="w-7 h-7 mx-auto text-[#B0C4CF]" />
            <p>Tidak ada obrolan yang cocok.</p>
            <button
              type="button"
              onClick={onOpenNewChat}
              className="text-[#00688E] font-semibold hover:underline cursor-pointer"
            >
              + Mulai chat baru
            </button>
          </div>
        ) : (
          filtered.map((c) => {
            const isSelected = c.id === selectedChatId;
            const displayName =
              c.contact?.name || c.name || formatDisplayPhone(c.id.replace(/@.+$/, ''));
            const storeName = c.contact?.storeName || '';
            const initials = (storeName || displayName || 'WA')
              .split(/\s+/)
              .map((p: string) => p[0])
              .join('')
              .slice(0, 2)
              .toUpperCase();
            const st = STATUS_BADGE[c.status || 'OPEN'] || STATUS_BADGE.OPEN;
            const ag = AGENT_MODE_BADGE[c.agentMode || 'AI_ACTIVE'] || AGENT_MODE_BADGE.AI_ACTIVE;
            const picName = c.assignee?.name ? c.assignee.name.split(/\s+/)[0] : '—';
            const isReminderDue =
              c.reminderAt && new Date(c.reminderAt).getTime() <= Date.now();

            return (
              <div
                key={c.id}
                onClick={() => onSelectChat(c.id)}
                className={`relative px-3.5 py-2.5 flex gap-2.5 cursor-pointer transition ${
                  isSelected ? 'bg-[#D3EBF3]' : 'hover:bg-[#F4F8FA]'
                }`}
              >
                {isSelected && (
                  <span className="absolute left-0 top-0 bottom-0 w-[2.5px] bg-[#00688E]" />
                )}

                <div
                  className={`w-9 h-9 rounded-lg font-bold text-[12px] flex items-center justify-center shrink-0 border ${
                    isSelected
                      ? 'bg-[#00688E] text-white border-[#00688E]'
                      : 'bg-[#E8EFF3] text-[#435A68] border-[#D1DEE5]'
                  }`}
                >
                  {initials}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px] font-semibold text-[#0F232E] truncate">
                      {displayName}
                    </span>
                    <span
                      className={`text-[11px] tabular-nums shrink-0 ${
                        c.unreadCount > 0 ? 'text-[#00688E] font-semibold' : 'text-[#809AA8]'
                      }`}
                    >
                      {formatChatTime(c.lastMessageAt || c.updatedAt)}
                    </span>
                  </div>

                  {/* Store name + Explicit Status & PIC badges */}
                  <div className="flex items-center justify-between gap-1.5 mt-0.5">
                    <span className="text-[11px] text-[#5C7685] truncate">
                      {storeName || (c.contact?.phone ? formatDisplayPhone(c.contact.phone) : c.id)}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {!c.isGroup && onToggleChatAi ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const currentlyOn = isAiEnabledMode(c.agentMode);
                            onToggleChatAi(c.id, currentlyOn ? 'HUMAN_TAKEOVER' : 'AI_ACTIVE');
                          }}
                          title={
                            isAiEnabledMode(c.agentMode)
                              ? 'AI Aktif pada chat ini — klik untuk mematikan AI (Manual)'
                              : 'AI Nonaktif pada chat ini — klik untuk menyalakan AI'
                          }
                          className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-[1.5px] rounded border transition cursor-pointer ${
                            isAiEnabledMode(c.agentMode)
                              ? 'bg-[#E7F8F1] text-[#0D6945] border-[#A7E7CB] hover:bg-[#D5F3E6]'
                              : c.agentMode === 'WAITING_TECH'
                              ? 'bg-[#FDECEC] text-[#9E1F23] border-[#F7B4B6] hover:bg-[#FADADA]'
                              : 'bg-[#F4F8FA] text-[#5C7685] border-[#B0C4CF] hover:bg-[#E8EFF3]'
                          }`}
                        >
                          {isAiEnabledMode(c.agentMode) ? (
                            <>
                              <Bot className="w-2.5 h-2.5" />
                              <span>AI ON</span>
                            </>
                          ) : c.agentMode === 'WAITING_TECH' ? (
                            <>
                              <Bot className="w-2.5 h-2.5" />
                              <span>Eskalasi</span>
                            </>
                          ) : (
                            <>
                              <UserCheck className="w-2.5 h-2.5" />
                              <span>AI OFF</span>
                            </>
                          )}
                        </button>
                      ) : (
                        <span
                          title={`Mode AI: ${c.agentMode || 'AI_ACTIVE'}`}
                          className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-[1px] rounded border ${ag.cls}`}
                        >
                          {ag.isHuman ? (
                            <UserCheck className="w-2.5 h-2.5" />
                          ) : (
                            <Bot className="w-2.5 h-2.5" />
                          )}
                          <span>{ag.label}</span>
                        </span>
                      )}
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-[1px] rounded border ${st.cls}`}
                      >
                        {st.label}
                      </span>
                      <span
                        title={c.assignee ? `PIC: ${c.assignee.name}` : 'Belum di-assign'}
                        className="text-[10px] font-semibold px-1.5 py-[1px] rounded bg-[#E8EFF3] border border-[#D1DEE5] text-[#435A68]"
                      >
                        {picName}
                      </span>
                    </div>
                  </div>

                  {/* Last message preview + Reminder & Unread badge */}
                  <div className="flex items-center justify-between gap-2 mt-1">
                    <span
                      className={`text-[12px] truncate ${
                        c.unreadCount > 0 ? 'text-[#0F232E] font-medium' : 'text-[#5C7685]'
                      }`}
                    >
                      {c.lastMessage || 'Belum ada pesan'}
                    </span>

                    <div className="flex items-center gap-1 shrink-0">
                      {c.reminderAt && (
                        <span
                          title={`Pengingat: ${c.reminderNote || 'Follow up'}`}
                          className={`inline-flex items-center px-1 py-0.5 rounded border text-[10px] font-semibold ${
                            isReminderDue
                              ? 'bg-[#FDECEC] text-[#9E1F23] border-[#F7B4B6]'
                              : 'bg-[#FEF5E4] text-[#8F5A05] border-[#F7D488]'
                          }`}
                        >
                          <Clock className="w-2.5 h-2.5" />
                        </span>
                      )}
                      {c.unreadCount > 0 && (
                        <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#00688E] text-white text-[10.5px] font-bold tabular-nums inline-flex items-center justify-center">
                          {c.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
