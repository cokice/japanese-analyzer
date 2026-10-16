'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import type { DictionaryProvider } from '../lib/dictionary';
import { getWordDetails, type TokenData } from '../services/api';
import type { LearningModel } from '../services/learning';
import { LatestRequest } from '../utils/latestRequest';
import { collectSentenceVocabulary, vocabularyContext, type SentenceVocabularyItem } from '../utils/sentenceVocabulary';
import { getPosGroup, POS_GROUP_COLORS, POS_GROUP_LABELS } from '../utils/helpers';
import DictionaryPanel from './DictionaryPanel';
import ExternalDictionaryLookup from './ExternalDictionaryLookup';
import { credentialScope } from '../utils/sentenceCache';

interface Props {
  draft: string;
  onDraftChange: (value: string) => void;
  provider: DictionaryProvider;
  model: LearningModel;
  active?: boolean;
  sentence?: string;
  tokens?: TokenData[];
  analysisId?: number;
  dictionaryForms?: Record<string, string>;
}
type Selection = { scope: string; kind: 'sentence'; key: string } | { scope: string; kind: 'manual'; word: string };
const NO_TOKENS: TokenData[] = [];
const NO_FORMS: Record<string, string> = {};
const canQuery = (word: string) => !!word.trim() && Array.from(word).length <= 120;

export default function DictionaryLookup({ draft, onDraftChange, provider, model, active = true, sentence = '', tokens = NO_TOKENS, analysisId = 0, dictionaryForms = NO_FORMS }: Props) {
  const { t, locale, errorText } = useLanguage();
  const vocabulary = useMemo(() => collectSentenceVocabulary(sentence, tokens, dictionaryForms), [sentence, tokens, dictionaryForms]);
  const scope = JSON.stringify([analysisId, sentence]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [sort, setSort] = useState<'sentence' | 'pos'>('sentence');
  const [limit, setLimit] = useState(60);
  const [lookupId, setLookupId] = useState(0);
  const [emptyFor, setEmptyFor] = useState('');
  const [inferred, setInferred] = useState({ identity: '', lemma: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [occurrence, setOccurrence] = useState({ identity: '', index: 0 });
  const request = useRef(new LatestRequest());
  const currentSelection = selection?.scope === scope ? selection : null;
  useEffect(() => {
    if (currentSelection?.kind === 'sentence' && !vocabulary.some(item => item.key === currentSelection.key)) setSelection(null);
  }, [currentSelection, vocabulary]);
  const selectedItem = currentSelection?.kind === 'manual' ? undefined
    : vocabulary.find(item => currentSelection?.kind === 'sentence' && item.key === currentSelection.key)
      ?? vocabulary.find(item => canQuery(item.token.word));
  const query = currentSelection?.kind === 'manual' ? currentSelection.word : selectedItem?.token.word || '';
  const reading = selectedItem?.token.furigana || '';
  const identity = JSON.stringify([scope, currentSelection?.kind ?? 'sentence', selectedItem?.key ?? query, lookupId]);
  // AI guesses are local to a word, provider, language and model; they never initiate on selection.
  const inferenceIdentity = JSON.stringify([identity, provider.adapter, provider.id, provider.lookupUrl, credentialScope(provider.apiKey), locale, model.endpoint, credentialScope(model.apiKey)]);
  const lemma = inferred.identity === inferenceIdentity ? inferred.lemma : selectedItem?.lemma || '';
  const onEmptyChange = useCallback((empty: boolean) => setEmptyFor(empty ? identity : ''), [identity]);
  useEffect(() => {
    const manager = request.current;
    manager.cancel(); setLoading(false); setError('');
    return () => manager.cancel();
  }, [inferenceIdentity, active]);
  useEffect(() => { setLimit(60); }, [scope]);

  const findLemma = async () => {
    if (!query) return;
    const ticket = request.current.start(); setLoading(true); setError('');
    try {
      const detail = await getWordDetails(query, '', '', reading, model.apiKey, model.endpoint, ticket.signal, 'lookup');
      if (!ticket.isCurrent()) return;
      setInferred({ identity: inferenceIdentity, lemma: detail.dictionaryForm || '' });
      if (!detail.dictionaryForm) setError('AI 未找到可靠的原形');
    } catch (e) { if (ticket.isCurrent()) setError(e instanceof Error ? e.message : '学习工具请求失败'); }
    finally { if (ticket.isCurrent()) setLoading(false); }
  };

  const visible = vocabulary.slice(0, limit);
  const groups = new Map<string, SentenceVocabularyItem[]>();
  for (const item of visible) {
    const group = sort === 'pos' ? getPosGroup(item.token.pos) : 'sentence';
    const items = groups.get(group) ?? [];
    items.push(item); groups.set(group, items);
  }
  const occurrenceIndex = occurrence.identity === identity && selectedItem ? occurrence.index % selectedItem.occurrences.length : 0;
  const context = selectedItem ? vocabularyContext(sentence, selectedItem.occurrences[occurrenceIndex]) : null;

  return <section className="dictionary-lookup">
    <form className="nd-card learning-actions" onSubmit={event => {
      event.preventDefault();
      const word = draft.trim();
      if (!canQuery(word)) return;
      setLookupId(id => id + 1); setEmptyFor('');
      setSelection({ scope, kind: 'manual', word });
    }}>
      <label className="flex-1">{t('查词')}<input className="learning-input" aria-label={t('查词输入')} placeholder={t('输入其他词语')} lang="ja" value={draft} onChange={event => onDraftChange(event.target.value)} maxLength={240} /></label>
      <button className="nd-soft-btn" disabled={!canQuery(draft.trim())}>{t('查询')}</button>
    </form>

    <div className={vocabulary.length ? 'sentence-dictionary-layout' : undefined}>
      {vocabulary.length > 0 ? <section className="nd-card sentence-vocabulary" aria-label={t('本句词汇')}>
        <div className="learning-actions"><h2>{t('本句词汇')}</h2><span className="tool-note">{t('{0} 个词语', vocabulary.length)}</span></div>
        <p className="tool-note">{t('点击词语查看词典，重复词已合并。')}</p>
        <div className="learning-actions vocabulary-sort" role="group" aria-label={t('词汇排列方式')}>
          <button className="display-chip" aria-pressed={sort === 'sentence'} onClick={() => setSort('sentence')}>{t('原句顺序')}</button>
          <button className="display-chip" aria-pressed={sort === 'pos'} onClick={() => setSort('pos')}>{t('按词性分组')}</button>
        </div>
        <details className="vocabulary-source"><summary>{t('查看来源句子')}</summary><p lang="ja">{sentence}</p></details>
        <div className="vocabulary-list">
          {[...groups].map(([group, items]) => <div key={group} className="vocabulary-group">
            {sort === 'pos' && <h3>{t(POS_GROUP_LABELS[getPosGroup(items[0].token.pos)])}</h3>}
            <div className="vocabulary-words">{items.map(item => <button
              key={item.key} type="button" className="vocabulary-word"
              aria-pressed={selectedItem?.key === item.key}
              aria-label={t('查询词语：{0}，{1}，{2}，出现 {3} 次', item.token.word, item.token.furigana || item.token.word, t(POS_GROUP_LABELS[getPosGroup(item.token.pos)]), item.occurrences.length)}
              disabled={!canQuery(item.token.word)} title={!canQuery(item.token.word) ? t('词语超过 120 个字符，请手动缩短后查询') : undefined}
              onClick={() => setSelection({ scope, kind: 'sentence', key: item.key })}>
              <span className="vocabulary-word-main">
                <span lang="ja" className="vocabulary-word-reading">{item.token.furigana && item.token.furigana !== item.token.word ? item.token.furigana : '\u00a0'}</span>
                <span lang="ja" className="vocabulary-word-text">{item.token.word}{item.occurrences.length > 1 && <span className="vocabulary-count">×{item.occurrences.length}</span>}</span>
              </span>
              <span className="vocabulary-word-meta"><span className="vocabulary-pos-dot" aria-hidden="true" style={{ backgroundColor: POS_GROUP_COLORS[getPosGroup(item.token.pos)] }} /><small>{t(POS_GROUP_LABELS[getPosGroup(item.token.pos)])}</small></span>
            </button>)}</div>
          </div>)}
        </div>
        {vocabulary.length > limit && <button className="nd-ghost-btn" onClick={() => setLimit(value => value + 60)}>{t('更多词汇')}</button>}
        <a className="vocabulary-result-link" href="#dictionary-lookup-result">{t('查看词典结果')}</a>
      </section> : <p className="tool-note">{sentence && tokens.length ? t('本句没有可展示的完整词汇列表。') : t('解析句子后，这里会自动列出本句词汇。')}</p>}

      <section id="dictionary-lookup-result" className="sentence-dictionary-detail" aria-label={t('词典查询结果')}>
        {context && selectedItem && <div className="vocabulary-context nd-card">
          <p lang="ja">{context.before}<mark>{context.word}</mark>{context.after}</p>
          {selectedItem.occurrences.length > 1 && <div className="learning-actions"><span className="tool-note" role="status">{t('第 {0}/{1} 次出现', occurrenceIndex + 1, selectedItem.occurrences.length)}</span>
            <button className="nd-ghost-btn" onClick={() => setOccurrence({ identity, index: occurrenceIndex + 1 })}>{t('下一处')}</button>
          </div>}
        </div>}
        {active && query && <>
          <div className="learning-actions dictionary-lemma-actions">
            {emptyFor === identity && <button className="nd-ghost-btn" disabled={loading || !model.endpoint.model} onClick={findLemma}>{t(loading ? '查找中…' : 'AI 查找原形')}</button>}
            {lemma && lemma !== query && <span>{t('AI 推断原形')}：<span lang="ja">{lemma}</span></span>}
          </div>
          <DictionaryPanel key={identity} word={query} lemma={lemma} reading={reading} provider={provider} model={model} standalone onEmptyChange={onEmptyChange} />
          <ExternalDictionaryLookup key={`external:${identity}`} word={query} lemma={lemma} />
        </>}
        {error && <p role="alert">{errorText(error)}</p>}
      </section>
    </div>
  </section>;
}
