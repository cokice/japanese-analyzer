'use client';

import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

/** Render outside transformed cards and keep the menu inside the viewport. */
export default function AnchoredPopover({ anchorRef, onClose, children, className, id, role, label }: {
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
  className: string;
  id?: string;
  role?: 'menu' | 'dialog';
  label?: string;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0, maxHeight: 400, width: 280, visibility: 'hidden' as 'hidden' | 'visible' });
  useLayoutEffect(() => {
    const place = () => {
      const anchor = anchorRef.current;
      const menu = menuRef.current;
      if (!anchor || !menu) return;
      const rect = anchor.getBoundingClientRect();
      const viewport = window.visualViewport;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const height = viewport?.height ?? window.innerHeight;
      const width = Math.min(280, (viewport?.width ?? window.innerWidth) - 24);
      const above = rect.top - viewportTop - 20;
      const below = viewportTop + height - rect.bottom - 20;
      const upwards = below < Math.min(menu.scrollHeight, 260) && above > below;
      const maxHeight = Math.min(420, Math.max(80, upwards ? above : below));
      const actualHeight = Math.min(menu.scrollHeight, maxHeight);
      const top = upwards ? rect.top - actualHeight - 8 : rect.bottom + 8;
      setPosition({ top: Math.max(viewportTop + 12, Math.min(top, viewportTop + height - actualHeight - 12)), left: Math.max(viewportLeft + 12, Math.min(rect.left, viewportLeft + (viewport?.width ?? window.innerWidth) - width - 12)), width, maxHeight, visibility: 'visible' });
    };
    const outside = (event: PointerEvent) => {
      if (!anchorRef.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) onClose();
    };
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    place();
    const observer = new ResizeObserver(place);
    if (menuRef.current) observer.observe(menuRef.current);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    window.visualViewport?.addEventListener('resize', place);
    window.visualViewport?.addEventListener('scroll', place);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', keydown);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      window.visualViewport?.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('scroll', place);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', keydown);
    };
  }, [anchorRef, onClose]);
  return createPortal(<div ref={menuRef} id={id} role={role} aria-label={label} className={className}
    style={{ ...position, position: 'fixed', zIndex: 1000, margin: 0, overflowY: 'auto', boxSizing: 'border-box' }}>{children}</div>, document.body);
}
