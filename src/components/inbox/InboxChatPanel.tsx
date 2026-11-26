'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Send,
  Paperclip,
  Smile,
  Check,
  CheckCheck,
  Clock,
  Reply,
  X,
  FileText,
  Download,
  Loader2,
  ChevronLeft,
  PanelRight,
  ChevronDown,
  WifiOff,
} from 'lucide-react';
import { formatDisplayPhone } from '@/lib/phone';
import { interpolateTemplate } from '@/lib/template-utils';
import EmojiPickerPopover from './EmojiPickerPopover';

interface InboxChatPanelProps {
  chatId: string;
  chatData: any;
  messages: any[];
  loadingMessages: boolean;
  operators: Array<{ id: string; name: string; username: string; role: string }>;
  templates: Array<{ id: string; shortcut: string; title: string; category: string; body: string }>;
  sessionStatus: string;
  onOpenQR: () => void;
  onBackMobile: () => void;
  onToggleInspector: () => void;
  onChangeAssignee: (assigneeId: string) => Promise<void>;
  onChangeStatus: (status: string) => Promise<void>;
  onCompleteReminder: () => Promise<void>;
  onSendMessage: (payload: {
    text?: string;
    replyTo?: string;
    media?: {
      mediaUrl: string;
      dockerUrl: string;
      mediaType: string;
      fileName: string;
      mimeType: string;
      caption?: string;
    };
  }) => Promise<void>;
}

interface PendingFile {
  file: File;
  previewUrl: string | null;
  isImage: boolean;
  sizeLabel: string;
}

export default function InboxChatPanel({
  chatId,
  chatData,
  messages,
  loadingMessages,
  operators,
  templates,
  sessionStatus,
  onOpenQR,
  onBackMobile,
  onToggleInspector,
  onChangeAssignee,
  onChangeStatus,
  onCompleteReminder,
  onSendMessage,
}: InboxChatPanelProps) {
  const [text, setText] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(`waha_draft_${chatId}`) || '';
    }
    return '';
  });
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<any | null>(null);
  const [pendingFile, setPendingFile] = useState<PendingFile | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [quickReplyOpen, setQuickReplyOpen] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevMsgCountRef = useRef<number>(0);

  // Sync draft to localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (text) {
      localStorage.setItem(`waha_draft_${chatId}`, text);
    } else {
      localStorage.removeItem(`waha_draft_${chatId}`);
    }
  }, [chatId, text]);

  // Auto-scroll to bottom when new messages arrive or chat opens
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (messages.length > prevMsgCountRef.current && (isNearBottom || prevMsgCountRef.current === 0)) {
      el.scrollTop = el.scrollHeight;
    }
    prevMsgCountRef.current = messages.length;
  }, [messages]);

  // Cleanup preview object URL
  useEffect(() => {
    return () => {
      if (pendingFile?.previewUrl) {
        URL.revokeObjectURL(pendingFile.previewUrl);
      }
    };
  }, [pendingFile]);

  const contact = chatData?.contact || null;
  const displayName =
    contact?.name || chatData?.name || formatDisplayPhone(chatId.replace(/@.+$/, ''));
  const storeName = contact?.storeName || '';
  const displayPhone = contact?.phone
    ? formatDisplayPhone(contact.phone)
    : formatDisplayPhone(chatId.replace(/@.+$/, ''));
  const initials = (storeName || displayName || 'WA')
    .split(/\s+/)
    .map((p: string) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const handleFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (pendingFile?.previewUrl) URL.revokeObjectURL(pendingFile.previewUrl);

    const isImage = file.type.startsWith('image/');
    const previewUrl = isImage ? URL.createObjectURL(file) : null;
    const sizeLabel =
      file.size > 1024 * 1024
        ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.max(1, Math.round(file.size / 1024))} KB`;

    setPendingFile({ file, previewUrl, isImage, sizeLabel });
    e.target.value = '';
    setEmojiOpen(false);
    setQuickReplyOpen(false);
    textareaRef.current?.focus();
  };

  const handleInsertEmoji = (emoji: string) => {
    const el = textareaRef.current;
    if (!el) {
      setText((prev) => prev + emoji);
      return;
    }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);
    setText(next);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + emoji.length, start + emoji.length);
    }, 0);
  };

  const handleTextChange = (val: string) => {
    setText(val);
    setSendError(null);
    if (val.startsWith('/')) {
      setQuickReplyOpen(true);
      setEmojiOpen(false);
    } else {
      setQuickReplyOpen(false);
    }
  };

  const handleSelectTemplate = (body: string) => {
    const interpolated = interpolateTemplate(body, {
      name: contact?.name || chatData?.name,
      storeName: contact?.storeName,
      category: contact?.businessCategory,
    });
    setText(interpolated);
    setQuickReplyOpen(false);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const handleSend = async () => {
    const trimmed = text.trim();
    if ((!trimmed && !pendingFile) || sending) return;

    setSending(true);
    setSendError(null);
    try {
      let mediaPayload:
        | {
            mediaUrl: string;
            dockerUrl: string;
            mediaType: string;
            fileName: string;
            mimeType: string;
            caption?: string;
          }
        | undefined;

      if (pendingFile) {
        const fd = new FormData();
        fd.append('file', pendingFile.file);
        const uploadRes = await fetch('/api/media/upload', { method: 'POST', body: fd });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) {
          throw new Error(uploadData.error || 'Gagal mengunggah lampiran');
        }
        mediaPayload = {
          mediaUrl: uploadData.url,
          dockerUrl: uploadData.dockerUrl,
          mediaType: uploadData.mediaType,
          fileName: uploadData.fileName,
          mimeType: uploadData.mimeType,
          caption: trimmed || undefined,
        };
      }

      await onSendMessage({
        text: mediaPayload ? undefined : trimmed,
        replyTo: replyingTo?.id,
        media: mediaPayload,
      });

      setText('');
      setReplyingTo(null);
      setPendingFile(null);
      setQuickReplyOpen(false);
      setEmojiOpen(false);
      if (typeof window !== 'undefined') {
        localStorage.removeItem(`waha_draft_${chatId}`);
      }
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 60);
    } catch (err: any) {
      setSendError(err.message || 'Gagal mengirim pesan');
    } finally {
      setSending(false);
    }
  };

  const qrQuery = text.startsWith('/') ? text.slice(1).toLowerCase() : '';
  const filteredTemplates = templates.filter(
    (t) =>
      !qrQuery ||
      t.shortcut.toLowerCase().includes(qrQuery) ||
      t.title.toLowerCase().includes(qrQuery)
  );

  const reminderDue =
    chatData?.reminderAt && new Date(chatData.reminderAt).getTime() <= Date.now();

  return (
    <div className="flex-1 min-w-0 flex flex-col h-full bg-[#F4F8FA]">
      {/* Chat Header */}
      <header className="min-h-[54px] px-3 md:px-4 py-2 bg-white border-b border-[#D1DEE5] flex flex-wrap md:flex-nowrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Mobile Back to List */}
          <button
            type="button"
            onClick={onBackMobile}
            className="md:hidden p-1.5 -ml-1 rounded-md text-[#435A68] hover:bg-[#ECF6FA]"
            aria-label="Kembali ke daftar obrolan"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="w-9 h-9 rounded-lg bg-[#00688E] text-white font-bold text-xs flex items-center justify-center shrink-0">
            {initials}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[13.5px] font-bold text-[#0F232E] truncate">{displayName}</span>
              {storeName && (
                <span className="hidden sm:inline-flex px-1.5 py-0.5 rounded bg-[#ECF6FA] border border-[#A7D6E7] text-[#00688E] text-[10.5px] font-semibold truncate max-w-[160px]">
                  {storeName}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-[11.5px] text-[#5C7685] truncate">
              <span className="font-mono tabular-nums">{displayPhone}</span>
              {contact?.businessCategory && (
                <>
                  <span>•</span>
                  <span className="truncate">{contact.businessCategory}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Controls: PIC Assignee + Status + Inspector Toggle */}
        <div className="flex items-center gap-1.5 w-full md:w-auto justify-between md:justify-end shrink-0">
          <select
            value={chatData?.assigneeId || ''}
            onChange={(e) => onChangeAssignee(e.target.value)}
            title="PIC Operator"
            className="flex-1 md:flex-none md:w-[132px] h-7 px-2 border border-[#B0C4CF] rounded-md text-[11.5px] font-medium bg-white text-[#0F232E] focus:outline-none focus:border-[#00688E]"
          >
            <option value="">Belum Di-assign</option>
            {operators.map((op) => (
              <option key={op.id} value={op.id}>
                PIC: {op.name}
              </option>
            ))}
          </select>

          <select
            value={chatData?.status || 'OPEN'}
            onChange={(e) => onChangeStatus(e.target.value)}
            title="Status Percakapan"
            className="flex-1 md:flex-none md:w-[108px] h-7 px-2 border border-[#B0C4CF] rounded-md text-[11.5px] font-medium bg-white text-[#0F232E] focus:outline-none focus:border-[#00688E]"
          >
            <option value="OPEN">● Open</option>
            <option value="FOLLOW_UP">● Follow Up</option>
            <option value="RESOLVED">● Selesai</option>
          </select>

          <button
            type="button"
            onClick={onToggleInspector}
            title="Info Merchant"
            className="h-7 px-2 border border-[#B0C4CF] bg-white hover:bg-[#F4F8FA] text-[#0F232E] rounded-md inline-flex items-center gap-1 text-xs font-semibold cursor-pointer shrink-0"
          >
            <PanelRight className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Info</span>
          </button>
        </div>
      </header>

      {/* Active Follow-Up Reminder Banner */}
      {chatData?.reminderAt && (
        <div
          className={`px-4 py-2 border-b flex items-center justify-between gap-3 text-xs shrink-0 ${
            reminderDue
              ? 'bg-[#FDECEC] border-[#F7B4B6] text-[#9E1F23]'
              : 'bg-[#FEF5E4] border-[#F7D488] text-[#8F5A05]'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              <strong>Pengingat Follow-Up:</strong>{' '}
              <span className="tabular-nums">
                {new Date(chatData.reminderAt).toLocaleString('id-ID', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>{' '}
              — {chatData.reminderNote || 'Follow up merchant'}
            </span>
          </div>
          <button
            type="button"
            onClick={onCompleteReminder}
            className="h-6 px-2 bg-white border border-current/30 rounded text-[11px] font-semibold shrink-0 hover:opacity-80 cursor-pointer"
          >
            Tandai Selesai
          </button>
        </div>
      )}

      {/* Offline Session Banner */}
      {sessionStatus !== 'WORKING' && (
        <div className="px-4 py-2 bg-[#FDECEC] border-b border-[#F7B4B6] text-[#9E1F23] text-xs flex items-center justify-between gap-2 shrink-0">
          <span className="flex items-center gap-2">
            <WifiOff className="w-3.5 h-3.5 shrink-0" />
            <span>Sesi WhatsApp belum terhubung ({sessionStatus}).</span>
          </span>
          <button
            type="button"
            onClick={onOpenQR}
            className="font-semibold underline cursor-pointer shrink-0"
          >
            Hubungkan WA
          </button>
        </div>
      )}

      {/* Messages Canvas */}
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          setShowScrollBottom(el.scrollHeight - el.scrollTop - el.clientHeight > 220);
        }}
        className="relative flex-1 overflow-y-auto px-3.5 md:px-6 py-4 space-y-2.5"
      >
        {loadingMessages ? (
          <div className="h-full flex items-center justify-center text-xs text-[#809AA8]">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Memuat pesan...
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-[#809AA8]">
            Belum ada riwayat pesan. Kirim pesan pertama atau ketik <code className="font-mono mx-1 text-[#00688E]">/</code> untuk template.
          </div>
        ) : (
          messages.map((m, idx) => {
            const msgDate = new Date(m.timestamp);
            const prevDate = idx > 0 ? new Date(messages[idx - 1].timestamp) : null;
            const showDayDivider =
              !prevDate || msgDate.toDateString() !== prevDate.toDateString();

            const dayLabel =
              msgDate.toDateString() === new Date().toDateString()
                ? 'Hari Ini'
                : msgDate.toLocaleDateString('id-ID', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  });

            return (
              <React.Fragment key={m.id}>
                {showDayDivider && (
                  <div className="flex justify-center my-2">
                    <span className="px-2.5 py-0.5 rounded-full bg-white border border-[#D1DEE5] text-[11px] font-semibold text-[#5C7685]">
                      {dayLabel}
                    </span>
                  </div>
                )}

                <div
                  className={`group flex flex-col max-w-[85%] md:max-w-[68%] ${
                    m.fromMe ? 'ml-auto items-end' : 'mr-auto items-start'
                  }`}
                >
                  <div className="flex items-end gap-1.5 max-w-full">
                    {m.fromMe && (
                      <button
                        type="button"
                        onClick={() => setReplyingTo(m)}
                        title="Balas / Quote"
                        className="opacity-0 group-hover:opacity-100 p-1 rounded text-[#809AA8] hover:text-[#0F232E] hover:bg-white transition cursor-pointer"
                      >
                        <Reply className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <div
                      className={`px-3 py-2 rounded-[10px] text-[13px] leading-relaxed break-words whitespace-pre-wrap ${
                        m.fromMe
                          ? 'bg-[#00435C] text-white rounded-tr-[3px]'
                          : 'bg-white text-[#0F232E] border border-[#D1DEE5] rounded-tl-[3px] shadow-[0_1px_2px_rgba(17,24,39,0.03)]'
                      }`}
                    >
                      {/* Group Sender Name */}
                      {!m.fromMe && m.senderName && (
                        <div className="text-[11px] font-bold text-[#00688E] mb-0.5">
                          {m.senderName}
                        </div>
                      )}

                      {/* Quoted Message Snippet */}
                      {m.quotedBody && (
                        <div
                          className={`mb-1.5 pl-2.5 pr-2 py-1 rounded border-l-2 text-[11.5px] ${
                            m.fromMe
                              ? 'bg-white/10 border-[#BED630] text-white/90'
                              : 'bg-[#F4F8FA] border-[#00688E] text-[#435A68]'
                          }`}
                        >
                          <div className="font-semibold text-[10.5px]">
                            {m.quotedSender || 'Pesan'}
                          </div>
                          <div className="line-clamp-2">{m.quotedBody}</div>
                        </div>
                      )}

                      {/* Media Render */}
                      {m.mediaUrl && m.mediaType === 'image' && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={m.mediaUrl}
                          alt={m.fileName || 'Gambar'}
                          onClick={() => setLightboxUrl(m.mediaUrl)}
                          className="w-[240px] max-w-full rounded-md mb-1.5 cursor-zoom-in border border-black/10"
                        />
                      )}

                      {m.mediaUrl && m.mediaType === 'video' && (
                        <video
                          src={m.mediaUrl}
                          controls
                          className="w-[260px] max-w-full rounded-md mb-1.5"
                        />
                      )}

                      {m.mediaUrl && m.mediaType === 'audio' && (
                        <audio src={m.mediaUrl} controls className="max-w-full mb-1.5" />
                      )}

                      {m.mediaUrl && m.mediaType === 'document' && (
                        <a
                          href={m.mediaUrl}
                          target="_blank"
                          rel="noreferrer"
                          className={`flex items-center gap-2.5 p-2 rounded-md mb-1.5 border ${
                            m.fromMe
                              ? 'bg-white/10 border-white/20 text-white hover:bg-white/15'
                              : 'bg-[#F4F8FA] border-[#D1DEE5] text-[#0F232E] hover:bg-[#E8EFF3]'
                          }`}
                        >
                          <FileText className="w-4 h-4 shrink-0" />
                          <span className="text-xs font-semibold truncate flex-1">
                            {m.fileName || 'Dokumen'}
                          </span>
                          <Download className="w-3.5 h-3.5 shrink-0 opacity-75" />
                        </a>
                      )}

                      {m.body && <span>{m.body}</span>}
                    </div>

                    {!m.fromMe && (
                      <button
                        type="button"
                        onClick={() => setReplyingTo(m)}
                        title="Balas / Quote"
                        className="opacity-0 group-hover:opacity-100 p-1 rounded text-[#809AA8] hover:text-[#0F232E] hover:bg-white transition cursor-pointer"
                      >
                        <Reply className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Timestamp & ACK */}
                  <div className="flex items-center gap-1 mt-1 text-[10.5px] text-[#809AA8] tabular-nums">
                    <span>
                      {msgDate.toLocaleTimeString('id-ID', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {m.fromMe && (
                      <span>
                        {m.ackStatus >= 3 ? (
                          <CheckCheck className="w-3.5 h-3.5 text-[#00688E]" />
                        ) : m.ackStatus === 2 ? (
                          <CheckCheck className="w-3.5 h-3.5 text-[#809AA8]" />
                        ) : (
                          <Check className="w-3.5 h-3.5 text-[#809AA8]" />
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </React.Fragment>
            );
          })
        )}

        {showScrollBottom && (
          <button
            type="button"
            onClick={() => {
              if (scrollRef.current) {
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
              }
            }}
            className="sticky bottom-2 left-full -translate-x-2 w-8 h-8 rounded-full bg-white border border-[#B0C4CF] shadow-md flex items-center justify-center text-[#435A68] hover:text-[#0F232E] cursor-pointer"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Composer */}
      <div className="relative px-3 md:px-4 pt-2.5 pb-3.5 bg-white border-t border-[#D1DEE5] shrink-0">
        {/* Quick Reply `/` Popover */}
        {quickReplyOpen && (
          <div className="absolute bottom-[calc(100%+6px)] left-3 md:left-4 w-[390px] max-w-[calc(100%-24px)] bg-white border border-[#B0C4CF] rounded-lg shadow-xl p-1.5 z-30">
            <div className="px-2 py-1 flex items-center justify-between text-[10.5px] font-bold uppercase tracking-wider text-[#5C7685]">
              <span>Template Pesan Cepat</span>
              <Link
                href="/templates"
                className="text-[#00688E] normal-case font-semibold hover:underline"
              >
                + Kelola Template
              </Link>
            </div>
            <div className="max-h-[220px] overflow-y-auto">
              {filteredTemplates.length === 0 ? (
                <div className="py-4 text-center text-xs text-[#809AA8]">
                  Template tidak ditemukan
                </div>
              ) : (
                filteredTemplates.map((t) => {
                  const preview = interpolateTemplate(t.body, {
                    name: contact?.name || chatData?.name,
                    storeName: contact?.storeName,
                    category: contact?.businessCategory,
                  });
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleSelectTemplate(t.body)}
                      className="w-full text-left px-2 py-2 rounded-md hover:bg-[#F4F8FA] transition cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11.5px] font-semibold text-[#00688E]">
                          {t.shortcut}
                        </span>
                        <span className="text-xs font-semibold text-[#0F232E] truncate">
                          {t.title}
                        </span>
                        <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-[#E8EFF3] text-[#5C7685] font-semibold">
                          {t.category}
                        </span>
                      </div>
                      <p className="text-[11.5px] text-[#5C7685] truncate mt-0.5">{preview}</p>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Emoji Picker Popover */}
        {emojiOpen && <EmojiPickerPopover onSelect={handleInsertEmoji} />}

        {/* Error Alert */}
        {sendError && (
          <div className="mb-2 px-3 py-1.5 rounded-md bg-[#FDECEC] border border-[#F7B4B6] text-[#9E1F23] text-xs flex items-center justify-between">
            <span>{sendError}</span>
            <button type="button" onClick={() => setSendError(null)} className="cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Reply Preview Bar */}
        {replyingTo && (
          <div className="mb-2 px-3 py-2 rounded-md bg-[#F4F8FA] border-l-2 border-[#00688E] border border-[#D1DEE5] flex items-center justify-between gap-2 text-xs">
            <div className="min-w-0">
              <div className="font-semibold text-[#00688E] text-[11px]">
                Membalas {replyingTo.fromMe ? 'Anda' : displayName}
              </div>
              <div className="text-[#435A68] truncate">
                {replyingTo.body || `[${replyingTo.mediaType || 'Media'}]`}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              className="p-1 text-[#5C7685] hover:text-[#0F232E] cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Pending Media Attachment Preview Bar */}
        {pendingFile && (
          <div className="mb-2 px-2.5 py-2 rounded-md bg-[#F4F8FA] border border-[#D1DEE5] flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              {pendingFile.isImage && pendingFile.previewUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={pendingFile.previewUrl}
                  alt="Preview"
                  className="w-10 h-10 rounded object-cover border border-[#D1DEE5] shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded bg-white border border-[#D1DEE5] flex items-center justify-center text-[#00688E] shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
              )}
              <div className="min-w-0">
                <div className="text-xs font-semibold text-[#0F232E] truncate">
                  {pendingFile.file.name}
                </div>
                <div className="text-[11px] text-[#5C7685] tabular-nums">
                  {pendingFile.sizeLabel} • Siap dikirim bersama caption di bawah
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPendingFile(null)}
              className="p-1 text-[#5C7685] hover:text-[#9E1F23] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Composer Input Box */}
        <div className="border border-[#B0C4CF] rounded-lg bg-white focus-within:border-[#00688E] focus-within:ring-2 focus-within:ring-[#00688E]/10 transition">
          <textarea
            ref={textareaRef}
            rows={1}
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              } else if (e.key === 'Escape') {
                setQuickReplyOpen(false);
                setEmojiOpen(false);
              }
            }}
            placeholder={
              pendingFile
                ? 'Tambah caption lampiran (opsional)...'
                : 'Tulis pesan... (ketik / untuk template, Enter kirim)'
            }
            className="w-full max-h-[120px] px-3 pt-2.5 pb-1 text-[13px] text-[#0F232E] placeholder-[#809AA8] resize-none bg-transparent focus:outline-none"
          />

          <div className="px-2 py-1.5 flex items-center justify-between">
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                title="Template Pesan (/)"
                onClick={() => {
                  setQuickReplyOpen((v) => !v);
                  setEmojiOpen(false);
                }}
                className="w-7 h-7 rounded-md text-[#435A68] hover:bg-[#ECF6FA] hover:text-[#0F232E] font-mono font-bold text-[13px] flex items-center justify-center cursor-pointer"
              >
                /
              </button>

              <button
                type="button"
                title="Sisipkan Emoji"
                onClick={() => {
                  setEmojiOpen((v) => !v);
                  setQuickReplyOpen(false);
                }}
                className="w-7 h-7 rounded-md text-[#435A68] hover:bg-[#ECF6FA] hover:text-[#0F232E] flex items-center justify-center cursor-pointer"
              >
                <Smile className="w-4 h-4" />
              </button>

              <button
                type="button"
                title="Lampirkan Gambar / Dokumen"
                onClick={() => fileInputRef.current?.click()}
                className="w-7 h-7 rounded-md text-[#435A68] hover:bg-[#ECF6FA] hover:text-[#0F232E] flex items-center justify-center cursor-pointer"
              >
                <Paperclip className="w-4 h-4" />
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.zip"
                onChange={handleFilePicked}
                className="hidden"
              />
            </div>

            <button
              type="button"
              disabled={sending || (!text.trim() && !pendingFile)}
              onClick={handleSend}
              className="h-7 px-3 bg-[#00688E] hover:bg-[#005575] disabled:opacity-45 text-white text-xs font-semibold rounded-md inline-flex items-center gap-1.5 transition cursor-pointer"
            >
              {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span>Kirim</span>
            </button>
          </div>
        </div>
      </div>

      {/* Image Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <div className="relative max-w-[90vw] max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setLightboxUrl(null)}
              className="absolute -top-9 right-0 text-white text-xs font-semibold px-2.5 py-1 rounded bg-white/15 hover:bg-white/25 cursor-pointer"
            >
              Tutup ✕
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxUrl}
              alt="Lightbox Preview"
              className="max-w-[90vw] max-h-[80vh] rounded-lg object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
