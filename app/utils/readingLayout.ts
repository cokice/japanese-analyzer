import type { TokenData } from '../services/api';

// 文节与禁则分组只改变排版，不改变原始分词和点击索引。
const LINE_START_PROHIBITED = /^[、。，．,.!?！？:：;；）)\]｝}」』】〉》〕〗〙〛ー々ゝゞヽヾぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ]/;
const LINE_END_PROHIBITED = /[（(\[｛{「『【〈《〔〖〘〚]$/;

export function groupReadingTokens(tokens: TokenData[]) {
  const groups: { token: TokenData; index: number }[][] = [];
  tokens.forEach((token, index) => {
    const previous = groups.at(-1);
    const last = previous?.at(-1)?.token;
    if (last && token.pos !== '改行' && last.pos !== '改行'
      && (LINE_START_PROHIBITED.test(token.word) || LINE_END_PROHIBITED.test(last.word)
        || /^助(?:詞|動詞)/u.test(token.pos)
        || (/^(?:名詞|代名詞)/u.test(last.pos) && /^動詞/u.test(token.pos) && /^(?:する|し|すれ|せ|さ)$/u.test(token.word))
        || (/(?:なければ|なくては|なきゃ|なくちゃ)$/u.test(previous!.map(item => item.token.word).join(''))
          && /^(?:なら|いけ)/u.test(token.word)))) {
      previous!.push({ token, index });
    } else {
      groups.push([{ token, index }]);
    }
  });
  return groups;
}

/**
 * 解析中的占位原文按同样的禁则分组：标点、小假名等不落在行首，开括号不留在行尾。
 * 这样占位时的换行位置与解析结果一致（词本身的边界此时还未知）。
 */
export function groupPendingChars(chars: string[]) {
  const groups: { char: string; index: number }[][] = [];
  chars.forEach((char, index) => {
    const previous = groups.at(-1);
    const last = previous?.at(-1)?.char;
    if (last && char !== '\n' && last !== '\n'
      && (LINE_START_PROHIBITED.test(char) || LINE_END_PROHIBITED.test(last))) {
      previous!.push({ char, index });
    } else {
      groups.push([{ char, index }]);
    }
  });
  return groups;
}

export function getReadingDensity(length: number): 'short' | 'medium' | 'long' {
  return length <= 40 ? 'short' : length <= 150 ? 'medium' : 'long';
}

/** 超长文节可在词间折行，但禁则标点仍和相邻词绑定。 */
export function groupReadingAttachments(group: { token: TokenData; index: number }[]) {
  const attachments: typeof group[] = [];
  for (const item of group) {
    const previous = attachments.at(-1);
    if (previous && (LINE_START_PROHIBITED.test(item.token.word)
      || LINE_END_PROHIBITED.test(previous.at(-1)!.token.word))) previous.push(item);
    else attachments.push([item]);
  }
  return attachments;
}
