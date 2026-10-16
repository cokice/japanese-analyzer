'use client';
import { createElement, Fragment, type ReactNode } from 'react';
import type { DictionaryContent as Content } from '../lib/dictionary';
import { useLanguage } from '../contexts/LanguageContext';

const allowed = new Set(['div', 'span', 'p', 'small', 'li', 'ul', 'ol', 'ruby', 'rt', 'a', 'table', 'tr', 'td', 'th', 'br']);
const formMarkers: Record<string, [string, string]> = { 'form-valid': ['○', '标准写法'], 'form-pri': ['★', '常用写法'], 'form-rare': ['△', '少见写法'], 'form-special': ['◇', '特殊写法'], 'form-irr': ['!', '不规则写法'], 'form-out': ['×', '旧时写法'], 'form-old': ['旧', '旧字形'] };
export function DictionaryContent({ content }: { content: Content }) {
  const { t } = useLanguage();
  function render(node: Content, key = 'root'): ReactNode {
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) return node.map((child, i) => <Fragment key={`${key}:${i}`}>{render(child, `${key}:${i}`)}</Fragment>);
    if (node.tag === 'img' && /^[a-f0-9]{64}$/.test(node.asset || '')) {
      const Container = node.glyph ? 'span' : 'figure';
      const Caption = node.glyph ? 'span' : 'figcaption';
      return <Container>
      {/* Local hash-verified images need no Next image optimization or remote fetch. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={node.glyph ? 'dictionary-glyph' : undefined} src={`/api/dictionary/assets/${node.asset}`} alt={node.alt || t('词典字形或插图')} loading="lazy" onError={e => { e.currentTarget.hidden = true; const caption = e.currentTarget.nextElementSibling; if (caption) caption.removeAttribute('hidden'); }} />
      <Caption hidden role="status">{t('词典图片暂不可用，请重试')}</Caption>
    </Container>;
    }
    if (!allowed.has(node.tag)) return <span>{t('词典内容格式不受支持')}</span>;
    const props: Record<string, unknown> = { lang: node.lang, title: node.title, 'data-content': node.role, className: node.label === 'tag' ? 'dictionary-content-tag' : undefined };
    if (node.tag === 'a') {
      const url = node.href && /^https?:\/\//.test(node.href) ? node.href : undefined;
      if (url) Object.assign(props, { href: url, target: '_blank', rel: 'noreferrer' });
    }
    if (node.tag === 'td' || node.tag === 'th') Object.assign(props, { colSpan: node.colSpan, rowSpan: node.rowSpan });
    if (node.tag === 'table') return <div className="dictionary-table-scroll"><table {...props}><tbody>{node.content === undefined ? null : render(node.content, key)}</tbody></table></div>;
    const marker = node.label && formMarkers[node.label];
    return createElement(node.tag, props, marker ? <><span title={t(marker[1])} aria-label={t(marker[1])}>{marker[0]}</span>{node.content === undefined ? null : render(node.content, key)}</> : node.content === undefined ? undefined : render(node.content, key));
  }
  return <div className="dictionary-rich-content">{render(content)}</div>;
}

// A short first view; the full safe tree remains available at node boundaries.
export function dictionaryGlosses(content: Content): string[] {
  const text = (node: Content): string => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : node.content === undefined ? '' : text(node.content);
  const glosses: string[] = [];
  function visit(node: Content) {
    if (typeof node === 'string') return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (node.role === 'glossary') { glosses.push((Array.isArray(node.content) ? node.content : [node.content ?? '']).map(text).join('；')); return; }
    if (node.tag === 'p') { glosses.push(text(node)); return; }
    if (node.role === 'extra-info') return;
    if (node.content !== undefined) visit(node.content);
  }
  visit(content); return glosses;
}
