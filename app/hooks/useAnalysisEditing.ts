'use client';
import { useCallback, useRef, useState } from 'react';
import type { TokenData } from '../services/api';
import { applyTokenEdit, sourceRange, withEditHistory, type EditState } from '../utils/analysisEditing';
import type { PhraseRange } from '../utils/phraseRange';

const initialState = (): EditState => ({ tokens: [], initial: [], groups: [], taskId: 0, revision: 0, history: [] });
export function useAnalysisEditing() {
  const [state, setState] = useState<EditState>(initialState); const ref = useRef(state); ref.current = state;
  const update = useCallback((fn: (s: EditState) => EditState) => { setState(s => { const next = fn(s); ref.current = next; return next; }); }, []);
  const setTokens = useCallback((value: TokenData[] | ((tokens: TokenData[]) => TokenData[])) => update(s => {
    const tokens = typeof value === 'function' ? value(s.tokens) : value;
    return { ...s, tokens, initial: tokens, history: [], groups: [], taskId: s.taskId + (tokens.length === 0 ? 1 : 0), revision: s.revision + 1 };
  }), [update]);
  const startTask = useCallback((tokens: TokenData[]) => update(s => ({ ...initialState(), tokens, initial: tokens, taskId: s.taskId + 1, revision: s.revision + 1 })), [update]);
  const edit = useCallback((range: PhraseRange, tokens: TokenData[], taskId: number, revision: number) => update(s => s.taskId === taskId && s.revision === revision ? applyTokenEdit(s, range, tokens) : s), [update]);
  const undo = useCallback(() => update(s => { const previous = s.history.at(-1); return previous ? { ...s, ...previous, history: s.history.slice(0, -1), revision: s.revision + 1 } : s; }), [update]);
  const restore = useCallback(() => update(s => ({ ...s, tokens: s.initial, groups: [], history: [], revision: s.revision + 1 })), [update]);
  const group = useCallback((range: PhraseRange) => update(s => { const selected = sourceRange(s.tokens, range); return withEditHistory(s, s.tokens, [...s.groups.filter(g => g.end <= selected.start || g.start >= selected.end), selected]); }), [update]);
  const ungroup = useCallback((range: PhraseRange) => update(s => { const selected = sourceRange(s.tokens, range); return withEditHistory(s, s.tokens, [...s.groups.filter(g => g.end <= selected.start || g.start >= selected.end), { ...selected, suppressed: true }]); }), [update]);
  const canRestore = state.groups.length > 0 || JSON.stringify(state.tokens) !== JSON.stringify(state.initial);
  return { state, ref, setTokens, startTask, edit, undo, restore, group, ungroup, canRestore };
}
