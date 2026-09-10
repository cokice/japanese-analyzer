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
