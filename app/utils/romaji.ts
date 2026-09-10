// 平文式罗马音；保留假名长音的元音拼写（ou / oo / uu），不用长音符号。
const kana: Record<string, string> = {};
const rows = [
  ['あいうえお', 'a i u e o'], ['かきくけこ', 'ka ki ku ke ko'],
  ['さしすせそ', 'sa shi su se so'], ['たちつてと', 'ta chi tsu te to'],
  ['なにぬねの', 'na ni nu ne no'], ['はひふへほ', 'ha hi fu he ho'],
  ['まみむめも', 'ma mi mu me mo'], ['やゆよ', 'ya yu yo'],
  ['らりるれろ', 'ra ri ru re ro'], ['わゐゑを', 'wa wi we o'],
  ['がぎぐげご', 'ga gi gu ge go'], ['ざじずぜぞ', 'za ji zu ze zo'],
  ['だぢづでど', 'da ji zu de do'], ['ばびぶべぼ', 'ba bi bu be bo'],
  ['ぱぴぷぺぽ', 'pa pi pu pe po'], ['ぁぃぅぇぉゃゅょゎゕゖゔ', 'a i u e o ya yu yo wa ka ke vu'],
];
for (const [letters, sounds] of rows) {
  [...letters].forEach((letter, index) => { kana[letter] = sounds.split(' ')[index]; });
}
for (const [letter, stem] of Object.entries({き:'ky',ぎ:'gy',し:'sh',じ:'j',ち:'ch',ぢ:'j',に:'ny',ひ:'hy',び:'by',ぴ:'py',み:'my',り:'ry'})) {
  for (const [small, vowel] of Object.entries({ゃ:'a',ゅ:'u',ょ:'o'})) kana[letter + small] = stem + vowel;
}
Object.assign(kana, {
  いぇ:'ye',うぃ:'wi',うぇ:'we',うぉ:'wo',しぇ:'she',じぇ:'je',ちぇ:'che',
  てぃ:'ti',でぃ:'di',とぅ:'tu',どぅ:'du',てゅ:'tyu',でゅ:'dyu',
  つぁ:'tsa',つぃ:'tsi',つぇ:'tse',つぉ:'tso',ふぁ:'fa',ふぃ:'fi',ふぇ:'fe',ふぉ:'fo',ふゅ:'fyu',
  ゔぁ:'va',ゔぃ:'vi',ゔぇ:'ve',ゔぉ:'vo',ゔゅ:'vyu',
  くぁ:'kwa',くぃ:'kwi',くぇ:'kwe',くぉ:'kwo',ぐぁ:'gwa',くゎ:'kwa',ぐゎ:'gwa',
});

export function toHiragana(text: string): string {
  return text.normalize('NFKC').replace(/[ァ-ヶ]/g, char => String.fromCharCode(char.charCodeAt(0) - 0x60));
}

export function kanaToRomaji(reading: string): string {
  let text = toHiragana(reading);
  text = text.replace(/([ぁ-ゔ])([ゝゞ])/g, (_, previous: string, mark: string) =>
    previous + (mark === 'ゞ' ? (previous + '\u3099').normalize('NFC') : previous));
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = kana[text.slice(i + 1, i + 3)] || kana[text[i + 1]] || '';
    if (char === 'っ') {
      // 活用片段「買っ」「待っ」在下一词前以 t 收尾。
      result += next ? (next.startsWith('ch') ? 't' : /^[bcdfghjklmpqrstvwxyz]/.test(next) ? next[0] : 'xtsu') : 't';
    } else if (char === 'ん') {
      result += /^[aeiouy]/.test(next) ? "n'" : 'n';
    } else if (char === 'ー') {
      result += /[aeiou]$/.test(result) ? result.slice(-1) : '-';
    } else if (kana[text.slice(i, i + 2)]) {
      result += kana[text.slice(i, i + 2)];
      i++;
    } else if (kana[char]) {
      result += kana[char];
    } else if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(char)) {
      return ''; // 未知读音不猜测，也不把汉字伪装成罗马音。
    } else {
      result += char;
    }
  }
  return result;
}

export function getLocalRomaji(word: string, reading = '', pos = ''): string {
  if (/記号|改行|标点|符号/.test(pos)) return '';
  if (/助詞|助词/.test(pos) && !/助動詞|助动词/.test(pos)) {
    if (word === 'は') return 'wa';
    if (word === 'へ') return 'e';
    if (word === 'を') return 'o';
  }
  return kanaToRomaji(reading.trim() || word);
}
