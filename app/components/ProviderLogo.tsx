'use client';

import type { ProviderProfile } from '../services/api';
import { PROVIDER_ICONS } from '../lib/providerIcons';

interface ProviderLogoProps {
  profile: Pick<ProviderProfile, 'id' | 'name'> | null;
  className?: string;
}

function letterOf(name: string): string {
  const trimmed = (name || '').trim();
  return trimmed ? trimmed[0].toUpperCase() : '?';
}

export function ProviderLogo({ profile, className = 'h-4 w-4' }: ProviderLogoProps) {
  const brand = profile?.id;
  const src = brand ? PROVIDER_ICONS[brand] : undefined;

  if (src) {
    return (
      <img
        src={src}
        alt=""
        aria-hidden="true"
        className={`${className} shrink-0 rounded-full bg-white object-contain p-[2px] ring-1 ring-black/10`}
      />
    );
  }

  if (!profile) {
    return (
      <span
        className={`${className} grid shrink-0 place-items-center rounded-full text-[9px] font-semibold`}
        style={{ background: 'var(--line-2)', color: 'var(--ink-3)' }}
        aria-hidden="true"
      >
        ?
      </span>
    );
  }

  return (
    <span
      className={`${className} grid shrink-0 place-items-center rounded-full text-[9px] font-semibold`}
      style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
      aria-hidden="true"
    >
      {letterOf(profile.name)}
    </span>
  );
}
