'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Paperclip,
  Smile,
  MoreVertical,
  Check,
  CheckCheck,
  Clock,
  MessageSquare,
  Tag,
  Phone,
  Pencil,
  Check as CheckIcon,
  X as XIcon,
  Link2,
  Reply,
  X,
  FileText,
  Download,
  Image as ImageIcon,
  Film,
  File,
  Loader2,
  ZoomIn,
  Trash2,
  Shield,
  Store,
  MapPin,
  Mail,
  Calendar,
  ExternalLink,
  Globe,
  ChevronDown,
  WifiOff,
} from 'lucide-react';
import { formatDisplayPhone, isLid } from '@/lib/phone';
import { formatAccountDate } from '@/lib/date';

interface ChatRoomProps {
  chatId: string;
  chatData?: any;
  messages: any[];
  allContacts?: any[];
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
  onClearChat?: (mode: 'clear_messages' | 'delete_chat') => void;
  onMergeSuccess?: (targetJid: string) => void;
  loadingMessages: boolean;
  sessionStatus?: string;
  onOpenQR?: () => void;
}

export default function ChatRoom({
  chatId,
  chatData,
  messages,
  allContacts = [],
  onSendMessage,
  onClearChat,
  onMergeSuccess,
  loadingMessages,
  sessionStatus = 'WORKING',
  onOpenQR,
}: ChatRoomProps) {
  const [text, setText] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(`waha_draft_${chatId}`) || '';
    }
    return '';
  });
  const [sending, setSending] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [customName, setCustomName] = useState('');
  const [currentDisplayName, setCurrentDisplayName] = useState('');
  const [selectedTargetJid, setSelectedTargetJid] = useState('');
  const [merging, setMerging] = useState(false);
  const [replyingTo, setReplyingTo] = useState<any | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingChat, setDeletingChat] = useState(false);

  // Link modal state
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');

  // Emoji picker state
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [activeEmojiCat, setActiveEmojiCat] = useState(0);

  // Media preview & upload states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [fileCaption, setFileCaption] = useState('');
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  // Persist draft message per chatId in localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const key = `waha_draft_${chatId}`;
    if (text.trim()) {
      localStorage.setItem(key, text);
    } else {
      localStorage.removeItem(key);
    }
  }, [text, chatId]);

  const EMOJI_CATEGORIES = [
    {
      label: 'Ekspresi',
      icon: '😊',
      emojis: [
        '😊', '😁', '😂', '🤣', '😍', '🥰', '😘', '😉',
        '🙏', '👍', '👏', '🙌', '🤝', '👋', '✌️', '👌',
        '🤗', '🤔', '😅', '😢', '😭', '😔', '😤', '😮',
        '❤️', '💚', '🧡', '💛', '💙', '🎉', '🔥', '⭐',
      ],
    },
    {
      label: 'Bisnis',
      icon: '🛒',
      emojis: [
        '🛒', '🛍️', '📦', '🚚', '💳', '💰', '💸', '🏷️',
        '🧾', '📱', '💻', '🏪', '✨', '🚀', '📢', '📌',
        '🕒', '📍', '🔗', '📝', '📸', '🎁', '💎', '📈',
      ],
    },
    {
      label: 'Simbol',
      icon: '✅',
      emojis: [
        '✅', '☑️', '✔️', '❌', '❗', '❓', '💡', '🔔',
        '👉', '👇', '👆', '➡️', '⬅️', '💯', '🎯', '🏆',
        '🌟', '☀️', '☕', '🍀', '💐', '🎊', '📣', '💬',
      ],
    },
  ];

  // Close emoji picker on outside click or Escape
  useEffect(() => {
    if (!showEmojiPicker) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowEmojiPicker(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [showEmojiPicker]);

  const handleInsertEmoji = (emoji: string) => {
    const el = textareaRef.current;
    if (!el) {
      setText((prev) => prev + emoji);
      return;
    }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const nextText = text.slice(0, start) + emoji + text.slice(end);
    setText(nextText);
    setTimeout(() => {
      el.focus();
      const pos = start + emoji.length;
      el.setSelectionRange(pos, pos);
    }, 0);
  };

  // Set display name from props
  useEffect(() => {
    const rawName =
      chatData?.contact?.name || chatData?.name || chatId.replace('@c.us', '').replace('@lid', '');
    const cleanName =
      isLid(rawName) && rawName === chatData?.contact?.phone
        ? `WhatsApp User (${rawName.slice(-6)})`
        : rawName;
    setCurrentDisplayName(cleanName);
    setCustomName(cleanName);
  }, [chatData, chatId]);

  // Smart auto-scroll: instant on initial load, smooth only if user is at bottom or sent the message
  const prevCountRef = useRef(0);
  useEffect(() => {
    if (messages.length === 0) {
      prevCountRef.current = 0;
      return;
    }

    if (prevCountRef.current === 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      isAtBottomRef.current = true;
      setShowScrollBottom(false);
    } else if (messages.length > prevCountRef.current) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.fromMe || isAtBottomRef.current) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      } else {
        setShowScrollBottom(true);
      }
    }
    prevCountRef.current = messages.length;
  }, [messages]);

  const handleMessagesScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceFromBottom < 80;
    isAtBottomRef.current = atBottom;
    setShowScrollBottom(!atBottom);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    isAtBottomRef.current = true;
    setShowScrollBottom(false);
  };

  const scrollToQuotedMessage = (quotedMsgId?: string | null) => {
    if (!quotedMsgId) return;
    const stanza = quotedMsgId.includes('_') ? quotedMsgId.split('_').pop() || quotedMsgId : quotedMsgId;
    const target = messages.find(
      (msg) => msg.id === quotedMsgId || (stanza && typeof msg.id === 'string' && msg.id.endsWith(stanza))
    );
    if (!target) return;
    const el = document.getElementById(`msg-${target.id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMsgId(target.id);
      setTimeout(() => {
        setHighlightedMsgId((prev) => (prev === target.id ? null : prev));
      }, 1800);
    }
  };

  const getDateLabel = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Hari Ini';
    if (date.toDateString() === yesterday.toDateString()) return 'Kemarin';
    return date.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  // Handle standard text send
  const handleSendText = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!text.trim() || sending) return;

    const messageText = text.trim();
    const replyMsgId = replyingTo?.id;

    setText('');
    setReplyingTo(null);
    setSending(true);

    try {
      await onSendMessage({
        text: messageText,
        replyTo: replyMsgId,
      });
    } catch (err: any) {
      setText(messageText);
      alert(`Gagal mengirim pesan: ${err?.message || 'Terjadi kesalahan'}`);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendText();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          setSelectedFile(file);
          setFileCaption(text.trim());
          setFilePreviewUrl(URL.createObjectURL(file));
          return;
        }
      }
    }
  };

  // Handle file select
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setFileCaption('');
      if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
        setFilePreviewUrl(URL.createObjectURL(file));
      } else {
        setFilePreviewUrl(null);
      }
    }
    // reset input so same file can be picked again if desired
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Close media modal & revoke object url
  const closeMediaModal = () => {
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    setSelectedFile(null);
    setFilePreviewUrl(null);
    setFileCaption('');
  };

  // Upload and send media
  const handleSendMedia = async () => {
    if (!selectedFile || uploadingMedia) return;
    setUploadingMedia(true);

    try {
      // 1. Upload to server
      const formData = new FormData();
      formData.append('file', selectedFile);

      const uploadRes = await fetch('/api/media/upload', {
        method: 'POST',
        body: formData,
      });

      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error || 'Upload gagal');

      // 2. Send via message API
      await onSendMessage({
        replyTo: replyingTo?.id,
        media: {
          mediaUrl: uploadData.url,
          dockerUrl: uploadData.dockerUrl,
          mediaType: uploadData.mediaType,
          fileName: uploadData.fileName,
          mimeType: uploadData.mimeType,
          caption: fileCaption.trim() || undefined,
        },
      });

      closeMediaModal();
      setReplyingTo(null);
    } catch (err: any) {
      alert(`Gagal mengirim media: ${err.message}`);
    } finally {
      setUploadingMedia(false);
    }
  };

  const startReply = (msg: any) => {
    setReplyingTo(msg);
    textareaRef.current?.focus();
  };

  const handleSaveName = async () => {
    if (!customName.trim()) return;
    try {
      const res = await fetch('/api/contacts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jid: chatId,
          name: customName.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan nama');
      setCurrentDisplayName(customName.trim());
      setEditingName(false);
    } catch (err: any) {
      console.error('Failed to update name:', err);
      alert(`Gagal menyimpan nama: ${err?.message || 'Terjadi kesalahan'}`);
    }
  };

  const handleMerge = async () => {
    if (!selectedTargetJid || merging) return;
    setMerging(true);
    try {
      const res = await fetch('/api/contacts/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceJid: chatId,
          targetJid: selectedTargetJid,
        }),
      });
      const data = await res.json();
      if (data.ok && onMergeSuccess) {
        onMergeSuccess(selectedTargetJid);
      }
    } catch (err) {
      console.error('Merge error:', err);
    } finally {
      setMerging(false);
    }
  };

  const displayPhone = chatData?.contact?.phone
    ? formatDisplayPhone(chatData.contact.phone)
    : formatDisplayPhone(chatId.replace('@c.us', '').replace('@lid', ''));

  const formatMsgTime = (timestampStr: string) => {
    if (!timestampStr) return '';
    const date = new Date(timestampStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Helper to extract first URL for preview card
  const getFirstUrl = (content: string): string | null => {
    if (!content) return null;
    const match = content.match(/(https?:\/\/[^\s]+|www\.[^\s]+)/i);
    if (!match) return null;
    let url = match[0];
    if (url.startsWith('www.')) url = `https://${url}`;
    try {
      new URL(url);
      return url;
    } catch {
      return null;
    }
  };

  // Helper to render message body with clickable URLs
  const renderMessageBody = (content: string) => {
    if (!content) return null;

    const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
    const parts = content.split(urlRegex);

    return parts.map((part, index) => {
      if (part.match(urlRegex)) {
        const href = part.startsWith('http') ? part : `https://${part}`;
        return (
          <a
            key={index}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-700 underline font-medium break-all inline-flex items-center gap-0.5 hover:opacity-85 transition cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          >
            <span>{part}</span>
            <ExternalLink className="w-3 h-3 inline-block shrink-0 opacity-80 ml-0.5" />
          </a>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  const handleInsertLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkUrl.trim()) return;

    let cleanUrl = linkUrl.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = `https://${cleanUrl}`;
    }

    const title = linkTitle.trim();
    // Only prepend title if it's not identical to the URL itself
    const isTitleUrl = title === cleanUrl || title === linkUrl.trim();
    const snippet = title && !isTitleUrl ? `${title}\n${cleanUrl}` : cleanUrl;

    setText((prev) => {
      if (!prev) return snippet;
      if (prev.trim() === snippet) return prev;
      return `${prev}\n${snippet}`;
    });

    setLinkUrl('');
    setLinkTitle('');
    setShowLinkModal(false);
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  const isCurrentChatLid = isLid(chatId);
  const eligibleTargetContacts = allContacts.filter((c) => !isLid(c.jid) && c.jid !== chatId);

  const handleClearHistory = async (mode: 'clear_messages' | 'delete_chat') => {
    if (deletingChat) return;
    setDeletingChat(true);
    try {
      const res = await fetch(`/api/chats?chatId=${encodeURIComponent(chatId)}&mode=${mode}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menghapus riwayat');

      setShowDeleteModal(false);
      if (onClearChat) {
        onClearChat(mode);
      }
    } catch (err: any) {
      alert(`Gagal: ${err.message}`);
    } finally {
      setDeletingChat(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#EFEAE2] wa-chat-bg relative">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Chat Top Header */}
      <header className="h-16 px-4 bg-[#F0F2F5] border-b border-gray-200 flex items-center justify-between shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#128C7E] flex items-center justify-center text-white font-bold text-sm shadow-sm">
            {currentDisplayName ? currentDisplayName.charAt(0).toUpperCase() : 'W'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              {editingName ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="Nama kontak..."
                    className="text-sm font-semibold text-gray-900 bg-white border border-gray-300 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#128C7E]"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveName}
                    className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                    title="Simpan"
                  >
                    <CheckIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      setCustomName(currentDisplayName);
                      setEditingName(false);
                    }}
                    className="p-1 text-gray-400 hover:bg-gray-100 rounded"
                    title="Batal"
                  >
                    <XIcon className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 group">
                  <h2 className="text-sm font-semibold text-gray-900 leading-tight">
                    {currentDisplayName}
                  </h2>
                  <button
                    onClick={() => setEditingName(true)}
                    className="text-gray-400 hover:text-gray-700 p-0.5 rounded transition"
                    title="Ubah Nama Kontak"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                </div>
              )}

              {chatData?.contact?.tags && (
                <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                  <Tag className="w-2.5 h-2.5" />
                  {chatData.contact.tags}
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-500 flex items-center gap-1">
              <Phone className="w-3 h-3" />
              {displayPhone}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-gray-500">
          <a
            href="/admin"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-emerald-50 border border-gray-200 hover:border-emerald-300 text-xs font-semibold text-[#075E54] rounded-lg transition shadow-2xs cursor-pointer"
            title="Buka TailAdmin Dashboard"
          >
            <Shield className="w-3.5 h-3.5 text-[#128C7E]" />
            <span className="hidden sm:inline">Buka Dashboard Admin</span>
          </a>

          <button
            onClick={() => setShowDeleteModal(true)}
            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition cursor-pointer"
            title="Hapus Riwayat Chat"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Merchant Lapaq Context Info Banner */}
      {(chatData?.contact?.storeName ||
        chatData?.contact?.businessCategory ||
        chatData?.contact?.address ||
        chatData?.contact?.email) && (
        <div className="bg-gradient-to-r from-amber-50/95 via-orange-50/70 to-emerald-50/60 border-b border-amber-200/70 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs z-10 shrink-0 shadow-2xs">
          <div className="flex flex-wrap items-center gap-2">
            {chatData.contact.storeName && (
              <span className="font-bold text-amber-950 flex items-center gap-1.5 bg-amber-100/70 border border-amber-200 px-2 py-0.5 rounded-md">
                <Store className="w-3.5 h-3.5 text-amber-700" />
                <span>{chatData.contact.storeName}</span>
              </span>
            )}
            {chatData.contact.businessCategory && (
              <span className="bg-purple-100/90 text-purple-800 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-purple-200">
                {chatData.contact.businessCategory}
              </span>
            )}
            {chatData.contact.address && (
              <span className="text-gray-700 text-[11px] flex items-center gap-1">
                <MapPin className="w-3 h-3 text-red-500 shrink-0" />
                <span>{chatData.contact.address}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 text-[11px] text-gray-600">
            {chatData.contact.email && (
              <span className="flex items-center gap-1 text-slate-600">
                <Mail className="w-3 h-3 text-slate-400" />
                <span>{chatData.contact.email}</span>
              </span>
            )}
            {chatData.contact.accountCreatedAt && (
              <span className="flex items-center gap-1 text-slate-500">
                <Calendar className="w-3 h-3 text-slate-400" />
                <span>Daftar: {formatAccountDate(chatData.contact.accountCreatedAt)}</span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Smart Merge Banner */}
      {isCurrentChatLid && eligibleTargetContacts.length > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900 z-10 shrink-0 shadow-sm animate-in fade-in">
          <div className="flex items-center gap-1.5">
            <Link2 className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              Ini adalah ID privasi WhatsApp (LID). Hubungkan percakapan ini ke kontak buku telepon:
            </span>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedTargetJid}
              onChange={(e) => setSelectedTargetJid(e.target.value)}
              className="bg-white border border-amber-300 rounded-lg px-2.5 py-1 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#128C7E]"
            >
              <option value="">-- Pilih Kontak Tujuan --</option>
              {eligibleTargetContacts.map((c) => (
                <option key={c.jid} value={c.jid}>
                  {c.name || c.phone} ({formatDisplayPhone(c.phone)})
                </option>
              ))}
            </select>
            <button
              onClick={handleMerge}
              disabled={!selectedTargetJid || merging}
              className="bg-[#128C7E] hover:bg-[#075E54] disabled:opacity-50 text-white px-3 py-1 rounded-lg font-semibold text-xs transition shadow-sm cursor-pointer"
            >
              {merging ? 'Menggabungkan...' : 'Gabungkan Chat'}
            </button>
          </div>
        </div>
      )}

      {/* Offline / Disconnected Connection Warning Banner */}
      {sessionStatus && sessionStatus !== 'WORKING' && (
        <div className="bg-rose-50 border-b border-rose-200 px-4 py-2 flex items-center justify-between gap-2 text-xs text-rose-900 z-10 shrink-0 shadow-xs">
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 text-rose-600 shrink-0" />
            <span>
              Koneksi WhatsApp terputus (<strong>{sessionStatus}</strong>). Pesan tidak dapat dikirim sampai terhubung kembali.
            </span>
          </div>
          {onOpenQR && (
            <button
              type="button"
              onClick={onOpenQR}
              className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-lg text-[11px] transition shrink-0 cursor-pointer"
            >
              Hubungkan
            </button>
          )}
        </div>
      )}

      {/* Message Bubbles Body */}
      <div
        ref={scrollContainerRef}
        onScroll={handleMessagesScroll}
        className="flex-1 overflow-y-auto p-4 space-y-2 relative"
      >
        {loadingMessages && messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-gray-500">
            <span>Memuat pesan...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-400 space-y-2">
            <div className="w-12 h-12 rounded-full bg-white/70 shadow-sm flex items-center justify-center text-gray-400">
              <MessageSquare className="w-6 h-6" />
            </div>
            <p className="text-xs text-gray-500">
              Belum ada riwayat pesan dengan nomor ini.
            </p>
            <p className="text-[11px] text-gray-400">
              Ketik pesan atau kirim file di bawah untuk memulai percakapan.
            </p>
          </div>
        ) : (
          messages.map((m, idx) => {
            const isMe = m.fromMe;
            const prevMsg = idx > 0 ? messages[idx - 1] : null;
            const showDateDivider =
              !prevMsg ||
              new Date(m.timestamp).toDateString() !== new Date(prevMsg.timestamp).toDateString();
            const isHighlighted = highlightedMsgId === m.id;
            const isGroupChat = chatId.endsWith('@g.us');

            return (
              <React.Fragment key={m.id}>
                {showDateDivider && (
                  <div className="flex justify-center my-3">
                    <span className="bg-white/90 text-gray-600 text-[11px] font-medium px-3 py-1 rounded-lg shadow-xs select-none border border-gray-100">
                      {getDateLabel(m.timestamp)}
                    </span>
                  </div>
                )}

                <div
                  id={`msg-${m.id}`}
                  className={`flex group items-end gap-1.5 transition-all duration-300 rounded-xl px-1 py-0.5 ${
                    isMe ? 'justify-end' : 'justify-start'
                  } ${isHighlighted ? 'ring-2 ring-[#128C7E]/60 bg-[#128C7E]/10' : ''}`}
                >
                  {/* Reply button on hover for incoming messages */}
                  {!isMe && (
                    <button
                      onClick={() => startReply(m)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-black/10 rounded-full text-gray-500 transition mb-1 shrink-0 cursor-pointer"
                      title="Balas pesan ini"
                    >
                      <Reply className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <div
                    className={`max-w-[80%] sm:max-w-md rounded-lg p-1.5 shadow-sm text-sm relative break-words select-text ${
                      isMe
                        ? 'bg-[#D9FDD3] text-gray-900 rounded-tr-none'
                        : 'bg-white text-gray-900 rounded-tl-none'
                    }`}
                  >
                    {/* Group Chat Sender Name */}
                    {isGroupChat && !isMe && m.senderName && (
                      <div className="px-1 pt-0.5 pb-1 text-[11px] font-semibold text-[#128C7E]">
                        {m.senderName}
                      </div>
                    )}

                    {/* Quoted Message Card (click to jump to original message) */}
                    {m.quotedBody && (
                      <div
                        onClick={() => scrollToQuotedMessage(m.quotedMsgId)}
                        title={m.quotedMsgId ? 'Klik untuk melihat pesan asli' : undefined}
                        className={`mb-1.5 rounded px-2.5 py-1 text-xs border-l-[3.5px] select-none transition ${
                          m.quotedMsgId ? 'cursor-pointer hover:brightness-95' : ''
                        } ${
                          isMe
                            ? 'bg-[#075E54]/5 border-[#075E54]'
                            : 'bg-gray-100 border-[#128C7E]'
                        }`}
                      >
                        <span className="font-semibold block text-[11px] text-[#075E54] leading-tight mb-0.5">
                          {m.quotedSender || (isMe ? 'Anda' : currentDisplayName)}
                        </span>
                        <p className="line-clamp-2 text-[11.5px] text-gray-600 leading-snug">
                          {m.quotedBody}
                        </p>
                      </div>
                    )}

                  {/* MEDIA RENDERING: IMAGE */}
                  {m.mediaType === 'image' && m.mediaUrl && (
                    <div className="mb-1 rounded overflow-hidden relative group/img cursor-pointer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={m.mediaUrl}
                        alt="Foto"
                        className="max-h-72 w-full object-cover rounded hover:opacity-95 transition"
                        onClick={() => setLightboxUrl(m.mediaUrl)}
                      />
                      <div
                        onClick={() => setLightboxUrl(m.mediaUrl)}
                        className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition text-white"
                      >
                        <ZoomIn className="w-6 h-6" />
                      </div>
                    </div>
                  )}

                  {/* MEDIA RENDERING: VIDEO */}
                  {m.mediaType === 'video' && m.mediaUrl && (
                    <div className="mb-1 rounded overflow-hidden bg-black">
                      <video
                        src={m.mediaUrl}
                        controls
                        className="max-h-72 w-full rounded"
                      />
                    </div>
                  )}

                  {/* MEDIA RENDERING: AUDIO */}
                  {m.mediaType === 'audio' && m.mediaUrl && (
                    <div className="mb-1 p-1">
                      <audio src={m.mediaUrl} controls className="w-full max-w-xs" />
                    </div>
                  )}

                  {/* MEDIA RENDERING: DOCUMENT */}
                  {m.mediaType === 'document' && m.mediaUrl && (
                    <div className="mb-1.5 p-2.5 bg-black/5 rounded-lg flex items-center justify-between gap-3 border border-black/5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-red-100 text-red-700 flex items-center justify-center shrink-0">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate text-gray-900">
                            {m.fileName || 'Dokumen'}
                          </p>
                          <span className="text-[10px] text-gray-500 uppercase">File Unduhan</span>
                        </div>
                      </div>
                      <a
                        href={m.mediaUrl}
                        download={m.fileName || 'dokumen'}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 hover:bg-black/10 rounded-full text-gray-600 transition shrink-0"
                        title="Unduh File"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                    </div>
                  )}

                  {/* Message Text / Caption body */}
                  {m.body && (
                    <div className="text-[13.5px] leading-relaxed px-1">
                      <p className="whitespace-pre-wrap">
                        {renderMessageBody(m.body)}
                      </p>

                      {/* Interactive Link Preview Card */}
                      {getFirstUrl(m.body) && (
                        <a
                          href={getFirstUrl(m.body)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className={`mt-2 block rounded-xl p-2.5 transition border text-left group no-underline ${
                            isMe
                              ? 'bg-emerald-900/10 hover:bg-emerald-900/15 border-emerald-900/10'
                              : 'bg-black/5 hover:bg-black/10 border-black/10'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-blue-500/15 text-blue-600 flex items-center justify-center shrink-0">
                              <Globe className="w-4 h-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-gray-800 truncate group-hover:text-blue-600 transition">
                                {(() => {
                                  try {
                                    return new URL(getFirstUrl(m.body)!).hostname;
                                  } catch {
                                    return 'Buka Tautan';
                                  }
                                })()}
                              </p>
                              <p className="text-[11px] text-gray-500 truncate flex items-center gap-1">
                                <span className="truncate">{getFirstUrl(m.body)}</span>
                                <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-70" />
                              </p>
                            </div>
                          </div>
                        </a>
                      )}
                    </div>
                  )}

                  {/* Timestamp & Status footer */}
                  <div className="flex items-center justify-end gap-1 mt-0.5 px-1 text-[10px] text-gray-400 select-none">
                    <span>{formatMsgTime(m.timestamp)}</span>
                    {isMe && (
                      <span title={`Status ACK: ${m.ackStatus}`}>
                        {m.ackStatus === 0 ? (
                          <Clock className="w-3 h-3 text-gray-400" />
                        ) : m.ackStatus === 1 ? (
                          <Check className="w-3.5 h-3.5 text-gray-400" />
                        ) : m.ackStatus === 2 ? (
                          <CheckCheck className="w-3.5 h-3.5 text-gray-400" />
                        ) : (
                          <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]" />
                        )}
                      </span>
                    )}
                  </div>
                </div>

                {/* Reply button on hover for outgoing messages */}
                {isMe && (
                  <button
                    onClick={() => startReply(m)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-black/10 rounded-full text-gray-500 transition mb-1 shrink-0 cursor-pointer"
                    title="Balas pesan ini"
                  >
                    <Reply className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              </React.Fragment>
            );
          })
        )}
        <div ref={messagesEndRef} />

        {/* Floating Scroll-to-Bottom Button */}
        {showScrollBottom && (
          <button
            type="button"
            onClick={scrollToBottom}
            title="Gulir ke pesan terbaru"
            className="sticky bottom-3 left-full ml-auto w-9 h-9 rounded-full bg-white hover:bg-gray-50 text-gray-600 shadow-lg border border-gray-200 flex items-center justify-center transition z-20 cursor-pointer"
          >
            <ChevronDown className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Input Message Footer */}
      <footer className="bg-[#F0F2F5] px-4 py-2 flex flex-col border-t border-gray-200 shrink-0">
        {/* Reply Context Bar */}
        {replyingTo && (
          <div className="flex items-center justify-between bg-white/90 border-l-[3.5px] border-[#128C7E] px-3 py-1.5 rounded-t-lg mb-1 shadow-sm text-xs">
            <div className="min-w-0 pr-2">
              <span className="font-semibold text-[11px] text-[#075E54] block leading-tight">
                Membalas ke {replyingTo.fromMe ? 'Anda' : currentDisplayName}:
              </span>
              <p className="text-gray-600 truncate text-[11.5px] italic">
                {replyingTo.body || `[${replyingTo.mediaType || 'Media'}]`}
              </p>
            </div>
            <button
              onClick={() => setReplyingTo(null)}
              className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition shrink-0"
              title="Batalkan balas pesan"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex items-end gap-2 relative">
          {/* Emoji Picker Button & Popover */}
          <div ref={emojiPickerRef} className="relative">
            {showEmojiPicker && (
              <div className="absolute bottom-12 left-0 z-40 w-72 bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150">
                <div className="flex items-center border-b border-gray-100 bg-gray-50/80 px-2 pt-1.5 gap-1">
                  {EMOJI_CATEGORIES.map((cat, idx) => (
                    <button
                      key={cat.label}
                      type="button"
                      onClick={() => setActiveEmojiCat(idx)}
                      className={`flex-1 py-1.5 px-2 text-xs font-medium rounded-t-lg transition flex items-center justify-center gap-1 cursor-pointer ${
                        activeEmojiCat === idx
                          ? 'bg-white text-[#075E54] border-b-2 border-[#128C7E] shadow-xs'
                          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100/70'
                      }`}
                    >
                      <span>{cat.icon}</span>
                      <span>{cat.label}</span>
                    </button>
                  ))}
                </div>
                <div className="p-2.5 grid grid-cols-8 gap-1 max-h-52 overflow-y-auto">
                  {EMOJI_CATEGORIES[activeEmojiCat].emojis.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => handleInsertEmoji(emoji)}
                      className="w-8 h-8 flex items-center justify-center text-lg rounded-lg hover:bg-gray-100 active:scale-95 transition cursor-pointer"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowEmojiPicker((prev) => !prev)}
              title="Emoji"
              className={`p-2 rounded-full transition mb-0.5 cursor-pointer ${
                showEmojiPicker
                  ? 'bg-[#128C7E]/15 text-[#075E54]'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/80'
              }`}
            >
              <Smile className="w-5 h-5" />
            </button>
          </div>

          {/* Attachment Paperclip Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Lampirkan Gambar, Video, atau Dokumen"
            className="p-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-200/80 transition mb-0.5 cursor-pointer"
          >
            <Paperclip className="w-5 h-5" />
          </button>

          {/* Insert Link Button */}
          <button
            type="button"
            onClick={() => setShowLinkModal(true)}
            title="Kirim Tautan / Link Website"
            className="p-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-200/80 transition mb-0.5 cursor-pointer"
          >
            <Link2 className="w-5 h-5" />
          </button>

          {/* Text Input area */}
          <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-inner px-3 py-1.5 focus-within:ring-1 focus-within:ring-[#128C7E] transition">
            <textarea
              ref={textareaRef}
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={replyingTo ? 'Ketik balasan Anda...' : 'Ketik pesan (Enter kirim, Shift+Enter baris baru)...'}
              className="w-full text-xs sm:text-sm text-gray-800 placeholder-gray-400 bg-transparent resize-none focus:outline-none max-h-32 leading-5"
            />
          </div>

          {/* Send Button */}
          <button
            type="button"
            onClick={() => handleSendText()}
            disabled={!text.trim() || sending}
            className="w-10 h-10 rounded-full bg-[#128C7E] hover:bg-[#075E54] disabled:opacity-40 text-white flex items-center justify-center shadow transition shrink-0 mb-0.5 cursor-pointer"
          >
            <Send className="w-4 h-4 ml-0.5" />
          </button>
        </div>
      </footer>

      {/* MEDIA PREVIEW & CAPTION MODAL */}
      {selectedFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-100 flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="bg-[#075E54] text-white px-5 py-3.5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                {selectedFile.type.startsWith('image/') ? (
                  <ImageIcon className="w-5 h-5 text-wa-green" />
                ) : selectedFile.type.startsWith('video/') ? (
                  <Film className="w-5 h-5 text-wa-green" />
                ) : (
                  <File className="w-5 h-5 text-wa-green" />
                )}
                <h3 className="font-semibold text-sm truncate">
                  Kirim ke {currentDisplayName}
                </h3>
              </div>
              <button
                onClick={closeMediaModal}
                disabled={uploadingMedia}
                className="text-white/80 hover:text-white p-1 rounded-full hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Media Body / Preview Area */}
            <div className="p-4 flex-1 overflow-y-auto flex flex-col items-center justify-center bg-gray-50/70">
              {filePreviewUrl && selectedFile.type.startsWith('image/') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={filePreviewUrl}
                  alt="Preview"
                  className="max-h-80 w-auto object-contain rounded-xl shadow-sm border border-gray-200"
                />
              ) : filePreviewUrl && selectedFile.type.startsWith('video/') ? (
                <video
                  src={filePreviewUrl}
                  controls
                  className="max-h-80 w-full rounded-xl shadow-sm bg-black"
                />
              ) : (
                <div className="p-8 text-center space-y-2 bg-white rounded-xl border border-gray-200 shadow-sm w-full">
                  <div className="w-16 h-16 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto">
                    <FileText className="w-8 h-8" />
                  </div>
                  <h4 className="font-semibold text-gray-800 text-sm truncate max-w-xs mx-auto">
                    {selectedFile.name}
                  </h4>
                  <p className="text-xs text-gray-400">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              )}
            </div>

            {/* Caption & Send Footer */}
            <div className="p-4 bg-white border-t border-gray-100 flex items-center gap-2">
              <input
                type="text"
                placeholder="Tambahkan keterangan (caption)..."
                value={fileCaption}
                onChange={(e) => setFileCaption(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSendMedia();
                  }
                }}
                disabled={uploadingMedia}
                autoFocus
                className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#128C7E] focus:border-transparent transition"
              />

              <button
                type="button"
                onClick={handleSendMedia}
                disabled={uploadingMedia}
                className="w-10 h-10 rounded-full bg-[#128C7E] hover:bg-[#075E54] disabled:opacity-50 text-white flex items-center justify-center shadow transition shrink-0 cursor-pointer"
              >
                {uploadingMedia ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 ml-0.5" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FULLSCREEN LIGHTBOX FOR IMAGES */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 animate-in fade-in duration-200 cursor-zoom-out"
        >
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10 transition"
          >
            <X className="w-6 h-6" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="Perbesar Foto"
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* CONFIRMATION MODAL: HAPUS RIWAYAT CHAT */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4 border border-gray-100">
            <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto shadow-sm">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-base font-bold text-gray-900">
                Hapus Riwayat Chat
              </h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                Pilih opsi penghapusan riwayat untuk percakapan dengan{' '}
                <span className="font-semibold text-gray-800">
                  {currentDisplayName}
                </span>:
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => handleClearHistory('clear_messages')}
                disabled={deletingChat}
                className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs rounded-xl shadow-sm transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
              >
                {deletingChat ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span>Bersihkan Pesan Saja (Kontak Tetap Ada)</span>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleClearHistory('delete_chat')}
                disabled={deletingChat}
                className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white font-semibold text-xs rounded-xl shadow-sm transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
              >
                {deletingChat ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span>Hapus Obrolan Sepenuhnya</span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={deletingChat}
                className="w-full py-2 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs rounded-xl transition cursor-pointer"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
      {/* INSERT LINK MODAL */}
      {showLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-gray-100">
            <div className="bg-[#075E54] text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Link2 className="w-5 h-5 text-emerald-300" />
                <h3 className="font-semibold text-sm">Kirim Tautan / Link</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowLinkModal(false)}
                className="text-white/80 hover:text-white p-1 rounded-full hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleInsertLink} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Alamat URL / Link <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="https://contoh.com/halaman"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  autoFocus
                  required
                  className="w-full px-3.5 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#128C7E] focus:border-transparent transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Keterangan / Teks Pengantar (Opsional)
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Silakan cek panduan di tautan berikut ya:"
                  value={linkTitle}
                  onChange={(e) => setLinkTitle(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#128C7E] focus:border-transparent transition"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLinkModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={!linkUrl.trim()}
                  className="px-4 py-2 text-xs font-semibold bg-[#128C7E] hover:bg-[#075E54] disabled:opacity-50 text-white rounded-xl shadow transition cursor-pointer"
                >
                  Sisipkan Tautan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
