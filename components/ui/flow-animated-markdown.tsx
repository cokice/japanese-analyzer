'use client';

import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';

interface FlowAnimatedMarkdownProps {
  content: string;
  sep?: 'word' | 'char' | 'diff';
  animation?: string | null;
  animationDuration?: string;
  animationTimingFunction?: string;
}

const AnimatedMarkdown = dynamic<FlowAnimatedMarkdownProps>(
  () => import('flowtoken').then((mod) => mod.AnimatedMarkdown as ComponentType<FlowAnimatedMarkdownProps>),
  { ssr: false }
);

export function FlowAnimatedMarkdown(props: FlowAnimatedMarkdownProps) {
  return <AnimatedMarkdown {...props} />;
}
