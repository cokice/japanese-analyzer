'use client';

import { useLanguage } from "../contexts/LanguageContext";

import { useState, useEffect, useRef, useCallback } from 'react';
import { getWordDetails, parseWordDetailResponseContent, streamWordDetails, type WordDetail, type WordDetailKind, type AIModelName, type AIProvider } from '../services/api';
import { normalizeEscapedLineBreaks } from '../utils/markdown';
import { getLocalRomaji } from '../utils/romaji';

interface UseWordDetailOptions { userApiKey?: string; aiProvider: AIProvider; aiModel: AIModelName; useStream?: boolean; }
interface FetchWordDetailsOptions { force?: boolean; kind?: WordDetailKind; }

function partialField(content: string, name: string, completeOnly = false): string {
  const match = new RegExp('"' + name + '"\\s*:\\s*"').exec(content);
  if (!match) return '';
  const start = match.index + match[0].length;
  let escaped = false;
  for (let i = start; i < content.length; i++) {
    if (escaped) { escaped = false; continue; }
    if (content[i] === '\\') { escaped = true; continue; }
    if (content[i] === '"') {
      try { return normalizeEscapedLineBreaks(JSON.parse('"' + content.slice(start, i) + '"')); }
      catch { return ''; }
    }
  }
  if (completeOnly) return '';
  // 未完成的 JSON 转义暂不展示，等后续片段补齐。
  const partial = content.slice(start).replace(/\\(?:u[0-9a-fA-F]{0,3})?$/, '');
  try { return normalizeEscapedLineBreaks(JSON.parse('"' + partial + '"')); }
  catch { return ''; }
}

export function useWordDetail({ userApiKey, aiProvider, aiModel, useStream = true }: UseWordDetailOptions) {
  const { t, locale } = useLanguage();
  const [wordDetail, setWordDetail] = useState<WordDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreamLoading, setIsStreamLoading] = useState(false);
  const [streamContent, setStreamContent] = useState('');
  const [streamError, setStreamError] = useState('');
  // 只缓存已完成的词条；被取消的半截结果不能当作命中。
  const cacheRef = useRef(new Map<string, WordDetail>());
  const activeRef = useRef<{ key: string; controller: AbortController } | null>(null);

  const clearWordDetail = useCallback(() => {
    activeRef.current?.controller.abort();
    activeRef.current = null;
    setWordDetail(null); setIsLoading(false); setIsStreamLoading(false);
    setStreamContent(''); setStreamError('');
  }, []);

  useEffect(() => {
    cacheRef.current.clear();
    clearWordDetail();
    return () => { activeRef.current?.controller.abort(); activeRef.current = null; };
  }, [userApiKey, aiProvider, aiModel, useStream, clearWordDetail, locale]);

  const fetchWordDetails = useCallback(async (
    word: string, pos: string, sentence: string, furigana?: string, options: FetchWordDetailsOptions = {}
  ) => {
    const kind = options.kind ?? 'word';
    const key = JSON.stringify([locale, aiProvider, aiModel, kind, sentence, word, pos, furigana || '']);
    if (!options.force && activeRef.current?.key === key) return;
    activeRef.current?.controller.abort();
    activeRef.current = null;
    setStreamError(''); setStreamContent('');
    const cached = cacheRef.current.get(key);
    if (!options.force && cached) {
      setWordDetail(cached); setIsLoading(false); setIsStreamLoading(false); return;
    }
    const controller = new AbortController();
    const { signal } = controller;
    activeRef.current = { key, controller };
    const isCurrent = () => activeRef.current?.controller === controller && !signal.aborted;
    const context = { word, pos, furigana, kind };
    const phraseFields = kind === 'phrase' ? { kind, category: '', breakdown: '' } : {};
    setWordDetail({ originalWord: word, pos, furigana: furigana || '', romaji: getLocalRomaji(word, furigana, pos), chineseTranslation: t("加载中..."), explanation: '', ...phraseFields });
    setIsLoading(!useStream); setIsStreamLoading(useStream);

    const finish = (detail: WordDetail) => {
      if (!isCurrent()) return;
      cacheRef.current.set(key, detail);
      if (cacheRef.current.size > 80) cacheRef.current.delete(cacheRef.current.keys().next().value!);
      setWordDetail(detail); setIsLoading(false); setIsStreamLoading(false);
      activeRef.current = null;
    };
    const fail = (error: Error) => {
      if (!isCurrent()) return;
      setStreamError(error.message || t("查询释义失败"));
      setIsLoading(false); setIsStreamLoading(false); activeRef.current = null;
    };
    try {
      if (useStream) {
        await streamWordDetails(word, pos, sentence, (content, done) => {
          if (!isCurrent()) return;
          setStreamContent(content);
          if (done) { finish(parseWordDetailResponseContent(content, context)); return; }
          const correctedPos = partialField(content, 'pos', true) || pos;
          const correctedReading = kind === 'phrase'
            ? furigana || ''
            : partialField(content, 'furigana', true) || furigana || '';
          setWordDetail({
            originalWord: word, pos: correctedPos, furigana: correctedReading,
            romaji: getLocalRomaji(word, correctedReading, correctedPos),
            chineseTranslation: partialField(content, 'chineseTranslation') || t("加载中..."),
            dictionaryForm: partialField(content, 'dictionaryForm'),
            explanation: partialField(content, 'explanation'),
            conjugation: partialField(content, 'conjugation'),
            example: partialField(content, 'example'),
            exampleTranslation: partialField(content, 'exampleTranslation'),
            ...(kind === 'phrase' ? {
              kind,
              category: partialField(content, 'category', true),
              breakdown: partialField(content, 'breakdown'),
            } : {}),
          });
        }, fail, furigana, userApiKey, aiProvider, aiModel, signal, kind);
      } else {
        finish(await getWordDetails(word, pos, sentence, furigana, userApiKey, aiProvider, aiModel, signal, kind));
      }
    } catch (error) {
      if (isCurrent()) fail(error instanceof Error ? error : new Error(t("查询释义失败")));
    }
  }, [userApiKey, aiProvider, aiModel, useStream, locale, t]);

  return { wordDetail, isLoading, isStreamLoading, streamContent, streamError, fetchWordDetails, clearWordDetail };
}
