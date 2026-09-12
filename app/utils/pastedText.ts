import { fromMarkdown } from 'mdast-util-from-markdown';
import type { RootContent } from 'mdast';
import { protectAnalysisUrls } from './analysisUrls';

function markdownText(node: RootContent): string {
  if (node.type === 'definition' || node.type === 'thematicBreak') return '';
  if (node.type === 'image' || node.type === 'imageReference') return node.alt || '';
  if (node.type === 'break') return '\n';
  if ('value' in node) return node.value;
  if ('children' in node) {
    const separator = node.type === 'list' ? '\n' : node.type === 'listItem' || node.type === 'blockquote' ? '\n\n' : '';
    return node.children.map(child => markdownText(child as RootContent)).join(separator);
  }
  return '';
}

function htmlText(html: string): string {
  // A detached template keeps clipboard scripts, styles and resources inert.
  const template = document.createElement('template');
  template.innerHTML = html;
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
    if (!(node instanceof Element)) return Array.from(node.childNodes, walk).join('');
    if (node.matches('script, style, noscript, template, svg, [hidden], [aria-hidden="true"]')) return '';
    if (node.tagName === 'BR') return '\n';
    const text = Array.from(node.childNodes, walk).join('');
    if (/^(P|DIV|LI|UL|OL|BLOCKQUOTE|H[1-6]|SECTION|ARTICLE|TR|PRE)$/u.test(node.tagName)) return `\n${text}\n`;
    if (node.tagName === 'TD' || node.tagName === 'TH') return `${text}\t`;
    return text;
  };
  return walk(template.content).replace(/\n{3,}/gu, '\n\n').trim();
}

export function normalizePastedText(plainText: string, html = ''): string {
  const source = plainText.replace(/\r\n?/gu, '\n');
  if (html && typeof document !== 'undefined') {
    return protectAnalysisUrls(htmlText(html)).textWithoutUrls;
  }
  const root = fromMarkdown(source);
  // Keep the original paragraph separators when stripping Markdown formatting.
  let previousEnd = 0;
  const text = root.children.map(node => {
    const start = node.position?.start.offset ?? previousEnd;
    const gap = source.slice(previousEnd, start);
    previousEnd = node.position?.end.offset ?? start;
    return gap + markdownText(node);
  }).join('') + source.slice(previousEnd);
  return protectAnalysisUrls(text).textWithoutUrls;
}
