'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type TransitionEvent,
} from 'react';
import { stripReasoningBoldMarkdown } from '../utils/markdown';
import ReasoningSummaryStatus from './ReasoningSummaryStatus';

interface ReasoningStreamProps {
  text: string;
  done: boolean;
  summary?: string;
}

interface CoolingCharacter {
  id: number;
  value: string;
}

interface RenderState {
  cooledText: string;
  activeCharacters: CoolingCharacter[];
}

const SCROLL_BOTTOM_THRESHOLD = 8;
const COMPACTION_BATCH_MS = 80;

export default function ReasoningStream({ text, done, summary = '' }: ReasoningStreamProps) {
  const cleanText = useMemo(() => stripReasoningBoldMarkdown(text), [text]);
  const [expanded, setExpanded] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(1);
  const [renderState, setRenderState] = useState<RenderState>({
    cooledText: '',
    activeCharacters: [],
  });
  const nextCharacterIdRef = useRef(0);
  const processedTextRef = useRef('');
  const pendingCoolingIdsRef = useRef(new Set<number>());
  const settledIdsRef = useRef(new Set<number>());
  const characterElementsRef = useRef(new Map<number, HTMLSpanElement>());
  const firstFrameRef = useRef<number | null>(null);
  const coolingFrameRef = useRef<number | null>(null);
  const compactTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollWindowRef = useRef<HTMLDivElement>(null);
  const followTailRef = useRef(true);
  const startedAtRef = useRef<number | null>(null);
  const previousDoneRef = useRef(done);

  const scheduleCooling = useCallback((ids: number[]) => {
    ids.forEach((id) => pendingCoolingIdsRef.current.add(id));

    const requestCoolingBatch = () => {
      if (
        firstFrameRef.current !== null
        || coolingFrameRef.current !== null
        || pendingCoolingIdsRef.current.size === 0
      ) {
        return;
      }

      firstFrameRef.current = window.requestAnimationFrame(() => {
        firstFrameRef.current = null;
        const idsReadyToCool = Array.from(pendingCoolingIdsRef.current);
        pendingCoolingIdsRef.current.clear();

        coolingFrameRef.current = window.requestAnimationFrame(() => {
          coolingFrameRef.current = null;
          idsReadyToCool.forEach((id) => {
            characterElementsRef.current.get(id)?.classList.add('is-cooling');
          });
          requestCoolingBatch();
        });
      });
    };

    requestCoolingBatch();
  }, []);

  useEffect(() => {
    const previousText = processedTextRef.current;
    if (cleanText === previousText) return;

    const appending = cleanText.startsWith(previousText);
    const addedText = appending ? cleanText.slice(previousText.length) : cleanText;
    const addedCharacters = Array.from(addedText, (value) => ({
      id: nextCharacterIdRef.current++,
      value,
    }));

    processedTextRef.current = cleanText;
    if (!appending) {
      settledIdsRef.current.clear();
      pendingCoolingIdsRef.current.clear();
      setRenderState({ cooledText: '', activeCharacters: addedCharacters });
    } else if (addedCharacters.length > 0) {
      setRenderState((current) => ({
        ...current,
        activeCharacters: [...current.activeCharacters, ...addedCharacters],
      }));
    }

    if (addedCharacters.length > 0) {
      scheduleCooling(addedCharacters.map((character) => character.id));
    }
  }, [cleanText, scheduleCooling]);

  useEffect(() => {
    if (!done) {
      if (previousDoneRef.current || startedAtRef.current === null) {
        startedAtRef.current = performance.now();
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
    if (!done) return;

    pendingCoolingIdsRef.current.clear();
    settledIdsRef.current.clear();
    if (compactTimerRef.current) {
      clearTimeout(compactTimerRef.current);
      compactTimerRef.current = null;
    }
    setRenderState((current) => (
      current.cooledText === cleanText && current.activeCharacters.length === 0
        ? current
        : { cooledText: cleanText, activeCharacters: [] }
    ));
  }, [cleanText, done]);

  useLayoutEffect(() => {
    if (!expanded || !followTailRef.current) return;
    const scrollWindow = scrollWindowRef.current;
    if (scrollWindow) {
      scrollWindow.scrollTop = scrollWindow.scrollHeight;
    }
  }, [expanded, renderState.activeCharacters.length, renderState.cooledText]);

  useEffect(() => () => {
    if (firstFrameRef.current !== null) window.cancelAnimationFrame(firstFrameRef.current);
    if (coolingFrameRef.current !== null) window.cancelAnimationFrame(coolingFrameRef.current);
    if (compactTimerRef.current) clearTimeout(compactTimerRef.current);
  }, []);

  const compactSettledCharacters = useCallback(() => {
    if (compactTimerRef.current) return;

    compactTimerRef.current = setTimeout(() => {
      compactTimerRef.current = null;
      setRenderState((current) => {
        let settledPrefixLength = 0;
        while (
          settledPrefixLength < current.activeCharacters.length
          && settledIdsRef.current.has(current.activeCharacters[settledPrefixLength].id)
        ) {
          settledPrefixLength += 1;
        }

        if (settledPrefixLength === 0) return current;

        const settledPrefix = current.activeCharacters.slice(0, settledPrefixLength);
        settledPrefix.forEach((character) => settledIdsRef.current.delete(character.id));

        return {
          cooledText: current.cooledText + settledPrefix.map((character) => character.value).join(''),
          activeCharacters: current.activeCharacters.slice(settledPrefixLength),
        };
      });
    }, COMPACTION_BATCH_MS);
  }, []);

  const handleCharacterTransitionEnd = (
    event: TransitionEvent<HTMLSpanElement>,
    characterId: number
  ) => {
    if (event.propertyName !== 'color') return;
    settledIdsRef.current.add(characterId);
    compactSettledCharacters();
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
  const title = summary || (done ? '思考完成' : '正在分析…');

  return (
    <section className="reasoning-stream-card" data-testid="reasoning-stream">
      <button
        type="button"
        className="reasoning-stream-header"
        aria-expanded={expanded}
        aria-controls="deepseek-reasoning-content"
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="reasoning-stream-title">
          <ReasoningSummaryStatus text={title} done={done} />
        </span>
        <span className="reasoning-stream-elapsed" aria-label={done ? `用时 ${elapsedSeconds} 秒` : `已思考 ${elapsedSeconds} 秒`}>
          {done ? `用时 ${elapsedSeconds} 秒` : `${elapsedSeconds} 秒`}
        </span>
        <svg
          className={`reasoning-stream-chevron${expanded ? ' is-expanded' : ''}`}
          viewBox="0 0 16 16"
          aria-hidden="true"
        >
          <path d="m4 6 4 4 4-4" />
        </svg>
      </button>

      {expanded && (
        <div
          id="deepseek-reasoning-content"
          ref={scrollWindowRef}
          lang="zh-CN"
          className={`reasoning-stream-window${reviewMode ? ' is-review' : ''}`}
          onScroll={handleScroll}
        >
          <div className="reasoning-stream-copy">
            {renderState.cooledText}
            {renderState.activeCharacters.map((character) => (
              <span
                key={character.id}
                ref={(element) => {
                  if (element) {
                    characterElementsRef.current.set(character.id, element);
                  } else {
                    characterElementsRef.current.delete(character.id);
                  }
                }}
                className="reasoning-stream-char"
                onTransitionEnd={(event) => handleCharacterTransitionEnd(event, character.id)}
              >
                {character.value}
              </span>
            ))}
            {!done && <span className="reasoning-stream-cursor" aria-hidden="true" />}
          </div>
        </div>
      )}
    </section>
  );
}
