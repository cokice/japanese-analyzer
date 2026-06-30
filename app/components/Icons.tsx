// 新设计内联描边图标
import React from 'react';

interface IconWrapProps {
  children: React.ReactNode;
  w?: number;
  sw?: number;
  fill?: string;
}

export const I = ({ children, w = 18, sw = 1.7, fill = 'none' }: IconWrapProps) => (
  <svg
    width={w}
    height={w}
    viewBox="0 0 24 24"
    fill={fill}
    stroke="currentColor"
    strokeWidth={sw}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const Icon = {
  camera: <I><path d="M4 8h3l1.5-2h7L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></I>,
  mic: <I><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></I>,
  chev: <I w={14}><path d="M6 9l6 6 6-6" /></I>,
  x: <I><path d="M6 6l12 12M18 6L6 18" /></I>,
  xSm: <I w={16}><path d="M6 6l12 12M18 6L6 18" /></I>,
  search: <I><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></I>,
  book: <I><path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2zM4 19a2 2 0 0 1 2-2h12" /></I>,
  translate: <I><path d="M4 5h7" /><path d="M8 3v2" /><path d="M5 9c1.6 3.3 4.4 5.7 8 7" /><path d="M12 9c-.8 1.8-2.2 3.4-4.2 4.9" /><path d="M14 21l1.1-3M21 21l-1.1-3M15.7 16h3.6M16.9 12h1.2L22 21" /></I>,
  globe: <I><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18" /><path d="M12 3a14 14 0 0 0 0 18" /></I>,
  moon: <I><path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z" /></I>,
  sun: <I><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" /></I>,
  desktop: <I><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></I>,
  gear: <I><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></I>,
  refresh: <I><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M6.1 9a7 7 0 0 1 11.3-2.6L20 9" /><path d="M17.9 15a7 7 0 0 1-11.3 2.6L4 15" /></I>,
  speaker: <I><path d="M11 5 6 9H3v6h3l5 4z" /><path d="M16 8.5a4 4 0 0 1 0 7M19 5.5a8 8 0 0 1 0 13" /></I>,
  copy: <I><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></I>,
  bookmark: <I><path d="M6 4h12v17l-6-4-6 4z" /></I>,
  chat: <I w={22}><path d="M21 12a8 8 0 0 1-12 7l-5 1 1-4.5A8 8 0 1 1 21 12z" /></I>,
  send: <I><path d="M22 2 11 13" /><path d="m22 2-7 20-4-9-9-4z" /></I>,
  expand: <I><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5" /><path d="M3 3l6 6M21 3l-6 6M21 21l-6-6M3 21l6-6" /></I>,
  compress: <I><path d="M9 3v6H3M15 3v6h6M15 21v-6h6M9 21v-6H3" /><path d="M3 9l6-6M21 9l-6-6M21 15l-6 6M3 15l6 6" /></I>,
  bulb: <I><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .8 1.6V17h5.4v-1.5c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3z" /></I>,
  lock: <I><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></I>,
  eye: <I><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></I>,
  eyeOff: <I><path d="M3 3l18 18" /><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" /><path d="M9.9 4.2A10.8 10.8 0 0 1 12 4c6.5 0 10 8 10 8a17.4 17.4 0 0 1-3.1 4.2" /><path d="M6.6 6.6C3.7 8.6 2 12 2 12s3.5 8 10 8a10.8 10.8 0 0 0 5.4-1.4" /></I>,
  check: <I><path d="M20 6 9 17l-5-5" /></I>,
  github: <I fill="currentColor" sw={0}><path d="M12 1.95c-5.55 0-10 4.45-10 10 0 4.45 2.85 8.2 6.85 9.5.5.1.65-.2.65-.45v-1.7c-2.8.6-3.35-1.35-3.35-1.35-.45-1.15-1.1-1.45-1.1-1.45-.9-.6.05-.6.05-.6 1 .05 1.55 1.05 1.55 1.05.9 1.5 2.35 1.05 2.9.8.1-.65.35-1.05.65-1.3-2.25-.25-4.6-1.1-4.6-4.95 0-1.1.4-2 1.05-2.7-.1-.25-.45-1.3.1-2.65 0 0 .85-.25 2.75 1.05.8-.2 1.65-.35 2.5-.35s1.7.1 2.5.35c1.9-1.3 2.75-1.05 2.75-1.05.55 1.35.2 2.4.1 2.65.65.7 1.05 1.6 1.05 2.7 0 3.85-2.35 4.7-4.6 4.95.35.3.7.9.7 1.85v2.75c0 .25.15.6.65.45 4-1.3 6.85-5.05 6.85-9.5 0-5.55-4.45-10-10-10z" /></I>,
  cameraLg: <I w={22}><path d="M4 8h3l1.5-2h7L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></I>,
  speakerLg: <I w={22}><path d="M11 5 6 9H3v6h3l5 4z" /><path d="M16 8.5a4 4 0 0 1 0 7M19 5.5a8 8 0 0 1 0 13" /></I>,
};
