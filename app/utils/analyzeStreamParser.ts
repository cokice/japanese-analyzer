import type { TokenData } from '../services/api';
import { getLocalRomaji } from './romaji';

// 扫描新增字符，仅解析完整词项；兼容流式对象、裸数组和分块合并后的快照。
export class AnalyzeStreamParser {
  private cursor = 0;
  private tail = '';
  private inArray = false;
  private depth = 0;
  private inString = false;
  private escaped = false;
  private objectStart = -1;
  private tokens: TokenData[] = [];
  private snapshot: TokenData[] = [];

  push(content: string): TokenData[] {
    if (content.length < this.cursor || content.slice(Math.max(0, this.cursor - 32), this.cursor) !== this.tail) {
      this.cursor = 0; this.inArray = false; this.depth = 0;
      this.inString = false; this.escaped = false; this.objectStart = -1;
      this.tokens = []; this.snapshot = [];
    }
    let changed = false;
    for (; this.cursor < content.length; this.cursor++) {
      const char = content[this.cursor];
      if (!this.inArray) {
        if (char === '[') this.inArray = true;
        continue;
      }
      if (this.inString) {
        if (this.escaped) this.escaped = false;
        else if (char === '\\') this.escaped = true;
        else if (char === '"') this.inString = false;
        continue;
      }
      if (char === '"') this.inString = true;
      else if (char === '{') {
        if (this.depth++ === 0) this.objectStart = this.cursor;
      } else if (char === '}' && this.depth > 0 && --this.depth === 0) {
        try {
          const token = JSON.parse(content.slice(this.objectStart, this.cursor + 1));
          if (typeof token.word === 'string' && typeof token.pos === 'string') {
            const furigana = typeof token.furigana === 'string' ? token.furigana : '';
            this.tokens.push({word: token.word, pos: token.pos, furigana, romaji: getLocalRomaji(token.word, furigana, token.pos)});
            changed = true;
          }
        } catch { /* 完整响应仍由严格解析器验证。 */ }
      }
    }
    this.tail = content.slice(Math.max(0, this.cursor - 32), this.cursor);
    if (changed) this.snapshot = this.tokens.slice();
    return this.snapshot;
  }
}
