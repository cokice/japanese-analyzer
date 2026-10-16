'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { queryDictionary } from '../services/learning';
import type { DictionaryProvider, DictionaryResult } from '../lib/dictionary';
import { LatestRequest } from '../utils/latestRequest';

export function useDictionary(word: string, lemma: string, reading: string, provider: DictionaryProvider) {
  const [result, setResult] = useState<DictionaryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(new LatestRequest());
  const seen = useRef(new Set<string>());
  const resultRef = useRef<DictionaryResult | null>(null);
  const queuedLemma = useRef(lemma); queuedLemma.current = lemma;
  const generation = useRef(0);
  const load = useCallback(async (q: string, offset = 0, supplement = false) => {
    if (!q.trim()) return;
    seen.current.add(q);
    const ticket = request.current.start(); setLoading(true); setError('');
    try {
      const data = await queryDictionary({ query: word, dictionaryForm: supplement ? q : lemma || undefined, reading: reading || undefined, offset }, provider, ticket.signal);
      if (!ticket.isCurrent()) return;
      const previous = resultRef.current;
      const sameSource = previous?.source.id === data.source.id && previous.source.version === data.source.version;
      const entries = sameSource && (supplement || offset) ? [...previous!.entries, ...data.entries] : data.entries;
      const unique = [...new Map(entries.map(e => [`${e.source.id}:${e.source.version}:${e.id}`, e])).values()];
      const next = { ...data, entries: unique }; resultRef.current = next; setResult(next); seen.current.add(q);
    } catch (e) { if (ticket.isCurrent()) setError(e instanceof Error ? e.message : '词典查询失败'); }
    finally { if (ticket.isCurrent()) setLoading(false); }
  }, [word, lemma, reading, provider]);
  const loadRef = useRef(load); loadRef.current = load;
  useEffect(() => {
    const manager = request.current;
    generation.current++; const version = generation.current;
    seen.current = new Set(); resultRef.current = null; setResult(null); setError(''); setLoading(false);
    // Start with the surface form. Lemma enrichment never holds up this request.
    const ticket = request.current.start();
    if (word.trim()) {
      setLoading(true);
      void queryDictionary({ query: word, reading: reading || undefined }, provider, ticket.signal).then(data => {
        if (!ticket.isCurrent()) return;
        seen.current.add(word); resultRef.current = data; setResult(data);
      }).catch(e => { if (ticket.isCurrent()) setError(e instanceof Error ? e.message : '词典查询失败'); }).finally(() => {
        if (!ticket.isCurrent()) return;
        setLoading(false);
        const next = queuedLemma.current;
        if (version === generation.current && next && !seen.current.has(next)) void loadRef.current(next, 0, true);
      });
    }
    return () => manager.cancel();
  }, [word, reading, provider]);
  useEffect(() => {
    if (word && lemma && !loading && resultRef.current && !seen.current.has(lemma)) void loadRef.current(lemma, 0, true);
  }, [lemma, word, loading]);
  return { result, loading, error, retry: () => load(word), more: () => load(word, (result?.offset ?? 0) + 20) };
}
