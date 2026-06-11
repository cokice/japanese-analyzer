'use client';

import {
  StreamdownTextPrimitive,
  type BundledTheme,
  type StreamdownTextPrimitiveProps,
} from '@assistant-ui/react-streamdown';
import { code } from '@streamdown/code';

const SHIKI_THEME: [BundledTheme, BundledTheme] = ['github-light', 'github-dark'];

type MarkdownTextProps = Omit<
  StreamdownTextPrimitiveProps,
  'animated' | 'plugins' | 'shikiTheme'
>;

export function MarkdownText({
  className,
  containerClassName,
  mode = 'streaming',
  ...props
}: MarkdownTextProps) {
  const resolvedClassName = ['streamdown-content', className].filter(Boolean).join(' ');
  const resolvedContainerClassName = ['streamdown-container', containerClassName]
    .filter(Boolean)
    .join(' ');

  return (
    <StreamdownTextPrimitive
      {...props}
      mode={mode}
      animated
      plugins={{ code }}
      shikiTheme={SHIKI_THEME}
      className={resolvedClassName}
      containerClassName={resolvedContainerClassName}
    />
  );
}
