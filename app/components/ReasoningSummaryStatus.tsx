'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import AtomIcon from './AtomIcon';
import { INITIAL_REASONING_SUMMARY } from '../utils/reasoningSummary';

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
  const substantiveSummaries = summaries.filter(
    (summary) => summary.trim() !== INITIAL_REASONING_SUMMARY
  );
  const displaySummaries = substantiveSummaries.length > 0
    ? substantiveSummaries
    : [INITIAL_REASONING_SUMMARY];
  const visibleSummaries = displaySummaries.slice(-VISIBLE_SUMMARY_COUNT);
  const currentSummary = visibleSummaries.at(-1) ?? INITIAL_REASONING_SUMMARY;

  return (
    <div
      className={`reasoning-summary-viewport${done ? ' is-done' : ''}`}
      role="status"
      aria-live="polite"
      aria-atomic="false"
      title={done ? doneText : currentSummary}
    >
      {done ? (
        <span className="reasoning-state-icon is-finishing" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <circle className="reasoning-state-ring" cx="12" cy="12" r="9" />
            <path className="reasoning-state-tick" d="M7.5 12.4 L10.8 15.6 L16.5 9.2" />
          </svg>
        </span>
      ) : (
        <AtomIcon state="busy" size={15} className="reasoning-state-atom" />
      )}

      <div className="reasoning-summary-state-copy">
        <motion.div
          className="reasoning-summary-stack"
          aria-hidden={done}
          initial={false}
        >
          {substantiveSummaries.length === 0 ? (
            <div className="reasoning-summary-entry is-current">
              <span className="reasoning-summary-icon-slot" aria-hidden="true">
                <span className="reasoning-summary-current-dot" />
              </span>
              <span className="reasoning-summary-copy-motion">
                <span className="reasoning-summary-copy is-thinking">
                  {INITIAL_REASONING_SUMMARY}
                </span>
              </span>
            </div>
          ) : (
            <AnimatePresence initial={false} mode="popLayout">
              {visibleSummaries.map((summary, index) => {
                const isCurrent = index === visibleSummaries.length - 1;
                return (
                  <motion.div
                    layout="position"
                    key={summary}
                    className={`reasoning-summary-entry${isCurrent ? ' is-current' : ' is-previous'}`}
                    aria-hidden={!isCurrent}
                    initial={reduceMotion ? false : { opacity: 0, filter: 'blur(5px)' }}
                    animate={{ opacity: 1, filter: 'blur(0px)' }}
                    exit={reduceMotion
                      ? { opacity: 0 }
                      : { opacity: 0, filter: 'blur(5px)', y: -8 }}
                    transition={reduceMotion
                      ? { duration: 0 }
                      : { duration: 0.4, ease: 'easeOut', layout: { duration: 0.3, ease: 'easeOut' } }}
                  >
                    <span className="reasoning-summary-icon-slot" aria-hidden="true">
                      {isCurrent ? (
                        <span className="reasoning-summary-current-dot" />
                      ) : (
                        <svg className="reasoning-summary-mini-tick" viewBox="0 0 24 24">
                          <path d="M7.5 12.4 L10.8 15.6 L16.5 9.2" />
                        </svg>
                      )}
                    </span>
                    <motion.span
                      className="reasoning-summary-copy-motion"
                      animate={{
                        opacity: isCurrent ? 1 : 0.72,
                        scale: isCurrent ? 1 : 0.88,
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
                );
              })}
            </AnimatePresence>
          )}
        </motion.div>

        <span className="reasoning-summary-done" aria-hidden={!done}>
          {doneText}
        </span>
      </div>
    </div>
  );
}
