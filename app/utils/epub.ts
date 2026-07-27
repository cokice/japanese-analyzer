import JSZip from 'jszip';

export interface EpubSection {
  /** 段落原文 */
  text: string;
  /** 逐词解析条目，如 "下火（したび）になる：【惯用语】…" */
  words: string[];
  /** 该段中文译文 */
  translation: string;
  /** 该段中的中文引用（<quote> 标签内容），可选 */
  chineseQuotes?: string[];
}

export interface EpubMeta {
  generatedAt: string;
  sectionCount: number;
  totalChars: number;
}

/** 一篇文章的完整数据 */
export interface ArticleGroup {
  /** 文章标题，如 "（2024年7月N1）"；无标题时为空字符串 */
  title: string;
  sections: EpubSection[];
  meta: EpubMeta;
}

export interface EpubContent {
  articles: ArticleGroup[];
}

/**
 * 构建 Epub 内 XHTML 内容。
 * 多文章结构：每篇文章独立 H1 + 段落 + 回顾区。
 */
function buildXhtml(content: EpubContent): string {
  const { articles } = content;

  const articlesHtml = articles
    .map((article, ai) => {
      // 文章标题 H1（非首篇加分页符）
      const pageBreakClass = ai > 0 ? ' article-page-break' : '';
      const titleHtml = article.title
        ? `  <h1 class="context-title${pageBreakClass}">${escapeXml(article.title)}</h1>\n`
        : '';

      // 扉页 colophon
      const metaHtml = `  <div class="colophon">
    <p>生成日期：${escapeXml(article.meta.generatedAt)}</p>
    <p>段落数：${article.meta.sectionCount} 句</p>
    <p>总字数：${article.meta.totalChars} 字</p>
  </div>\n`;

      // 段落
      const sectionsHtml = article.sections
        .map((sec, si) => {
          const wordItems = sec.words
            .map((w) => `    <p class="word">${escapeXml(w)}</p>`)
            .join('\n');

          const longTitleClass = sec.text.length > 80 ? ' long-title' : '';

          const quoteBlocks = (sec.chineseQuotes ?? [])
            .map((q) => `  <blockquote class="chinese-quote">${escapeXml(q)}</blockquote>`)
            .join('\n');

          const translationBlock = sec.translation
            ? `  <blockquote>${escapeXml(sec.translation)}</blockquote>`
            : '';

          const secId = `s-${ai}-${si}`;
          const reviewId = `review-${ai}`;

          return `  <h2 id="${secId}" class="section-title${longTitleClass}">${escapeXml(sec.text)} <a href="#${reviewId}" class="to-review">&gt;&gt;</a></h2>

${wordItems}
${quoteBlocks ? quoteBlocks + '\n' : ''}${translationBlock}`;
        })
        .join('\n\n');

      // 回顾区
      const reviewId = `review-${ai}`;
      const reviewHtml = article.sections
        .map(
          (sec, si) =>
            `    <p class="review-line"><a href="#s-${ai}-${si}">${escapeXml(sec.text)}</a></p>`
        )
        .join('\n');

      return `${titleHtml}${metaHtml}
${sectionsHtml}

  <div id="${reviewId}" class="full-original">
    <h3>完整原文回顾</h3>
${reviewHtml}
  </div>`;
    })
    .join('\n\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="ja">
<head>
  <title>日语解析笔记</title>
  <style>
    body {
      font-family: "Noto Sans JP", "Hiragino Sans", system-ui, sans-serif;
      line-height: 1.65;
      padding: 1.2em 1em;
      color: #1f1b2e;
    }
    /* ---- 文章标题 H1 ---- */
    h1.context-title {
      font-size: 1.4em;
      font-weight: 700;
      color: #1f1b2e;
      margin: 0 0 0.2em;
      text-align: left;
    }
    h1.article-page-break {
      page-break-before: always;
    }
    /* ---- 扉页 ---- */
    .colophon {
      text-align: center;
      font-size: 1em;
      color: #4b465c;
      margin-bottom: 0.8em;
      page-break-after: always;
    }
    .colophon p {
      margin: 0.2em 0;
    }
    h2.section-title {
      font-size: 1.15em;
      font-weight: 600;
      margin: 1.4em 0 0.6em;
      color: #1f1b2e;
      border-bottom: 1px solid #e8e5f0;
      padding-bottom: 0.3em;
    }
    h2.section-title:first-of-type {
      margin-top: 0;
    }
    h2.long-title {
      page-break-before: always;
    }
    a.to-review {
      font-size: 0.7em;
      color: #a098b8;
      text-decoration: none;
      font-weight: 400;
    }
    p.word {
      font-size: 1em;
      margin: 0;
      padding: 0.15em 0 0.15em 0.3em;
      color: #1f1b2e;
      line-height: 1.35;
    }
    blockquote {
      margin: 0.8em 0 0 0;
      padding: 0.3em 0 0.3em 0.8em;
      border-left: 3px solid #d5d0e0;
      font-size: 1em;
      color: #4b465c;
      font-style: normal;
    }
    blockquote.chinese-quote {
      border-left: 3px solid #a0b8e8;
      color: #3b5078;
      white-space: pre-line;
    }
    /* ---- 文末回顾区 ---- */
    .full-original {
      margin-top: 2.5em;
      padding-top: 1em;
      border-top: 2px solid #e8e5f0;
    }
    .full-original h3 {
      font-size: 1.05em;
      font-weight: 600;
      color: #1f1b2e;
      margin-bottom: 0.8em;
    }
    .review-line {
      font-size: 1em;
      line-height: 1.8;
      margin: 0;
      color: #1f1b2e;
    }
    .review-line a {
      color: #1f1b2e;
      text-decoration: none;
      font-weight: 600;
    }
  </style>
</head>
<body>

${articlesHtml}

</body>
</html>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * 在浏览器端生成最小合规 Epub 文件 Blob。
 */
export async function generateEpubBlob(content: EpubContent): Promise<Blob> {
  const zip = new JSZip();

  // 1. mimetype — 必须无压缩且是第一个条目
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  // 2. META-INF/container.xml
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml" />
  </rootfiles>
</container>`
  );

  // 3. OEBPS/content.opf
  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" unique-identifier="book-id" xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>日语解析笔记</dc:title>
    <dc:language>ja</dc:language>
    <dc:identifier id="book-id">japanese-analyzer-notes</dc:identifier>
  </metadata>
  <manifest>
    <item id="content" href="content.xhtml" media-type="application/xhtml+xml" />
  </manifest>
  <spine>
    <itemref idref="content" />
  </spine>
</package>`
  );

  // 4. OEBPS/content.xhtml
  const xhtml = buildXhtml(content);
  zip.file('OEBPS/content.xhtml', xhtml);

  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
  return blob;
}

/**
 * 触发浏览器下载 Epub 文件。
 */
export function downloadEpub(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
