'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ReasoningTextStore } from '../utils/reasoningTextStore';
import { formatCompletedReasoningSummaries } from '../utils/reasoningSummary';
import ReasoningSummaryStatus from './ReasoningSummaryStatus';

interface ReasoningStreamProps {
  store: ReasoningTextStore;
  done: boolean;
  summaryHistory: readonly string[];
  completionLabel?: string;
}

const SCROLL_BOTTOM_THRESHOLD = 8;
const VIRTUAL_ROW_ESTIMATE_PX = 42;
const VIRTUAL_OVERSCAN = 6;

export default function ReasoningStream({
  store,
  done,
  summaryHistory,
  completionLabel = '已深度思考',
}: ReasoningStreamProps) {
  const revision = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot
  );
  const [expanded, setExpanded] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(1);
  const scrollWindowRef = useRef<HTMLDivElement>(null);
  const followTailRef = useRef(true);
  const startedAtRef = useRef<number | null>(null);
  const previousDoneRef = useRef(done);
  const virtualLines = store.getVirtualLines();
  const reviewBlocks = done ? store.getReviewBlocks() : [];
  const tailText = store.getTail();
  const reviewMode = done && expanded;
  const rowCount = reviewMode ? reviewBlocks.length : virtualLines.length;
  const archivedSummaries = done
    ? formatCompletedReasoningSummaries(summaryHistory)
    : [];

  const rowVirtualizer = useVirtualizer({
    count: expanded ? rowCount : 0,
    getScrollElement: () => scrollWindowRef.current,
    estimateSize: () => VIRTUAL_ROW_ESTIMATE_PX,
    overscan: VIRTUAL_OVERSCAN,
    useFlushSync: false,
  });

  useEffect(() => {
    if (!done) {
      if (previousDoneRef.current || startedAtRef.current === null) {
        startedAtRef.current = performance.now();
        followTailRef.current = true;
        setExpanded(false);
      }
    } else if (!previousDoneRef.current) {
      const startedAt = startedAtRef.current ?? performance.now();
      setElapsedSeconds(Math.max(1, Math.ceil((performance.now() - startedAt) / 1000)));
      setExpanded(false);
    }

    previousDoneRef.current = done;
  }, [done]);

  useEffect(() => {
    if (done) return;

    const updateElapsedTime = () => {
      const startedAt = startedAtRef.current ?? performance.now();
      startedAtRef.current = startedAt;
      setElapsedSeconds(Math.floor((performance.now() - startedAt) / 1000));
    };

    updateElapsedTime();
    const timer = window.setInterval(updateElapsedTime, 1000);
    return () => window.clearInterval(timer);
  }, [done]);

  useEffect(() => {
    if (!expanded) return;

    rowVirtualizer.measure();
  }, [expanded, rowVirtualizer]);

  useEffect(() => {
    if (!expanded || rowCount === 0) return;

    const frame = window.requestAnimationFrame(() => {
      if (followTailRef.current) {
        rowVirtualizer.scrollToIndex(rowCount - 1, { align: 'end' });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [expanded, rowCount, revision, rowVirtualizer]);

  const handleToggle = () => {
    setExpanded((current) => {
      if (!current) followTailRef.current = true;
      return !current;
    });
  };

  const handleScroll = () => {
    const scrollWindow = scrollWindowRef.current;
    if (!scrollWindow) return;

    const distanceFromBottom = scrollWindow.scrollHeight
      - scrollWindow.scrollTop
      - scrollWindow.clientHeight;
    followTailRef.current = distanceFromBottom < SCROLL_BOTTOM_THRESHOLD;
  };

  const doneText = `${completionLabel}（用时 ${elapsedSeconds} 秒）`;
  const virtualItems = rowVirtualizer.getVirtualItems();

  return (
    <section
      className={`reasoning-stream-card${reviewMode ? ' is-review-expanded' : ''}`}
      data-testid="reasoning-stream"
      lang="zh-CN"
    >
      <button
        type="button"
        className="reasoning-stream-header"
        aria-expanded={expanded}
        aria-controls="deepseek-reasoning-content"
        onClick={handleToggle}
      >
        <div className="reasoning-stream-title">
          <ReasoningSummaryStatus
            summaries={summaryHistory}
            done={done}
            doneText={doneText}
          />
        </div>
        {!done && (
          <span
            className="reasoning-stream-elapsed"
            aria-label={`已思考 ${elapsedSeconds} 秒`}
          >
            {elapsedSeconds} 秒
          </span>
        )}
        <svg
          className={`reasoning-stream-chevron${expanded ? ' is-expanded' : ''}`}
          viewBox="0 0 16 16"
          aria-hidden="true"
        >
          <path d="m4 6 4 4 4-4" />
        </svg>
      </button>

      <div
        className={`reasoning-stream-collapse${expanded ? ' is-expanded' : ''}`}
        aria-hidden={!expanded}
      >
        <div className="reasoning-stream-collapse-inner">
          {expanded ? (
            <div
              id="deepseek-reasoning-content"
              className={`reasoning-stream-expanded-content${archivedSummaries.length > 0 ? ' has-summary-history' : ''}`}
            >
              {done && archivedSummaries.length > 0 && (
                <section className="reasoning-archive-section reasoning-archive-summary">
                  <h3 className="reasoning-archive-heading">思考摘要</h3>
                  <ol className="reasoning-summary-history" aria-label="完整思考摘要历史">
                    {archivedSummaries.map((historyItem, index) => (
                      <li key={`${index}-${historyItem}`} className="reasoning-summary-history-item">
                        <span className="reasoning-summary-history-check" aria-hidden="true">✓</span>
                        <span>{historyItem}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
              <section className={`reasoning-archive-section reasoning-archive-process${reviewMode ? ' is-review' : ''}`}>
                {reviewMode && (
                  <h3 className="reasoning-archive-heading">完整思考过程</h3>
                )}
                <div
                  ref={scrollWindowRef}
                  lang="zh-CN"
                  className={`reasoning-stream-window${reviewMode ? ' is-review' : ''}`}
                  onScroll={handleScroll}
                >
                  <div
                    className="reasoning-stream-virtual-space"
                    style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
                  >
                    {virtualItems.map((virtualItem) => {
                      const isLastRow = virtualItem.index === rowCount - 1;
                      const reviewBlock = reviewMode
                        ? reviewBlocks[virtualItem.index]
                        : null;
                      const rowText = reviewBlock?.text ?? virtualLines[virtualItem.index];
                      const rowClassName = [
                        'reasoning-stream-virtual-row',
                        !done && isLastRow ? 'is-streaming' : '',
                        reviewBlock?.paragraphEnd && !isLastRow ? 'is-paragraph-end' : '',
                      ].filter(Boolean).join(' ');

                      return (
                        <div
                          key={virtualItem.key}
                          ref={rowVirtualizer.measureElement}
                          data-index={virtualItem.index}
                          className={rowClassName}
                          style={{ transform: `translateY(${virtualItem.start}px)` }}
                        >
                          {rowText}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            </div>
          ) : (
            <div
              id="deepseek-reasoning-content"
              lang="zh-CN"
              className={`reasoning-stream-window reasoning-stream-tail${!done ? ' is-streaming' : ''}`}
            >
              {tailText}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
