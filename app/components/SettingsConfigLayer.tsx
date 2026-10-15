'use client';

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Keep nested editors outside the animated, scrollable settings container. */
export default function SettingsConfigLayer({ children }: { children: ReactNode }) {
  useEffect(() => {
    const containers = [document.body, ...document.querySelectorAll<HTMLElement>('.settings-modal-content')];
    const previous = containers.map((element) => element.style.overflow);
    containers.forEach((element) => { element.style.overflow = 'hidden'; });
    return () => containers.forEach((element, index) => { element.style.overflow = previous[index]; });
  }, []);
  return createPortal(children, document.body);
}
