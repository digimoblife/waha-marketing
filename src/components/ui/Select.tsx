'use client';

import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  /** <option value="x">Label</option> elements (same authoring style as native select) */
  children: React.ReactNode;
  className?: string;
  title?: string;
  disabled?: boolean;
  placeholder?: string;
}

interface ParsedOption {
  value: string;
  label: string;
  disabled: boolean;
}

// Tailwind classes that affect the outer layout box go on the wrapper; the rest style the trigger.
const WRAPPER_CLASS = /^(?:[a-z0-9]+:)*(?:w-|min-w-|max-w-|flex-|shrink|grow|basis-|self-)/;
const STRIP_FROM_TRIGGER = /^(?:[a-z0-9]+:)*(?:px-|pl-|pr-|w-|min-w-|max-w-|flex-|shrink|grow|basis-|self-)/;

function parseOptions(children: React.ReactNode): ParsedOption[] {
  const out: ParsedOption[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    const el = child as React.ReactElement<any>;
    if (el.type === React.Fragment) {
      out.push(...parseOptions(el.props.children));
      return;
    }
    const label = React.Children.toArray(el.props.children).join('');
    out.push({
      value: String(el.props.value ?? label),
      label,
      disabled: Boolean(el.props.disabled),
    });
  });
  return out;
}

export default function Select({
  value,
  onChange,
  children,
  className = '',
  title,
  disabled,
  placeholder = 'Pilih...',
}: SelectProps) {
  const options = useMemo(() => parseOptions(children), [children]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; up: boolean; maxH: number } | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const tokens = className.split(/\s+/).filter(Boolean);
  const wrapperClasses = tokens.filter((t) => WRAPPER_CLASS.test(t)).join(' ');
  const triggerExtra = tokens.filter((t) => !STRIP_FROM_TRIGGER.test(t));
  const isCompact = triggerExtra.some((t) => /^h-(6|7|8)$/.test(t));
  const hasHeight = triggerExtra.some((t) => /^h-/.test(t));
  const hasText = triggerExtra.some((t) => /^text-\[?\d/.test(t) || /^text-(xs|sm|base)$/.test(t));

  const selected = options.find((o) => o.value === value);

  const reposition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const desired = Math.min(260, options.length * 34 + 8);
    const up = spaceBelow < desired && spaceAbove > spaceBelow;
    const maxH = Math.max(120, Math.min(260, up ? spaceAbove : spaceBelow));
    setPos({
      top: up ? rect.top - 4 : rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      up,
      maxH,
    });
  }, [options.length]);

  useLayoutEffect(() => {
    if (open) reposition();
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => reposition();
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, reposition]);

  // Keep keyboard-highlighted option visible
  useEffect(() => {
    if (!open || activeIdx < 0) return;
    menuRef.current
      ?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIdx]);

  const openMenu = () => {
    if (disabled) return;
    setActiveIdx(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };

  const choose = (opt: ParsedOption) => {
    if (opt.disabled) return;
    setOpen(false);
    triggerRef.current?.focus();
    if (opt.value !== value) onChange(opt.value);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (options[activeIdx]) choose(options[activeIdx]);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  const triggerClasses = [
    'w-full flex items-center justify-between gap-2 text-left rounded-md border bg-white',
    'transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00688E]/25',
    open ? 'border-[#00688E]' : 'border-[#B0C4CF] hover:border-[#809AA8]',
    isCompact ? 'px-2.5' : 'px-3',
    hasHeight ? '' : 'h-9',
    hasText ? '' : 'text-[12.5px]',
    disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
    triggerExtra.filter((t) => !/^(border|bg-white|focus:)/.test(t)).join(' '),
  ].join(' ');

  return (
    <div className={`relative min-w-0 ${wrapperClasses}`}>
      <button
        ref={triggerRef}
        type="button"
        title={title}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        className={triggerClasses}
      >
        <span className={`truncate ${selected ? 'text-[#0F232E]' : 'text-[#809AA8]'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 text-[#5C7685] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open &&
        pos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            style={{
              position: 'fixed',
              left: pos.left,
              minWidth: pos.width,
              maxHeight: pos.maxH,
              ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }),
            }}
            className="z-[90] overflow-y-auto bg-white border border-[#B0C4CF] rounded-lg shadow-xl py-1 w-max max-w-[min(360px,calc(100vw-16px))]"
          >
            {options.length === 0 ? (
              <div className="px-3 py-2 text-xs text-[#809AA8]">Tidak ada pilihan</div>
            ) : (
              options.map((opt, idx) => {
                const isSelected = opt.value === value;
                const isActive = idx === activeIdx;
                return (
                  <button
                    key={`${opt.value}-${idx}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    data-idx={idx}
                    disabled={opt.disabled}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => choose(opt)}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-1.5 text-left text-[12.5px] transition ${
                      opt.disabled
                        ? 'text-[#809AA8] cursor-not-allowed'
                        : isActive
                        ? 'bg-[#ECF6FA] text-[#0F232E] cursor-pointer'
                        : 'text-[#0F232E] cursor-pointer'
                    } ${isSelected ? 'font-semibold' : ''}`}
                  >
                    <span className="truncate">{opt.label}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-[#00688E]" />}
                  </button>
                );
              })
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
