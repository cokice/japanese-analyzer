export function escapeHtmlForMarkdown(text: string) {
  return text.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

export function preserveLineBreaksForMarkdown(text: string) {
  return text.replace(/\n/g, '<br />');
}

export function normalizeEscapedLineBreaks(text: string) {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\\\\r\\\\n/g, '\n')
    .replace(/\\r\\n/g, '\n')
    .replace(/\\\\n/g, '\n')
    .replace(/\\\\r/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n');
}

const MARKDOWN_HIGHLIGHT_SEPARATOR = '\u200b';

export function highlightMarkedTextForMarkdown(text: string) {
  const normalizedText = text
    .replace(/\*\*((?:【[^】]+】|「[^」]+」)+)\*\*/g, '$1')
    .replace(/】(?=【|「)/g, `】${MARKDOWN_HIGHLIGHT_SEPARATOR}`)
    .replace(/」(?=【|「)/g, `」${MARKDOWN_HIGHLIGHT_SEPARATOR}`);

  return normalizedText
    .replace(/【([^】]+)】/g, '**$1**')
    .replace(/「([^」]+)」/g, '**$1**')
    .replace(/\*\*\*\*/g, `**${MARKDOWN_HIGHLIGHT_SEPARATOR}**`);
}
