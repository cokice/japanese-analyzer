import type { PhraseRange } from '../utils/phraseRange';

export type ReadingSelection = { kind: 'none' } | { kind: 'word'; index: number }
  | { kind: 'range'; range: PhraseRange } | { kind: 'picking'; anchor: number; selectedIndex: number | null };
export interface ReadingViewState { mode: 'home' | 'analyzing' | 'reading' | 'editing'; selection: ReadingSelection; }
export const initialReadingView: ReadingViewState = { mode: 'home', selection: { kind: 'none' } };
export type ReadingViewAction = { type: 'analyze' | 'home' | 'edit' | 'read' | 'clearSelection' }
  | { type: 'settled'; hasTokens: boolean; error?: boolean }
  | { type: 'word'; index: number } | { type: 'range'; range: PhraseRange } | { type: 'pick'; anchor: number | null };

export function getViewSelection({ selection }: ReadingViewState) {
  return {
    selectedIndex: selection.kind === 'word' ? selection.index : selection.kind === 'picking' ? selection.selectedIndex : null,
    selectedRange: selection.kind === 'range' ? selection.range : null,
    pickAnchor: selection.kind === 'picking' ? selection.anchor : null,
  };
}

export function readingViewReducer(state: ReadingViewState, action: ReadingViewAction): ReadingViewState {
  switch (action.type) {
    case 'home': return initialReadingView;
    case 'analyze': return { mode: 'analyzing', selection: { kind: 'none' } };
    case 'edit': return { ...state, mode: 'editing' };
    case 'read': return { ...state, mode: 'reading' };
    case 'settled': return { ...state, mode: state.mode === 'home' || state.mode === 'editing' ? state.mode
      : action.error || !action.hasTokens ? 'editing' : 'reading' };
    case 'clearSelection': return { ...state, selection: { kind: 'none' } };
    case 'word': return { ...state, selection: { kind: 'word', index: action.index } };
    case 'range': return { ...state, selection: { kind: 'range', range: action.range } };
    case 'pick': {
      const current = getViewSelection(state);
      if (action.anchor !== null) return { ...state, selection: { kind: 'picking', anchor: action.anchor, selectedIndex: current.selectedIndex } };
      if (state.selection.kind !== 'picking') return state;
      return { ...state, selection: current.selectedIndex === null ? { kind: 'none' } : { kind: 'word', index: current.selectedIndex } };
    }
  }
}
