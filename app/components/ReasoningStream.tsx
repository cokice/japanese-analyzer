'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ReasoningTextStore } from '../utils/reasoningTextStore';
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
  const tailText = store.getTail();
  const lineCount = virtualLines.length;

  const rowVirtualizer = useVirtualizer({
    count: expanded ? lineCount : 0,
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
    if (!expanded || lineCount === 0) return;

    const frame = window.requestAnimationFrame(() => {
      if (followTailRef.current) {
        rowVirtualizer.scrollToIndex(lineCount - 1, { align: 'end' });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [expanded, lineCount, revision, rowVirtualizer]);

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

  const reviewMode = done && expanded;
  const doneText = `${completionLabel}（用时 ${elapsedSeconds} 秒）`;
  const virtualItems = rowVirtualizer.getVirtualItems();

  return (
    <section className="reasoning-stream-card" data-testid="reasoning-stream">
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
            <div id="deepseek-reasoning-content" className="reasoning-stream-expanded-content">
              {done && summaryHistory.length > 0 && (
                <ol className="reasoning-summary-history" aria-label="完整思考摘要历史">
                  {summaryHistory.map((historyItem, index) => (
                    <li key={`${index}-${historyItem}`} className="reasoning-summary-history-item">
                      <span className="reasoning-summary-history-check" aria-hidden="true">✓</span>
                      <span>{historyItem}</span>
                    </li>
                  ))}
                </ol>
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
                    const isLastLine = virtualItem.index === lineCount - 1;
                    return (
                      <div
                        key={virtualItem.key}
                        ref={rowVirtualizer.measureElement}
                        data-index={virtualItem.index}
                        className={`reasoning-stream-virtual-row${!done && isLastLine ? ' is-streaming' : ''}`}
                        style={{ transform: `translateY(${virtualItem.start}px)` }}
                      >
                        {virtualLines[virtualItem.index]}
                      </div>
                    );
                  })}
                </div>
              </div>
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
