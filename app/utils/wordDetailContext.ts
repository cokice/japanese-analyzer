import { collectSemanticUnits } from './japaneseChunking';

const FULL_TEXT_LIMIT = 1000;
const NEIGHBOR_SENTENCES = 2;

/** Keep source offsets in UTF-16, but measure the threshold in Unicode characters. */
export function selectWordDetailContext(
  source: string,
  tokens: ReadonlyArray<{ word: string }>,
  selectedIndex: number
): string {
  if (Array.from(source).length <= FULL_TEXT_LIMIT) return source;
  if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= tokens.length) {
    return source;
  }

  // A streaming result may contain only a prefix. Never locate repeated words with indexOf.
  const prefix = tokens.slice(0, selectedIndex).map((token) => token.word).join('');
  const word = tokens[selectedIndex].word;
  if (!word || !source.startsWith(prefix + word)) return source;
  const start = prefix.length;
  const end = start + word.length;
  const units = collectSemanticUnits(source);
  const paragraphs: Array<{ start: number; end: number }> = [];
  let paragraphStart = 0;
  for (const unit of units) {
    if (unit.paragraphEnd || unit.end === source.length) {
      paragraphs.push({ start: paragraphStart, end: unit.end });
      paragraphStart = unit.end;
    }
  }
  const paragraph = paragraphs.find((range) => range.start <= start && range.end >= end);
  if (!paragraph) return source;
  const paragraphText = source.slice(paragraph.start, paragraph.end);
  if (Array.from(paragraphText).length <= FULL_TEXT_LIMIT) return paragraphText;

  // The existing splitter respects Japanese quotation marks and brackets.
  const sentences = units.filter((unit) => unit.start >= paragraph.start && unit.end <= paragraph.end);
  const sentenceIndex = sentences.findIndex((unit) => unit.start <= start && unit.end >= end);
  if (sentenceIndex < 0) return source;
  const first = sentences[Math.max(0, sentenceIndex - NEIGHBOR_SENTENCES)];
  const last = sentences[Math.min(sentences.length - 1, sentenceIndex + NEIGHBOR_SENTENCES)];
  return source.slice(first.start, last.end);
}
