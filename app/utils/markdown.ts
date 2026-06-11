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
