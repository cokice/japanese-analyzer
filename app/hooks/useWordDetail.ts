'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { getWordDetails, streamWordDetails, WordDetail } from '../services/api';
import type { AIProvider } from '../services/api';
import { containsKanji } from '../utils/helpers';
import { normalizeEscapedLineBreaks } from '../utils/markdown';

interface UseWordDetailOptions {
  userApiKey?: string;
  aiProvider: AIProvider;
  useStream?: boolean;
}

interface WordDetailCacheEntry {
  detail: WordDetail | null;
  isLoading: boolean;
  isStreamLoading: boolean;
  streamContent: string;
  streamError: string;
  requestId: number;
}

interface FetchWordDetailsOptions {
  force?: boolean;
}

const MAX_WORD_DETAIL_CACHE = 80;

function normalizeWordDetail(detail: WordDetail): WordDetail {
  return {
    ...detail,
    explanation: normalizeEscapedLineBreaks(detail.explanation || ''),
  };
}

function createPendingDetail(
  word: string,
  pos: string,
  useStream: boolean,
  furigana?: string,
  romaji?: string
): WordDetail {
  return {
    originalWord: word,
    chineseTranslation: '加载中...',
    pos,
    furigana: (furigana && furigana !== word && containsKanji(word)) ? furigana : '',
    romaji: romaji || '',
    dictionaryForm: '',
    explanation: useStream ? '正在生成解释...' : '正在查询释义...',
  };
}

// 词汇详情获取（含流式实时解析），从 AnalysisResult 提取
export function useWordDetail({ userApiKey, aiProvider, useStream = true }: UseWordDetailOptions) {
  const [wordDetail, setWordDetail] = useState<WordDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreamLoading, setIsStreamLoading] = useState(false);
  const [streamContent, setStreamContent] = useState('');
  const [streamError, setStreamError] = useState('');

  const cacheRef = useRef<Map<string, WordDetailCacheEntry>>(new Map());
  const currentKeyRef = useRef<string | null>(null);
  const requestSeqRef = useRef(0);

  const resetVisibleState = useCallback(() => {
    setWordDetail(null);
    setStreamContent('');
    setStreamError('');
    setIsLoading(false);
    setIsStreamLoading(false);
  }, []);

  const applyEntryToState = useCallback((entry: WordDetailCacheEntry) => {
    setWordDetail(entry.detail);
    setIsLoading(entry.isLoading);
    setIsStreamLoading(entry.isStreamLoading);
    setStreamContent(entry.streamContent);
    setStreamError(entry.streamError);
  }, []);

  const syncCurrentEntry = useCallback((key: string) => {
    if (currentKeyRef.current !== key) return;

    const entry = cacheRef.current.get(key);
    if (entry) {
      applyEntryToState(entry);
    }
  }, [applyEntryToState]);

  const pruneCache = useCallback((protectedKey: string) => {
    if (cacheRef.current.size <= MAX_WORD_DETAIL_CACHE) return;

    for (const key of cacheRef.current.keys()) {
      if (cacheRef.current.size <= MAX_WORD_DETAIL_CACHE) break;
      if (key !== protectedKey) {
        cacheRef.current.delete(key);
      }
    }
  }, []);

  useEffect(() => {
    cacheRef.current.clear();
    currentKeyRef.current = null;
    resetVisibleState();
  }, [userApiKey, aiProvider, useStream, resetVisibleState]);

  const getCacheKey = useCallback((
    word: string,
    pos: string,
    sentence: string,
    furigana?: string,
    romaji?: string
  ) => JSON.stringify({
    provider: aiProvider,
    mode: useStream ? 'stream' : 'standard',
    sentence,
    word,
    pos,
    furigana: furigana || '',
    romaji: romaji || '',
  }), [aiProvider, useStream]);

  // 实时解析流式内容的部分字段
  const parseStreamContentRealtime = useCallback((content: string) => {
    const result = {
      originalWord: '',
      chineseTranslation: '',
      pos: '',
      furigana: '',
      romaji: '',
      dictionaryForm: '',
      explanation: '',
      rawContent: content
    };

    try {
      const extractFieldEfficient = (fieldName: string): string => {
        const searchStr = `"${fieldName}":`;
        const startIndex = content.indexOf(searchStr);
        if (startIndex === -1) return '';

        const valueStart = content.indexOf('"', startIndex + searchStr.length);
        if (valueStart === -1) return '';

        let valueEnd = valueStart + 1;
        let escapeNext = false;

        // 找到字符串结束位置，处理转义字符
        while (valueEnd < content.length) {
          const char = content[valueEnd];
          if (escapeNext) {
            escapeNext = false;
          } else if (char === '\\') {
            escapeNext = true;
          } else if (char === '"') {
            break;
          }
          valueEnd++;
        }

        if (valueEnd >= content.length) {
          // 字符串未结束，可能还在生成中
          return normalizeEscapedLineBreaks(
            content.substring(valueStart + 1, valueEnd).replace(/\\"/g, '"')
          ) + '...';
        }

        const rawJsonString = content.substring(valueStart, valueEnd + 1);
        try {
          const parsedValue = JSON.parse(rawJsonString);
          return typeof parsedValue === 'string'
            ? normalizeEscapedLineBreaks(parsedValue)
            : '';
        } catch {
          return normalizeEscapedLineBreaks(
            content.substring(valueStart + 1, valueEnd).replace(/\\"/g, '"')
          );
        }
      };

      result.originalWord = extractFieldEfficient('originalWord');
      result.chineseTranslation = extractFieldEfficient('chineseTranslation');
      result.pos = extractFieldEfficient('pos');
      result.furigana = extractFieldEfficient('furigana');
      result.romaji = extractFieldEfficient('romaji');
      result.dictionaryForm = extractFieldEfficient('dictionaryForm');
      result.explanation = extractFieldEfficient('explanation');

      return result;
    } catch (e) {
      console.warn('实时解析出错:', e);
      return result;
    }
  }, []);

  const parseFinalWordDetail = useCallback((chunk: string): WordDetail | null => {
    try {
      let processedContent = chunk;

      const jsonMatch = chunk.match(/```json\n([\s\S]*?)(\n```|$)/);
      if (jsonMatch && jsonMatch[1]) {
        processedContent = jsonMatch[1].trim();
      } else {
        const objectStart = processedContent.indexOf('{');
        const objectEnd = processedContent.lastIndexOf('}');

        if (objectStart !== -1 && objectEnd !== -1 && objectEnd > objectStart) {
          processedContent = processedContent.substring(objectStart, objectEnd + 1);
        }
      }

      const finalDetails = JSON.parse(processedContent) as WordDetail;
      if (finalDetails && typeof finalDetails === 'object' && 'originalWord' in finalDetails) {
        return normalizeWordDetail(finalDetails);
      }
    } catch (e) {
      console.warn('最终JSON解析失败，保持实时解析结果:', e);
    }

    return null;
  }, []);

  const fetchWordDetails = useCallback(async (
    word: string,
    pos: string,
    sentence: string,
    furigana?: string,
    romaji?: string,
    options: FetchWordDetailsOptions = {}
  ) => {
    const cacheKey = getCacheKey(word, pos, sentence, furigana, romaji);
    const cachedEntry = cacheRef.current.get(cacheKey);
    currentKeyRef.current = cacheKey;

    if (!options.force && cachedEntry) {
      applyEntryToState(cachedEntry);
      if (cachedEntry.isLoading || cachedEntry.isStreamLoading || cachedEntry.detail || cachedEntry.streamError) {
        return;
      }
    }

    const requestId = ++requestSeqRef.current;
    const entry: WordDetailCacheEntry = {
      detail: createPendingDetail(word, pos, useStream, furigana, romaji),
      isLoading: !useStream,
      isStreamLoading: useStream,
      streamContent: '',
      streamError: '',
      requestId,
    };

    cacheRef.current.set(cacheKey, entry);
    pruneCache(cacheKey);
    applyEntryToState(entry);

    if (useStream) {
      void streamWordDetails(
        word,
        pos,
        sentence,
        (chunk, isDone) => {
          const activeEntry = cacheRef.current.get(cacheKey);
          if (!activeEntry || activeEntry.requestId !== requestId) return;

          activeEntry.streamContent = chunk;
          activeEntry.streamError = '';

          const realtimeData = parseStreamContentRealtime(chunk);
          if (realtimeData.originalWord || realtimeData.chineseTranslation || realtimeData.explanation) {
            activeEntry.detail = {
              originalWord: realtimeData.originalWord || word,
              chineseTranslation: realtimeData.chineseTranslation || '加载中...',
              pos: realtimeData.pos || pos,
              furigana: realtimeData.furigana || furigana || '',
              romaji: realtimeData.romaji || romaji || '',
              dictionaryForm: realtimeData.dictionaryForm || '',
              explanation: realtimeData.explanation || '正在生成解释...'
            };
          }

          if (isDone) {
            activeEntry.isStreamLoading = false;
            const finalDetails = parseFinalWordDetail(chunk);
            if (finalDetails) {
              activeEntry.detail = finalDetails;
            }
          }

          syncCurrentEntry(cacheKey);
        },
        (error) => {
          const activeEntry = cacheRef.current.get(cacheKey);
          if (!activeEntry || activeEntry.requestId !== requestId) return;

          console.error('Stream word detail error:', error);
          activeEntry.streamError = error.message || '流式查询词汇详情出错';
          activeEntry.isStreamLoading = false;
          activeEntry.detail = {
            originalWord: word,
            pos: pos,
            furigana: (furigana && furigana !== word && containsKanji(word)) ? furigana : '',
            romaji: romaji || '',
            dictionaryForm: '',
            chineseTranslation: '错误',
            explanation: `流式查询释义时发生错误: ${error.message || '未知错误'}。`
          };
          syncCurrentEntry(cacheKey);
        },
        furigana,
        romaji,
        userApiKey,
        aiProvider
      );
    } else {
      try {
        const details = await getWordDetails(word, pos, sentence, furigana, romaji, userApiKey, aiProvider);
        const activeEntry = cacheRef.current.get(cacheKey);
        if (!activeEntry || activeEntry.requestId !== requestId) return;

        activeEntry.detail = details;
        activeEntry.streamError = '';
      } catch (error) {
        const activeEntry = cacheRef.current.get(cacheKey);
        if (!activeEntry || activeEntry.requestId !== requestId) return;

        console.error('Error fetching word details:', error);
        activeEntry.streamError = error instanceof Error ? error.message : '查询释义时发生错误';
        activeEntry.detail = {
          originalWord: word,
          pos: pos,
          furigana: (furigana && furigana !== word && containsKanji(word)) ? furigana : '',
          romaji: romaji || '',
          dictionaryForm: '',
          chineseTranslation: '错误',
          explanation: `查询释义时发生错误: ${error instanceof Error ? error.message : '未知错误'}。`
        };
      } finally {
        const activeEntry = cacheRef.current.get(cacheKey);
        if (!activeEntry || activeEntry.requestId !== requestId) return;

        activeEntry.isLoading = false;
        syncCurrentEntry(cacheKey);
      }
    }
  }, [
    aiProvider,
    applyEntryToState,
    getCacheKey,
    parseFinalWordDetail,
    parseStreamContentRealtime,
    pruneCache,
    syncCurrentEntry,
    useStream,
    userApiKey,
  ]);

  const clearWordDetail = useCallback(() => {
    currentKeyRef.current = null;
    resetVisibleState();
  }, [resetVisibleState]);

  return {
    wordDetail,
    isLoading,
    isStreamLoading,
    streamContent,
    streamError,
    fetchWordDetails,
    clearWordDetail,
  };
}
