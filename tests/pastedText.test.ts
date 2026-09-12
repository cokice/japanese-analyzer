import assert from 'node:assert/strict';
import { normalizePastedText } from '../app/utils/pastedText';

const url = 'https://search.example/?p=%E3%81%A6&other=1';
assert.equal(normalizePastedText(`亀好き[てっちゃん](${url})です。`), '亀好きてっちゃんです。');
assert.equal(normalizePastedText('「算数では『0（レイ）』と言わないといけない。」\n\n次の段落。'), '「算数では『0（レイ）』と言わないといけない。」\n\n次の段落。');
assert.equal(normalizePastedText('# 見出し\n\n**太字**と*斜体*、`単語`。\n\n- 一つ\n- 二つ'), '見出し\n\n太字と斜体、単語。\n\n一つ\n二つ');
assert.equal(normalizePastedText('[**名前**](https://example.org/a_(b) "記事")です。'), '名前です。');
assert.equal(normalizePastedText('[名前][article]\n\n[article]: https://example.org'), '名前\n\n');
assert.equal(normalizePastedText(`参照：${url}。本文です。`), '参照：。本文です。');
assert.equal(normalizePastedText('https://example.org/a_(b)'), '');
assert.equal(normalizePastedText('文字\r\n次の行'), '文字\n次の行');
assert.equal(normalizePastedText(''), '');
