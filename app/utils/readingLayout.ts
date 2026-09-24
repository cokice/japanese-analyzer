import type { TokenData } from '../services/api';

// 将禁则标点与相邻词放在同一换行单元中，不改变原始分词及点击索引。
const LINE_START_PROHIBITED = /^[、。，．,.!?！？:：;；）)\]｝}」』】〉》〕〗〙〛ー々ゝゞヽヾぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ]/;
const LINE_END_PROHIBITED = /[（(\[｛{「『【〈《〔〖〘〚]$/;

export function groupReadingTokens(tokens: TokenData[]) {
  const groups: { token: TokenData; index: number }[][] = [];
  tokens.forEach((token, index) => {
    const previous = groups.at(-1);
    const last = previous?.at(-1)?.token;
    if (last && token.pos !== '改行' && last.pos !== '改行'
      && (LINE_START_PROHIBITED.test(token.word) || LINE_END_PROHIBITED.test(last.word))) {
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
