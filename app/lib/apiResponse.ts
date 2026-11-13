import { type TokenData, type WordDetailContext, type WordDetail, PHRASE_CATEGORIES } from './apiTypes';
import { getLocalRomaji } from '../utils/romaji';
import { normalizeEscapedLineBreaks } from '../utils/markdown';
import { InvalidResponseError } from '../utils/requestErrors';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractJsonText(content: string): string {
  const jsonMatch = content.match(/```(?:json)?\n([\s\S]*?)\n```/);
  if (jsonMatch && jsonMatch[1]) {
    return jsonMatch[1].trim();
  }

  return content.trim();
}

function normalizeTokenDataArray(parsed: unknown): TokenData[] {
  const rawTokens = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.tokens)
      ? parsed.tokens
      : null;

  if (!rawTokens) {
    throw new Error('解析结果缺少 tokens 数组');
  }

  const tokens = rawTokens
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .filter((item) => typeof item.word === 'string' && typeof item.pos === 'string')
    .map((item) => ({
      word: item.word as string,
      pos: item.pos as string,
      furigana: typeof item.furigana === 'string' ? item.furigana : '',
      romaji: getLocalRomaji(item.word as string, typeof item.furigana === 'string' ? item.furigana : '', item.pos as string),
    }));

  if (tokens.length === 0) {
    throw new Error('解析结果没有有效词项');
  }

  return tokens;
}

export function parseAnalyzeResponseContent(content: string): TokenData[] {
  return normalizeTokenDataArray(JSON.parse(extractJsonText(content)));
}

const requiredWordDetailFields = ['translation', 'dictionaryForm', 'explanation'] as const;

const optionalWordDetailFields = ['originalWord', 'pos', 'furigana', 'romaji', 'conjugation', 'example', 'exampleTranslation', 'category', 'breakdown'] as const;

const wordDetailFields = [...requiredWordDetailFields, ...optionalWordDetailFields] as const;

type WordDetailField = typeof wordDetailFields[number];

function decodeLooseJsonStringValue(value: string): string {
  let decoded = '';

  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char !== '\\') {
      decoded += char;
      continue;
    }

    const next = value[++i];
    if (next === undefined) {
      decoded += char;
      break;
    }

    if (next === 'n') decoded += '\n';
    else if (next === 'r') decoded += '\r';
    else if (next === 't') decoded += '\t';
    else if (next === 'b') decoded += '\b';
    else if (next === 'f') decoded += '\f';
    else if (next === '"' || next === '\\' || next === '/') decoded += next;
    else if (next === 'u') {
      const hex = value.slice(i + 1, i + 5);
      if (/^[0-9a-fA-F]{4}$/.test(hex)) {
        decoded += String.fromCharCode(parseInt(hex, 16));
        i += 4;
      } else {
        decoded += `\\${next}`;
      }
    } else {
      decoded += next;
    }
  }

  return decoded;
}

function parseLooseWordDetailObject(content: string): Record<WordDetailField, string> {
  const jsonText = extractJsonText(content);
  const objectStart = jsonText.indexOf('{');
  const objectEnd = jsonText.lastIndexOf('}');
  if (objectStart === -1 || objectEnd <= objectStart) {
    throw new Error('释义结果不是有效 JSON 对象');
  }

  const values: Partial<Record<WordDetailField, string>> = {};
  // 按实际字段顺序恢复，兼容精简响应和旧版词条。
  const fields = wordDetailFields.filter((field) =>
    (requiredWordDetailFields as readonly string[]).includes(field)
    || new RegExp(`"${field}"\\s*:`).test(jsonText))
    .sort((a, b) => jsonText.indexOf(`"${a}"`) - jsonText.indexOf(`"${b}"`));

  fields.forEach((field, index) => {
    const fieldPattern = new RegExp(`"${field}"\\s*:\\s*"`, 'm');
    const searchFrom = index === 0
      ? objectStart + 1
      : Math.max(
        objectStart + 1,
        ...fields
          .slice(0, index)
          .map((previousField) => jsonText.indexOf(`"${previousField}"`))
      );
    const fieldMatch = fieldPattern.exec(jsonText.slice(searchFrom));
    if (!fieldMatch || fieldMatch.index === undefined) {
      throw new Error(`释义结果缺少 ${field} 字段`);
    }

    const valueStart = searchFrom + fieldMatch.index + fieldMatch[0].length;
    let valueEnd = -1;

    if (index < fields.length - 1) {
      const nextFieldPattern = new RegExp(`"\\s*,\\s*"${fields[index + 1]}"\\s*:`, 'm');
      const nextFieldMatch = nextFieldPattern.exec(jsonText.slice(valueStart));
      if (nextFieldMatch && nextFieldMatch.index !== undefined) {
        valueEnd = valueStart + nextFieldMatch.index;
      }
    } else {
      valueEnd = jsonText.lastIndexOf('"', objectEnd);
    }

    if (valueEnd < valueStart) {
      throw new Error(`释义结果 ${field} 字段不完整`);
    }

    values[field] = decodeLooseJsonStringValue(jsonText.slice(valueStart, valueEnd));
  });

  const missingField = requiredWordDetailFields.find((field) => typeof values[field] !== 'string');
  if (missingField) {
    throw new Error(`释义结果缺少 ${missingField} 字段`);
  }

  return values as Record<WordDetailField, string>;
}

export function parseWordDetailResponseContent(content: string, context?: WordDetailContext): WordDetail {
  let parsed: unknown;
  try { parsed = JSON.parse(extractJsonText(content)); }
  catch { parsed = parseLooseWordDetailObject(content); }
  if (!isRecord(parsed)) throw new Error('释义结果不是有效 JSON 对象');
  for (const field of requiredWordDetailFields) {
    if (typeof parsed[field] !== 'string') throw new Error(`释义结果缺少 ${field} 字段`);
  }
  for (const field of optionalWordDetailFields) {
    if (parsed[field] !== undefined && typeof parsed[field] !== 'string') throw new Error(`释义结果 ${field} 必须是字符串`);
  }
  // DeepSeek 只保证返回 JSON 对象，不保证短语字段齐全；缺类别会让「合并为一个词」悄悄消失，按未完整生成处理
  if (context?.kind === 'phrase') {
    if (typeof parsed.category !== 'string' || !PHRASE_CATEGORIES.includes(parsed.category.trim())) {
      throw new Error('短语释义缺少有效的 category 字段');
    }
    if (typeof parsed.breakdown !== 'string') throw new Error('短语释义缺少 breakdown 字段');
  }
  const detail = parsed as Record<WordDetailField, string>;
  const originalWord = context?.word || detail.originalWord;
  if (!originalWord) throw new Error('释义结果缺少 originalWord 字段');
  const pos = detail.pos?.trim() || context?.pos || '';
  // 短语的读音用前端按词拼出的结果，比 AI 返回的更完整可靠
  const isPhrase = context?.kind === 'phrase';
  const furigana = isPhrase
    ? context?.furigana || detail.furigana?.trim() || ''
    : detail.furigana?.trim() || context?.furigana || '';
  return {
    originalWord, translation: detail.translation, pos, furigana,
    romaji: getLocalRomaji(originalWord, furigana, pos),
    dictionaryForm: detail.dictionaryForm,
    explanation: normalizeEscapedLineBreaks(detail.explanation),
    conjugation: normalizeEscapedLineBreaks(detail.conjugation || ''),
    example: normalizeEscapedLineBreaks(detail.example || ''),
    exampleTranslation: normalizeEscapedLineBreaks(detail.exampleTranslation || ''),
    ...(isPhrase ? {
      kind: 'phrase' as const,
      category: detail.category?.trim() || '',
      breakdown: normalizeEscapedLineBreaks(detail.breakdown || ''),
      mergeReading: detail.furigana?.trim() || '',
    } : {}),
  };
}

export function validateCompletion(result: unknown, label: string): void {
  if (!isRecord(result) || !Array.isArray(result.choices)) throw new InvalidResponseError(`${label}结果格式错误`);
  const choice = result.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message) || typeof choice.message.content !== 'string' || !choice.message.content.trim()) {
    throw new InvalidResponseError(`${label}结果格式错误`);
  }
  // Some compatible gateways omit the reason; explicit abnormal termination is never success.
  if (choice.finish_reason != null && choice.finish_reason !== 'stop') {
    throw new InvalidResponseError(getFinishReasonErrorMessage(String(choice.finish_reason), label));
  }
}

export function getFinishReasonErrorMessage(finishReason: string, label: string): string {
  if (finishReason === 'length') {
    return `${label}被上游模型截断（finish_reason: length），请重新生成。`;
  }

  if (finishReason === 'content_filter') {
    return `${label}被上游内容安全策略中止（finish_reason: content_filter）。`;
  }

  return `${label}未正常结束（finish_reason: ${finishReason}）。`;
}
