export const PROOFREAD_MAX_OUTPUT_TOKENS = 6_144;
export const PROOFREAD_REASONING_EFFORT = 'low' as const;
export const PROOFREAD_SENTENCE_TIMEOUT_MS = 60_000;
export const PROOFREAD_SENTENCE_CONCURRENCY = 2;
export const PROOFREAD_OVERALL_MIN_TIMEOUT_MS = 120_000;
export const PROOFREAD_OVERALL_PER_SENTENCE_MS = 15_000;

export type ProofreadField = 'seg' | 'pos' | 'kana';

export interface ProofreadDraftToken {
  word: string;
  pos: string;
  furigana?: string;
}

export interface ProofreadCorrection {
  indexes: number[];
  field: ProofreadField;
  correct: string;
  why: string;
}

export interface ProofreadPromptContext {
  previousSource?: string;
  nextSource?: string;
}

export interface ProofreadSentenceJob {
  sentenceIndex: number;
  source: string;
  tokens: ProofreadDraftToken[];
  tokenStart: number;
  tokenEnd: number;
  previousSource: string;
  nextSource: string;
}

const PROOFREAD_FIELDS = new Set<ProofreadField>(['seg', 'pos', 'kana']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractJsonText(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() || trimmed;
}

export function buildProofreadPrompt(
  source: string,
  tokens: readonly ProofreadDraftToken[],
  context: ProofreadPromptContext = {}
): string {
  const draftLines = tokens.map((token, index) => (
    `${index}\t${JSON.stringify(token.word)}\t${JSON.stringify(token.pos)}\t${JSON.stringify(token.furigana || '')}`
  )).join('\n');

  return `这是一次日语分词底稿的快速抽查，不是详尽校对。底稿来自可靠的解析器，绝大多数词元是正确的；默认正确、无需逐词确认，禁止逐项核对或全量验算。

仅审校“当前句”，检查范围仅限以下三类高风险点：
1. 複合词或专有名词的切分边界：field 为 "seg"；correct 使用全角竖线「｜」分隔正确词界。
2. 动词与助动词活用形的归属：field 为 "pos"；correct 只能是学校文法词性标签。
3. 多音汉字的注音选择：field 为 "kana"；correct 只能填写平假名读音。

其余类型不在检查范围，一律忽略。不要检查普通词的常规切分、一般词性或单一读音，也不要检查翻译、罗马音、文风或原文本身是否规范；不得纠正历史假名遣。

执行方式：快速通读一遍，仅对明显可疑处深入验证。没有明显错误即输出 []，不要为了找错而找错。发现明显错误后只报告该项，完成一遍抽查即停止，不得二次复查或扩展检查。推理中不得逐词复述底稿、罗列正确项目或解释全文。

输出必须是唯一一个严格有效的 JSON 数组。每项格式固定为：
{"index":0,"field":"seg"|"pos"|"kana","correct":"正确值","why":"十字内理由"}

多个词元需要合并或重切时，必须合并成一项：
{"indexes":[27,28],"field":"seg","correct":"東京|国際空港","why":"十字内理由"}

规则：
- index/indexes 使用当前句底稿中的零基局部索引。
- indexes 只用于 field="seg"，必须按升序列出相关词元；禁止把同一处切分逐个重复报告。
- why 不超过 10 个字符。
- 只输出确有错误的项目；没有错误时输出 []。
- 禁止输出全文、Markdown、前后说明、总结或任何 JSON 以外字符。
- 最终 JSON 必须尽量精简；输出后立即停止。

上一句（仅供参考，不审校）：
${JSON.stringify(context.previousSource || '')}

下一句（仅供参考，不审校）：
${JSON.stringify(context.nextSource || '')}

当前句原文（仅审校这一句）：
${JSON.stringify(source)}

当前句分词底稿（局部序号<TAB>词元<TAB>词性<TAB>假名）：
${draftLines}`;
}

const SENTENCE_TERMINATOR_PATTERN = /[。！？!?]/u;
const CLOSING_PUNCTUATION_PATTERN = /^[」』）】〕〉》”’"']+$/u;

export function splitProofreadSentenceJobs(
  source: string,
  tokens: readonly ProofreadDraftToken[]
): ProofreadSentenceJob[] {
  if (tokens.length === 0) return [];
  if (tokens.map((token) => token.word).join('') !== source) {
    throw new Error('审校分句前底稿未能完整还原原文');
  }

  const ranges: Array<{ start: number; end: number }> = [];
  let start = 0;
  let index = 0;
  while (index < tokens.length) {
    if (!SENTENCE_TERMINATOR_PATTERN.test(tokens[index].word)) {
      index += 1;
      continue;
    }

    let end = index + 1;
    while (
      end < tokens.length
      && CLOSING_PUNCTUATION_PATTERN.test(tokens[end].word)
    ) {
      end += 1;
    }
    ranges.push({ start, end });
    start = end;
    index = end;
  }

  if (start < tokens.length) {
    const trailingText = tokens.slice(start).map((token) => token.word).join('');
    if (ranges.length > 0 && !trailingText.trim()) {
      ranges[ranges.length - 1].end = tokens.length;
    } else {
      ranges.push({ start, end: tokens.length });
    }
  }

  const sentenceSources = ranges.map(({ start: tokenStart, end: tokenEnd }) => (
    tokens.slice(tokenStart, tokenEnd).map((token) => token.word).join('')
  ));

  return ranges.map(({ start: tokenStart, end: tokenEnd }, sentenceIndex) => ({
    sentenceIndex,
    source: sentenceSources[sentenceIndex],
    tokens: tokens.slice(tokenStart, tokenEnd).map((token) => ({ ...token })),
    tokenStart,
    tokenEnd,
    previousSource: sentenceIndex > 0 ? sentenceSources[sentenceIndex - 1] : '',
    nextSource: sentenceIndex + 1 < sentenceSources.length
      ? sentenceSources[sentenceIndex + 1]
      : '',
  }));
}

export function parseProofreadCorrections(
  content: string,
  tokenCount: number
): ProofreadCorrection[] {
  const parsed = JSON.parse(extractJsonText(content)) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('审校结果必须是 JSON 数组');
  }

  const corrections: ProofreadCorrection[] = [];
  const seen = new Set<string>();

  for (const item of parsed) {
    if (!isRecord(item)) continue;
    if (typeof item.field !== 'string' || !PROOFREAD_FIELDS.has(item.field as ProofreadField)) {
      continue;
    }
    const field = item.field as ProofreadField;
    const rawIndexes = Array.isArray(item.indexes)
      ? item.indexes
      : Number.isInteger(item.index)
        ? [item.index]
        : [];
    if (rawIndexes.length === 0 || rawIndexes.some((index) => !Number.isInteger(index))) continue;
    const indexes = [...new Set(rawIndexes as number[])].sort((left, right) => left - right);
    if (indexes.some((index) => index < 0 || index >= tokenCount)) continue;
    if (field !== 'seg' && indexes.length !== 1) continue;
    if (typeof item.correct !== 'string' || !item.correct.trim()) continue;
    if (typeof item.why !== 'string') continue;

    const key = `${indexes.join(',')}:${field}`;
    if (seen.has(key)) continue;
    seen.add(key);

    corrections.push({
      indexes,
      field,
      correct: item.correct.trim(),
      why: Array.from(item.why.trim()).slice(0, 10).join(''),
    });
  }

  const mergedCorrections: ProofreadCorrection[] = [];
  for (const correction of corrections) {
    if (correction.field !== 'seg') {
      mergedCorrections.push(correction);
      continue;
    }
    const duplicate = mergedCorrections.find((candidate) => (
      candidate.field === 'seg'
      && candidate.correct === correction.correct
      && candidate.indexes.some((index) => correction.indexes.some((other) => (
        Math.abs(index - other) <= 1
      )))
    ));
    if (!duplicate) {
      mergedCorrections.push(correction);
      continue;
    }
    duplicate.indexes = [...new Set([...duplicate.indexes, ...correction.indexes])]
      .sort((left, right) => left - right);
  }

  return mergedCorrections;
}

export function recoverTruncatedProofreadCorrections(
  content: string,
  tokenCount: number
): ProofreadCorrection[] | null {
  try {
    return parseProofreadCorrections(content, tokenCount);
  } catch {
    // 继续扫描截断数组中已经闭合的 JSON 对象。
  }

  const jsonText = extractJsonText(content);
  const arrayStart = jsonText.indexOf('[');
  if (arrayStart < 0) return null;

  const completeItems: unknown[] = [];
  let objectStart = -1;
  let objectDepth = 0;
  let inString = false;
  let escaped = false;

  for (let index = arrayStart + 1; index < jsonText.length; index += 1) {
    const character = jsonText[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === '{') {
      if (objectDepth === 0) objectStart = index;
      objectDepth += 1;
      continue;
    }
    if (character === '}' && objectDepth > 0) {
      objectDepth -= 1;
      if (objectDepth === 0 && objectStart >= 0) {
        try {
          completeItems.push(JSON.parse(jsonText.slice(objectStart, index + 1)) as unknown);
        } catch {
          // 单项无效时跳过，继续抢救后续完整项。
        }
        objectStart = -1;
      }
      continue;
    }
    if (character === ']' && objectDepth === 0) break;
  }

  if (completeItems.length === 0) return null;
  const recovered = parseProofreadCorrections(JSON.stringify(completeItems), tokenCount);
  return recovered.length > 0 ? recovered : null;
}
