'use client';

import React, { useState } from 'react';

const EMOJI_SETS: Record<string, string[]> = {
  sering: ['👋', '🙏', '😊', '✅', '🔥', '🎉', '📦', '🏪', '👍', '💬', '⏰', '📄', '🚀', '✨', '💯', '🙌'],
  salam: ['👋', '🙏', '🤝', '👍', '👏', '🙌', '💪', '🫡', '🫶', '✌️', '👌', '☝️', '💁', '🙋', '🌟', '☀️'],
  promo: ['🔥', '🎉', '🎁', '🏷️', '💸', '💰', '🛒', '🛍️', '📦', '🚚', '⚡', '⭐', '🏆', '📣', '📌', '✅'],
  ekspresi: ['😊', '😄', '😁', '😉', '😍', '🤩', '😅', '🙂', '😌', '🤔', '😮', '❤️', '💚', '👌', '✨', '🙏'],
};

const TABS = [
  { key: 'sering', label: 'Sering' },
  { key: 'salam', label: 'Salam' },
  { key: 'promo', label: 'Promo' },
  { key: 'ekspresi', label: 'Ekspresi' },
];

export default function EmojiPickerPopover({
  onSelect,
}: {
  onSelect: (emoji: string) => void;
}) {
  const [tab, setTab] = useState('sering');

  return (
    <div className="absolute bottom-[calc(100%+6px)] left-3 md:left-4 w-[290px] max-w-[calc(100%-24px)] bg-white border border-[#B0C4CF] rounded-lg shadow-xl p-2 z-30">
      <div className="flex gap-1 border-b border-[#E8EFF3] pb-1.5 mb-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-2 py-1 rounded text-[11px] font-semibold transition cursor-pointer ${
              tab === t.key
                ? 'bg-[#E8EFF3] text-[#0F232E]'
                : 'text-[#5C7685] hover:text-[#0F232E]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-8 gap-0.5 max-h-[168px] overflow-y-auto">
        {EMOJI_SETS[tab].map((emoji, idx) => (
          <button
            key={`${tab}-${idx}`}
            type="button"
            onClick={() => onSelect(emoji)}
            className="h-8 rounded hover:bg-[#ECF6FA] text-[17px] flex items-center justify-center transition cursor-pointer"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
