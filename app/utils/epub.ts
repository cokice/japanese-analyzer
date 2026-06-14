import JSZip from 'jszip';

export interface EpubSection {
  /** 段落原文 */
  text: string;
  /** 逐词解析条目，如 "下火（したび）になる：【惯用语】…" */
  words: string[];
  /** 该段中文译文 */
  translation: string;
}

export interface EpubContent {
  sections: EpubSection[];
}

/**
 * 构建 Epub 内 XHTML 内容。
 * 每段：序号标题 + 词条列表 + 译文注释，无框线极简样式。
 */
function buildXhtml(sections: EpubSection[]): string {
  const sectionsHtml = sections
    .map(
      (sec, i) => {
        const wordItems = sec.words
          .map((w) => `    <p class="word">${escapeXml(w)}</p>`)
          .join('\n');

        return `  <h1>${i + 1}. ${escapeXml(sec.text)}</h1>

${wordItems}

  <blockquote>${escapeXml(sec.translation)}</blockquote>`;
      }
    )
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
    h1 {
      font-size: 1.15em;
      font-weight: 600;
      margin: 1.4em 0 0.6em;
      color: #1f1b2e;
      border-bottom: 1px solid #e8e5f0;
      padding-bottom: 0.3em;
    }
    h1:first-of-type {
      margin-top: 0;
    }
    p.word {
      font-size: 1em;
      margin: 0;
      padding: 0.1em 0 0.1em 0.3em;
      color: #1f1b2e;
      line-height: 1.4;
    }
    blockquote {
      margin: 0.8em 0 0 0;
      padding: 0.3em 0 0.3em 0.8em;
      border-left: 3px solid #d5d0e0;
      font-size: 1em;
      color: #4b465c;
      font-style: normal;
    }
  </style>
</head>
<body>

${sectionsHtml}

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
  const xhtml = buildXhtml(content.sections);
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
