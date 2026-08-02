import type { TokenData } from '../services/api';
import type { ProofreadCorrection, ProofreadField } from './proofreading';


function sourceIndexesFor(token: TokenData, fallbackIndex: number): number[] {
  return token.proofreadSourceIndexes?.length
    ? token.proofreadSourceIndexes
    : [fallbackIndex];
}

function markToken(
  token: TokenData,
  field: ProofreadField,
  why: string,
  revision: number
): TokenData {
  const fields = [...new Set([...(token.proofreadReview?.fields ?? []), field])];
  const reasons = [...new Set(
    [token.proofreadReview?.why, why].filter((value): value is string => Boolean(value))
  )];
  return {
    ...token,
    proofreadReview: {
      fields,
      why: reasons.join('；'),
      revision,
    },
  };
}

export function applyProofreadCorrections(
  tokens: readonly TokenData[],
  corrections: readonly ProofreadCorrection[]
): TokenData[] {
  if (corrections.length === 0) return [...tokens];

  let revision = tokens.reduce(
    (maximum, token) => Math.max(maximum, token.proofreadReview?.revision ?? 0),
    0
  );
  let nextTokens: TokenData[] = tokens.map((token, index) => ({
    ...token,
    proofreadSourceIndexes: [...sourceIndexesFor(token, index)],
  }));

  for (const correction of corrections) {
    const targetIndexes = new Set(correction.indexes);
    const positions = nextTokens
      .map((token, index) => ({ token, index }))
      .filter(({ token }) => token.proofreadSourceIndexes?.some((index) => targetIndexes.has(index)))
      .map(({ index }) => index);
    if (positions.length === 0) continue;
    revision += 1;

    if (correction.field === 'pos' || correction.field === 'kana') {
      const position = positions[0];
      const token = nextTokens[position];
      const updated = correction.field === 'pos'
        ? { ...token, pos: correction.correct }
        : { ...token, furigana: correction.correct };
      nextTokens[position] = markToken(updated, correction.field, correction.why, revision);
      continue;
    }

    const firstPosition = positions[0];
    const lastPosition = positions[positions.length - 1];
    if (lastPosition - firstPosition + 1 !== positions.length) continue;
    const affectedTokens = nextTokens.slice(firstPosition, lastPosition + 1);
    const correctedWords = correction.correct
      .split(/[|｜]/u)
      .map((word) => word.trim())
      .filter(Boolean);
    if (correctedWords.length === 0) continue;
    const originalText = affectedTokens.map((token) => token.word).join('');
    if (correctedWords.join('') !== originalText) continue;

    const allSourceIndexes = [...new Set(
      affectedTokens.flatMap((token) => token.proofreadSourceIndexes ?? [])
    )].sort((left, right) => left - right);
    const replacement = correctedWords.map((word, wordIndex) => {
      const matchingToken = affectedTokens.length === correctedWords.length
        ? affectedTokens[wordIndex]
        : undefined;
      const baseToken = matchingToken ?? affectedTokens[0];
      return markToken({
        ...baseToken,
        word,
        furigana: matchingToken?.word === word ? matchingToken.furigana : '',
        romaji: matchingToken?.word === word ? matchingToken.romaji : '',
        proofreadSourceIndexes: matchingToken?.proofreadSourceIndexes?.length
          ? [...matchingToken.proofreadSourceIndexes]
          : [...allSourceIndexes],
      }, 'seg', correction.why, revision);
    });
    nextTokens = [
      ...nextTokens.slice(0, firstPosition),
      ...replacement,
      ...nextTokens.slice(lastPosition + 1),
    ];
  }

  return nextTokens;
}

export function findTokenByProofreadSourceIndex(
  tokens: readonly TokenData[],
  sourceIndex: number
): number {
  return tokens.findIndex((token, index) => (
    sourceIndexesFor(token, index).includes(sourceIndex)
  ));
}

export function getTokenProofreadSourceIndex(
  token: TokenData | undefined,
  fallbackIndex: number
): number {
  return token ? sourceIndexesFor(token, fallbackIndex)[0] : fallbackIndex;
}
