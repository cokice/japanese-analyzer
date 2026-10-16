'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { streamTranslateText, translateText, type EndpointPayload } from '../services/api';
import type { Locale } from '../i18n';
import { sentenceCacheKey, sentenceTranslationCache } from '../utils/sentenceCache';
import { LatestRequest } from '../utils/latestRequest';

export function useSentenceTranslation({ text, endpoint, apiKey, locale, useStream, trigger, analysisSignal }: {
  text: string; endpoint: EndpointPayload; apiKey?: string; locale: Locale;
  useStream: boolean; trigger?: number; analysisSignal?: AbortSignal;
}) {
  const [translation, setTranslation] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const request = useRef(new LatestRequest());
  const key = sentenceCacheKey(text, endpoint, locale, apiKey);

  const translate = useCallback(async (force = false) => {
    const ticket = request.current.start();
    setError(''); setFromCache(false); setIsLoading(false);
    if (!text || !endpoint.model) { setTranslation(''); return; }
    const cached = force ? undefined : sentenceTranslationCache.get(key);
    if (cached !== undefined) { setTranslation(cached); setFromCache(true); return; }
    const signal = analysisSignal && !analysisSignal.aborted
      ? AbortSignal.any([ticket.signal, analysisSignal]) : ticket.signal;
    const isCurrent = () => ticket.isCurrent() && !signal.aborted;
    setIsLoading(true); setTranslation('');
    const save = (value: string) => {
      if (!isCurrent()) return;
      if (!value.trim()) throw new Error('译文为空，请重试。');
      sentenceTranslationCache.set(key, value);
      setTranslation(value);
    };
    try {
      if (useStream) {
        await streamTranslateText(text, (chunk, done) => {
          if (!isCurrent()) return;
          setTranslation(chunk);
          if (done) save(chunk);
        }, e => { if (isCurrent()) setError(e.message); }, apiKey, endpoint, signal);
      } else {
        save(await translateText(text, apiKey, endpoint, signal));
      }
    } catch (e) {
      if (isCurrent()) setError(e instanceof Error ? e.message : '未知错误');
    } finally {
      if (ticket.isCurrent()) setIsLoading(false);
    }
  }, [text, endpoint, apiKey, key, useStream, analysisSignal]);

  useEffect(() => {
    const manager = request.current;
    if (trigger && text) void translate();
    else { manager.cancel(); setTranslation(''); setError(''); setIsLoading(false); setFromCache(false); }
    return () => manager.cancel();
  }, [trigger, text, translate]);

  return { translation, error, isLoading, fromCache, translate };
}
