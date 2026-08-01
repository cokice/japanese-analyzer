export interface JapaneseChunkingOptions {
  targetChars?: number;
  maxChars?: number;
  minChars?: number;
}

export interface JapaneseTextChunk {
  text: string;
  start: number;
  end: number;
  sentenceCount: number;
  overLimit: boolean;
}

interface SemanticUnit {
  start: number;
  end: number;
  sentenceCount: number;
  paragraphEnd: boolean;
}

const DEFAULT_TARGET_CHARS = 280;
const DEFAULT_MAX_CHARS = 420;
const DEFAULT_MIN_CHARS = 180;
const SENTENCE_ENDINGS = new Set(['。', '！', '？', '!', '?']);
const CLOSING_PUNCTUATION = new Set(['」', '』', '）', ')', '】', '〉', '》', '〕', ']', '}', '］', '｝', '”', '’']);
const BRACKET_PAIRS = new Map([
  ['「', '」'],
  ['『', '』'],
  ['（', '）'],
  ['(', ')'],
  ['【', '】'],
  ['〈', '〉'],
  ['《', '》'],
  ['〔', '〕'],
  ['[', ']'],
  ['{', '}'],
  ['［', '］'],
  ['｛', '｝'],
  ['“', '”'],
  ['‘', '’'],
]);

function clampPositiveInteger(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}

function trailingCharacterBefore(text: string, index: number): string {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (!/\s/u.test(text[cursor])) return text[cursor];
  }
  return '';
}

function collectSemanticUnits(text: string): SemanticUnit[] {
  if (!text) return [];

  const units: SemanticUnit[] = [];
  const expectedClosers: string[] = [];
  let unitStart = 0;

  const pushUnit = (end: number, sentenceCount: number, paragraphEnd: boolean) => {
    if (end <= unitStart) return;
    units.push({ start: unitStart, end, sentenceCount, paragraphEnd });
    unitStart = end;
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const expectedCloser = BRACKET_PAIRS.get(character);
    if (expectedCloser) {
      expectedClosers.push(expectedCloser);
      continue;
    }

    if (expectedClosers.at(-1) === character) {
      expectedClosers.pop();
      continue;
    }

    if (character === '\n' && expectedClosers.length === 0) {
      let lineBreakEnd = index + 1;
      while (text[lineBreakEnd] === '\n') lineBreakEnd += 1;
      const lineBreakCount = lineBreakEnd - index;
      const previousCharacter = trailingCharacterBefore(text, index);
      const closesSentence = SENTENCE_ENDINGS.has(previousCharacter)
        || CLOSING_PUNCTUATION.has(previousCharacter);

      if (lineBreakCount > 1 || closesSentence) {
        pushUnit(lineBreakEnd, 0, true);
      }
      index = lineBreakEnd - 1;
      continue;
    }

    if (!SENTENCE_ENDINGS.has(character) || expectedClosers.length > 0) continue;

    let sentenceEnd = index + 1;
    while (sentenceEnd < text.length && /[\t \r\n]/u.test(text[sentenceEnd])) {
      sentenceEnd += 1;
    }
    const trailingText = text.slice(index + 1, sentenceEnd);
    pushUnit(sentenceEnd, 1, trailingText.includes('\n'));
    index = sentenceEnd - 1;
  }

  if (unitStart < text.length) {
    pushUnit(text.length, 0, false);
  }

  return units;
}

export function splitJapaneseText(
  text: string,
  options: JapaneseChunkingOptions = {}
): JapaneseTextChunk[] {
  if (!text) return [];

  const targetChars = clampPositiveInteger(options.targetChars, DEFAULT_TARGET_CHARS);
  const maxChars = Math.max(
    targetChars,
    clampPositiveInteger(options.maxChars, DEFAULT_MAX_CHARS)
  );
  const minChars = Math.min(
    targetChars,
    clampPositiveInteger(options.minChars, DEFAULT_MIN_CHARS)
  );
  const units = collectSemanticUnits(text);
  const chunks: JapaneseTextChunk[] = [];
  let chunkStart = units[0]?.start ?? 0;
  let chunkEnd = chunkStart;
  let sentenceCount = 0;

  const flushChunk = () => {
    if (chunkEnd <= chunkStart) return;
    const chunkText = text.slice(chunkStart, chunkEnd);
    chunks.push({
      text: chunkText,
      start: chunkStart,
      end: chunkEnd,
      sentenceCount,
      overLimit: chunkText.length > maxChars,
    });
    chunkStart = chunkEnd;
    sentenceCount = 0;
  };

  for (const unit of units) {
    const currentLength = chunkEnd - chunkStart;
    const combinedLength = unit.end - chunkStart;
    const appendsSmallTail = text.length - unit.start < minChars
      && combinedLength <= maxChars;
    const shouldFlushBeforeUnit = currentLength > 0 && (
      combinedLength > maxChars
      || (combinedLength > targetChars && currentLength >= minChars)
    ) && !appendsSmallTail;

    if (shouldFlushBeforeUnit) flushChunk();

    chunkEnd = unit.end;
    sentenceCount += unit.sentenceCount;

    const remainingLength = text.length - unit.end;
    const wouldLeaveSmallTail = remainingLength > 0
      && remainingLength < minChars
      && chunkEnd - chunkStart + remainingLength <= maxChars;
    if (
      unit.paragraphEnd
      && chunkEnd - chunkStart >= minChars
      && !wouldLeaveSmallTail
    ) {
      flushChunk();
    }
  }

  flushChunk();
  return chunks;
}

export function reconstructJapaneseChunks(chunks: JapaneseTextChunk[]): string {
  return chunks.map((chunk) => chunk.text).join('');
}
