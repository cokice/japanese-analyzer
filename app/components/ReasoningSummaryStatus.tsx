'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

interface ReasoningSummaryStatusProps {
  text: string;
  done: boolean;
}

export default function ReasoningSummaryStatus({ text, done }: ReasoningSummaryStatusProps) {
  const reduceMotion = useReducedMotion();

  if (!text) return null;

  return (
    <span
      className="reasoning-summary-viewport"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      title={text}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={text}
          className={`reasoning-summary-copy${done ? '' : ' is-thinking'}`}
          initial={reduceMotion ? false : { opacity: 0, filter: 'blur(6px)' }}
          animate={{ opacity: 1, filter: 'blur(0px)' }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: 'blur(6px)' }}
          transition={reduceMotion
            ? { duration: 0 }
            : { duration: 0.45, ease: 'easeInOut' }}
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
