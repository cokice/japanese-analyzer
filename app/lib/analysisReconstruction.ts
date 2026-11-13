import { type TokenData } from './apiTypes';
import { type JapaneseTextChunk } from '../utils/japaneseChunking';
import { createTranslator, getClientLocale } from '../i18n';

function reconstructTokenText(tokens: TokenData[]): string {
  return tokens.map((token) => token.word).join('');
}

function alignTokenWhitespaceToSource(source: string, tokens: TokenData[]): TokenData[] | null {
  const sourceWithoutWhitespace = source.replace(/\s/gu, '');
  const tokensWithoutWhitespace = tokens
    .map((token) => token.word.replace(/\s/gu, ''))
    .join('');
  if (sourceWithoutWhitespace !== tokensWithoutWhitespace) return null;

  const alignedTokens: TokenData[] = [];
  let sourceIndex = 0;

  const appendSourceWhitespace = () => {
    while (sourceIndex < source.length && /\s/u.test(source[sourceIndex])) {
      const character = source[sourceIndex];
      alignedTokens.push({
        word: character,
        pos: character === '\n' || character === '\r' ? '改行' : '記号',
        furigana: '',
        romaji: '',
      });
      sourceIndex += 1;
    }
  };

  for (const token of tokens) {
    const normalizedWord = token.word.replace(/\s/gu, '');
    if (!normalizedWord) continue;

    let segment = '';
    let emittedSegment = false;
    const flushSegment = () => {
      if (!segment) return;
      alignedTokens.push({
        ...token,
        word: segment,
        furigana: emittedSegment ? '' : token.furigana,
        romaji: emittedSegment ? '' : token.romaji,
      });
      emittedSegment = true;
      segment = '';
    };

    appendSourceWhitespace();
    for (const character of normalizedWord) {
      if (/\s/u.test(source[sourceIndex] || '')) {
        flushSegment();
        appendSourceWhitespace();
      }
      if (!source.startsWith(character, sourceIndex)) return null;
      segment += character;
      sourceIndex += character.length;
    }
    flushSegment();
  }

  appendSourceWhitespace();
  return sourceIndex === source.length ? alignedTokens : null;
}

export function reconcileChunkReconstruction(
  chunk: JapaneseTextChunk,
  tokens: TokenData[],
  chunkIndex: number,
  chunkCount: number
): TokenData[] {
  if (reconstructTokenText(tokens) === chunk.text) return tokens;

  const whitespaceAlignedTokens = alignTokenWhitespaceToSource(chunk.text, tokens);
  if (whitespaceAlignedTokens) return whitespaceAlignedTokens;

  throw new Error(
    `第 ${chunkIndex + 1}/${chunkCount} 段解析结果未能完整还原原文，请重试。`
  );
}

export function formatChunkReasoning(
  reasoningByChunk: string[],
  includeThroughIndex: number
): string {
  return reasoningByChunk
    .slice(0, includeThroughIndex + 1)
    .map((text, index) => text ? `${createTranslator(getClientLocale())("第 {0}/{1} 段", index + 1, reasoningByChunk.length)}\n${text}` : '')
    .filter(Boolean)
    .join('\n\n');
}
