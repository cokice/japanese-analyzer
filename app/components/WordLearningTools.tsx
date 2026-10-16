'use client';

import type { TokenData } from '../services/api';
import type { LearningModel } from '../services/learning';
import type { DictionaryProvider } from '../lib/dictionary';
import { getPosGroup } from '../utils/helpers';
import DictionaryPanel from './DictionaryPanel';
import ExternalDictionaryLookup from './ExternalDictionaryLookup';
import ConjugationPanel from './ConjugationPanel';

export default function WordLearningTools({ word, lemma = '', reading = '', context, tokens, selectionKind, provider, model }: {
  word: string; lemma?: string; reading?: string; context: string; tokens: readonly TokenData[];
  selectionKind: 'word' | 'phrase'; provider: DictionaryProvider; model: LearningModel;
}) {
  const singleWord = selectionKind === 'word' && tokens.length === 1;
  const hasConjugation = tokens.some(token => ['v', 'adj', 'adjv', 'aux'].includes(getPosGroup(token.pos)));
  if (!word) return null;
  return <div className="word-reference-tools">
    {singleWord && <DictionaryPanel word={word} lemma={lemma} reading={reading} provider={provider} model={model} />}
    <ExternalDictionaryLookup word={word} lemma={singleWord ? lemma : ''} />
    {hasConjugation && <ConjugationPanel surface={word} lemma={lemma} context={context} model={model} />}
  </div>;
}
