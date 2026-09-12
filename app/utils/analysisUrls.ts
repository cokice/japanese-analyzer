// URLs are opaque data, not Japanese vocabulary. Keep their exact bytes locally
// so the model never has to tokenize or reproduce long percent-encoded queries.
export function protectAnalysisUrls(source: string) {
  let prefix = 'JAURL';
  while (source.includes(prefix)) prefix = `X${prefix}`;
  const spans: Array<{ start: number; end: number }> = [];
  for (const match of source.matchAll(/https?:\/\/[^\s<>"'「」『』（）。、！？\[\]]+/gu)) {
    const candidate = match[0];
    let end = candidate.length;
    let depth = 0;
    for (let index = 0; index < candidate.length; index++) {
      if (candidate[index] === '(') depth++;
      if (candidate[index] === ')' && --depth < 0) {
        end = index;
        break;
      }
    }
    const url = candidate.slice(0, end).replace(/[.,!?;:]+$/u, '');
    const start = match.index;
    const urlEnd = start + url.length;
    const labelStart = source.lastIndexOf('[', start - 2);
    if (source.slice(start - 2, start) === '](' && source[urlEnd] === ')'
      && labelStart >= (spans.at(-1)?.end ?? 0)
      && !/[\[\]\n]/u.test(source.slice(labelStart + 1, start - 2))) {
      // Preserve Markdown delimiters locally too; models otherwise sometimes
      // omit brackets as formatting. The visible link label stays analyzable.
      spans.push({ start: labelStart, end: labelStart + 1 });
      spans.push({ start: start - 2, end: urlEnd + 1 });
    } else {
      spans.push({ start, end: urlEnd });
    }
  }
  const urls: Array<{ marker: string; url: string }> = [];
  let cursor = 0;
  let text = '';
  for (const span of spans) {
    const marker = `${prefix}${urls.length}END`;
    urls.push({ marker, url: source.slice(span.start, span.end) });
    text += source.slice(cursor, span.start) + marker;
    cursor = span.end;
  }
  text += source.slice(cursor);

  return {
    text,
    textWithoutUrls: urls.reduce((value, { marker }) => value.replaceAll(marker, ''), text),
    hasUrls: urls.length > 0,
    instruction: urls.length
      ? `\n【链接占位符】\n${urls.map(({ marker }) => marker).join('、')} 是程序保留的链接占位符。每个占位符必须原样保留为一个独立词项，pos 为「記号」，furigana 为空；不得拆分、改写、省略或给它注音。周围的括号和链接标题照常保留。\n`
      : '',
    restoreContent(content: string): string {
      let restored = content;
      for (const { marker, url } of urls) {
        // Replace only a complete word value, never arbitrary JSON syntax or
        // partial output. JSON.stringify also preserves backslashes safely.
        restored = restored.replace(
          new RegExp(`("word"\\s*:\\s*)"${marker}"`, 'g'),
          (_match, field: string) => field + JSON.stringify(url)
        );
      }
      return restored;
    },
  };
}
