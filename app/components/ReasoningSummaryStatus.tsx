'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

interface ReasoningSummaryStatusProps {
  summaries: readonly string[];
  done: boolean;
  doneText: string;
}

const VISIBLE_SUMMARY_COUNT = 3;

export default function ReasoningSummaryStatus({
  summaries,
  done,
  doneText,
}: ReasoningSummaryStatusProps) {
  const reduceMotion = useReducedMotion();
  const displaySummaries = summaries.length > 0 ? summaries : ['正在分析…'];
  const visibleSummaries = displaySummaries.slice(-VISIBLE_SUMMARY_COUNT);
  const currentSummary = visibleSummaries.at(-1) ?? '正在分析…';

  return (
    <div
      className={`reasoning-summary-viewport${done ? ' is-done' : ''}`}
      role="status"
      aria-live="polite"
      aria-atomic="false"
      title={done ? doneText : currentSummary}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {done ? (
          <motion.span
            key="reasoning-complete"
            className="reasoning-summary-done"
            initial={reduceMotion ? false : { opacity: 0, filter: 'blur(6px)' }}
            animate={{ opacity: 1, filter: 'blur(0px)' }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: 'blur(6px)' }}
            transition={reduceMotion
              ? { duration: 0 }
              : { duration: 0.45, ease: 'easeInOut' }}
          >
            {doneText}
          </motion.span>
        ) : (
          <motion.div
            key="reasoning-summary-stack"
            className="reasoning-summary-stack"
            initial={false}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: 'blur(6px)' }}
          >
            <AnimatePresence initial={false} mode="popLayout">
              {visibleSummaries.map((summary, index) => {
                const isCurrent = index === visibleSummaries.length - 1;
                return (
                  <motion.div
                    layout="position"
                    key={summary}
                    className={`reasoning-summary-entry${isCurrent ? ' is-current' : ' is-previous'}`}
                    aria-hidden={!isCurrent}
                    initial={false}
                    animate={{ opacity: 1, filter: 'blur(0px)' }}
                    exit={reduceMotion
                      ? { opacity: 0 }
                      : { opacity: 0, filter: 'blur(6px)', y: -10 }}
                    transition={reduceMotion
                      ? { duration: 0 }
                      : { duration: 0.3, ease: 'easeOut', layout: { duration: 0.3, ease: 'easeOut' } }}
                  >
                    <motion.div
                      className="reasoning-summary-entry-visual"
                      initial={reduceMotion ? false : { y: 7 }}
                      animate={{
                        y: isCurrent && visibleSummaries.length > 1 ? 6 : 0,
                      }}
                      transition={reduceMotion
                        ? { duration: 0 }
                        : { duration: 0.3, ease: 'easeOut' }}
                    >
                      <span className="reasoning-summary-icon-slot" aria-hidden="true">
                        <AnimatePresence initial={false} mode="popLayout">
                          {isCurrent ? (
                            <motion.span
                              key="loader"
                              className="reasoning-summary-current-indicator"
                              initial={reduceMotion ? false : { opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={reduceMotion
                                ? { duration: 0 }
                                : { duration: 0.3, ease: 'easeOut' }}
                            />
                          ) : (
                            <motion.span
                              key="check"
                              className="reasoning-summary-check"
                              initial={reduceMotion ? false : { opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={reduceMotion
                                ? { duration: 0 }
                                : { duration: 0.3, ease: 'easeOut' }}
                            >
                              ✓
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </span>
                      <motion.span
                        className="reasoning-summary-copy-motion"
                        initial={reduceMotion
                          ? false
                          : { opacity: 0, filter: 'blur(6px)', scale: 1 }}
                        animate={{
                          opacity: isCurrent ? 1 : 0.78,
                          filter: 'blur(0px)',
                          scale: isCurrent ? 1 : 0.86,
                        }}
                        transition={reduceMotion
                          ? { duration: 0 }
                          : { duration: 0.3, ease: 'easeOut' }}
                      >
                        <span className={`reasoning-summary-copy${isCurrent ? ' is-thinking' : ''}`}>
                          {summary}
                        </span>
                      </motion.span>
                    </motion.div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
