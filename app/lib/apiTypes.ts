import { type AIProvider, type AIModelName } from './aiModels';

export interface TokenData {
  word: string;
  pos: string;
  furigana?: string;
  romaji?: string;
}

export interface WordDetail {
  originalWord: string;
  translation: string;
  pos: string;
  furigana?: string;
  romaji?: string;
  dictionaryForm?: string;
  explanation: string;
  conjugation?: string;
  example?: string;
  exampleTranslation?: string;
  /** phrase：用户圈选的多词短语 */
  kind?: WordDetailKind;
  /** 短语类别：単語（被拆开的一个词）| 文法形式 | 慣用表現 | 連語 */
  category?: string;
  /** 短语的构成拆解 */
  breakdown?: string;
  /** 短语被判断为一个词时，AI 给出的整词读音（用于合并，可处理连浊等） */
  mergeReading?: string;
}

export type WordDetailKind = 'word' | 'phrase';

/** 短语类别（与短语提示词约定的日文标签一致） */
export const PHRASE_CATEGORIES: readonly string[] = ['単語', '文法形式', '慣用表現', '連語'];

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type TTSProvider = 'edge' | 'gemini';

export interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export interface StoredAISettings {
  aiProvider: AIProvider;
  aiModel: AIModelName;
  geminiApiKey: string;
  deepseekApiKey: string;
  deepseekThinkingEnabled: boolean;
}

export interface AnalyzeRequestOptions {
  deepseekThinkingEnabled?: boolean;
  onReasoning?: (text: string, done: boolean) => void;
  onContentStart?: () => void;
  signal?: AbortSignal;
}

export interface ReasoningSummaryRequestOptions {
  reasoningSnippet: string;
  userApiKey?: string;
  signal?: AbortSignal;
}

export interface WordDetailContext { word: string; pos: string; furigana?: string; kind?: WordDetailKind; }
