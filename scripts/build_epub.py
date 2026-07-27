#!/usr/bin/env python3
"""
批量 EPUB 生成工具 —— 直接调用 DeepSeek API，多线程 + 断点续传。

读取 all_articles.json，多线程并发发送 body 给 DeepSeek 获取逐句解析，
合并 bodyCn / explainCn，每完成一篇即保存进度，全部完成后生成单个 EPUB。

用法:
    python scripts/build_epub.py
    python scripts/build_epub.py --workers 8     # 8 线程
    python scripts/build_epub.py --retry-failed   # 仅重试失败的篇目

需要: pip install requests
"""

import argparse
import json
import os
import re
import sys
import time
import zipfile
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from xml.sax.saxutils import escape as xml_escape

try:
    import requests
except ImportError:
    print("请先安装 requests: pip install requests")
    sys.exit(1)

# ── 配置 ─────────────────────────────────────────────
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
DEEPSEEK_API_URL = os.environ.get("DEEPSEEK_API_URL", "https://api.deepseek.com/chat/completions")
DEEPSEEK_MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-v4-flash")
DEFAULT_WORKERS = 5               # 默认并发线程数
SAVE_EVERY_N = 1                  # 每完成 N 篇保存一次（1=每篇都存）
INPUT_FILE = "all_articles.json"
PROGRESS_FILE = "build_progress.json"
OUTPUT_FILE = "output.epub"
REQUEST_TIMEOUT = 300
RETRY_COUNT = 3
MAX_TOKENS = 16384

# 线程安全锁（写进度文件用）
_PROGRESS_LOCK = threading.Lock()


def load_api_key() -> str:
    """加载 DeepSeek API key（优先环境变量，其次 .env.local）。"""
    key = DEEPSEEK_API_KEY.strip()
    if key:
        return key

    # 尝试从 .env.local 读取
    env_file = ".env.local"
    if os.path.exists(env_file):
        with open(env_file, "r", encoding="utf-8") as f:
            for line in f:
                m = re.match(r"^DEEPSEEK_API_KEY\s*=\s*(.+)", line.strip())
                if m:
                    return m.group(1).strip().strip('"').strip("'")

    print("未找到 DEEPSEEK_API_KEY。请设置环境变量或在 .env.local 中配置。")
    sys.exit(1)


# ── Quote 处理 ────────────────────────────────────────

QUOTE_RE = re.compile(r"<quote>([\s\S]*?)</quote>")


def extract_quotes(text: str) -> tuple[str, list[str]]:
    """提取 <quote> 标签内容，替换为 [Qn] 占位符。"""
    quotes: list[str] = []
    idx = [0]

    def replacer(m: re.Match) -> str:
        content = re.sub(r"^\n+|\n+$", "", m.group(1))
        quotes.append(content)
        result = f"[Q{idx[0]}]"
        idx[0] += 1
        return result

    cleaned = QUOTE_RE.sub(replacer, text)
    return cleaned, quotes


# ── AI Prompt ─────────────────────────────────────────


def build_prompt(body: str) -> str:
    return f"""你是一位专业的日语教师。请对以下日语文段进行逐句分解，用于制作日语学习 Epub。

严格按以下 JSON 格式返回，不要包含任何额外文字或 markdown 标记：

{{
  "sections": [
    {{
      "text": "一句完整的原文",
      "words": [
        "重点词汇（读音）：【词性标签】释义。",
        "重点短语（读音）：【词性标签】释义。"
      ],
      "translation": "这一句的中文翻译"
    }}
  ]
}}

分解规则：
1. 【以句子为最小单位】使用「。」「！」「？」等句末标点将原文拆分为独立的句子，每句话对应一个 section，按顺序编号
2. 每句话选取 3-6 个重点词汇、短语或语法点进行解释，优先选择 N2/N1 难度的表达
3. 词条格式：日语（假名读音）：【词性标签】释义——释义需简洁准确，用中文说明用法或含义
4. 词性标签使用中文：名词、动词、形容词、副词、助词、助动词、惯用语、接续词、连体词、接尾辞等
5. 翻译要求通顺自然的中文，保留原文语气，该句的关键语法结构应在译文中有所体现
6. 如遇换行符 \\n 分割的段落，视为句子边界处理，但不要在输出 text 中包含 \\n
7. 文本中的 [Q0] [Q1] 等是引用占位符，请原样保留在对应句子的 text 字段中，不要翻译或修改它们
8. 对容易出错或混淆的语法成分（如助词「は」「が」的区别、时态选择、敬语用法、自他动词等），在 words 数组中使用「⚠️易错：」前缀进行特别说明

待分解文段：
{body}"""


# ── API 调用 ──────────────────────────────────────────


def call_deepseek(body_text: str, index: int, api_key: str) -> list[dict] | None:
    """直接调用 DeepSeek API，返回 sections 列表。"""
    # 预处理 quote 标签
    cleaned_body, quotes = extract_quotes(body_text)

    prompt = build_prompt(cleaned_body)

    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": MAX_TOKENS,
        "stream": False,
        "thinking": {"type": "disabled"},
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    for attempt in range(RETRY_COUNT):
        try:
            resp = requests.post(
                DEEPSEEK_API_URL, json=payload, headers=headers, timeout=REQUEST_TIMEOUT
            )
            if resp.status_code != 200:
                print(f"  [{index}] HTTP {resp.status_code}，重试 {attempt + 1}/{RETRY_COUNT}")
                time.sleep(3 * (attempt + 1))
                continue

            data = resp.json()
            choices = data.get("choices", [])
            if not choices:
                print(f"  [{index}] 无 choices，重试 {attempt + 1}/{RETRY_COUNT}")
                time.sleep(2)
                continue

            content = choices[0].get("message", {}).get("content", "")
            content = re.sub(r"```json\s*|```", "", content).strip()
            parsed = json.loads(content)
            sections = parsed.get("sections", [])
            if not sections:
                print(f"  [{index}] sections 为空，重试 {attempt + 1}/{RETRY_COUNT}")
                time.sleep(2)
                continue

            # 后处理：提取 chineseQuotes，移除 [Qn]
            return _postprocess_sections(sections, quotes)

        except requests.Timeout:
            print(f"  [{index}] 超时，重试 {attempt + 1}/{RETRY_COUNT}")
            time.sleep(5 * (attempt + 1))
        except json.JSONDecodeError as e:
            print(f"  [{index}] JSON 解析失败: {e}")
            time.sleep(3 * (attempt + 1))
        except Exception as e:
            print(f"  [{index}] 错误: {e}")
            time.sleep(3 * (attempt + 1))

    print(f"  [{index}] 所有重试失败，跳过")
    return None


def _postprocess_sections(sections: list[dict], quotes: list[str]) -> list[dict]:
    """后处理：提取 chineseQuotes 到独立字段，移除 text 中的 [Qn] 占位符。"""
    if not quotes:
        return sections

    for sec in sections:
        text = sec.get("text", "")
        matches = re.findall(r"\[Q(\d+)\]", text)
        if matches:
            chinese_quotes = []
            for num_str in matches:
                idx = int(num_str)
                if 0 <= idx < len(quotes):
                    chinese_quotes.append(quotes[idx])
            if chinese_quotes:
                sec["chineseQuotes"] = chinese_quotes
            sec["text"] = re.sub(r"\s*\[Q\d+\]\s*", "", text)

    return sections


# ── 文件 I/O ──────────────────────────────────────────


def load_input(path: str) -> list[dict]:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    articles = data.get("articles", [])
    if not articles:
        raise ValueError("无 articles 数据")
    return articles


def load_progress(path: str) -> tuple[list[dict], int]:
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            prog = json.load(f)
        return prog.get("articles", []), prog.get("done", 0)
    return [], 0


def save_progress(path: str, articles: list[dict], done: int) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"articles": articles, "done": done}, f, ensure_ascii=False, indent=2)


# ── EPUB 生成 ─────────────────────────────────────────


def build_xhtml(articles: list[dict]) -> str:
    total_sections = sum(a.get("meta", {}).get("sectionCount", 0) for a in articles)
    total_chars = sum(a.get("meta", {}).get("totalChars", 0) for a in articles)
    today = datetime.now().strftime("%Y-%m-%d")

    global_colophon = f"""  <div class="colophon global-colophon">
    <p>日语解析笔记</p>
    <p>生成日期：{today}</p>
    <p>共 {len(articles)} 篇文章 · {total_sections} 句 · {total_chars} 字</p>
  </div>
"""

    articles_parts = []

    for ai, art in enumerate(articles):
        title = art.get("title", "")
        meta = art.get("meta", {})
        sections = art.get("sections", [])
        body_cn = art.get("bodyCn", "")
        explain_cn = art.get("explainCn", "")

        page_class = " article-page-break" if ai > 0 else ""
        title_html = (
            f'  <h1 class="context-title{page_class}">{xml_escape(title)}</h1>\n'
            if title else ""
        )

        sec_parts = []
        for si, sec in enumerate(sections):
            text = sec.get("text", "")
            words = sec.get("words", [])
            translation = sec.get("translation", "")
            quotes_list = sec.get("chineseQuotes", [])

            long_class = " long-title" if len(text) > 80 else ""
            sec_id = f"s-{ai}-{si}"
            review_id = f"review-{ai}"

            word_html = "\n".join(f'    <p class="word">{xml_escape(w)}</p>' for w in words)
            quote_html = "\n".join(
                f'  <blockquote class="chinese-quote">{xml_escape(q)}</blockquote>'
                for q in quotes_list
            )
            trans_html = (
                f'  <blockquote>{xml_escape(translation)}</blockquote>'
                if translation else ""
            )

            sec_parts.append(
                f"""  <h2 id="{sec_id}" class="section-title{long_class}">{xml_escape(text)} <a href="#{review_id}" class="to-review">&gt;&gt;</a></h2>

{word_html}
{quote_html + chr(10) if quote_html else ""}{trans_html}"""
            )

        sections_html = "\n\n".join(sec_parts)

        # bodyCn / explainCn
        extra = ""
        if body_cn:
            extra += f"""  <blockquote class="summary-block bodycn-block">
    <p class="summary-label">整段翻译</p>
    <p class="summary-text">{xml_escape(body_cn)}</p>
  </blockquote>
"""
        if explain_cn:
            extra += f"""  <blockquote class="summary-block explain-block">
    <p class="summary-label">答案解析</p>
    <p class="summary-text">{xml_escape(explain_cn)}</p>
  </blockquote>
"""

        # 回顾区
        rid = f"review-{ai}"
        review_lines = "\n".join(
            f'    <p class="review-line"><a href="#s-{ai}-{si}">{xml_escape(sec.get("text", ""))}</a></p>'
            for si, sec in enumerate(sections)
        )
        review_html = f"""  <div id="{rid}" class="full-original">
    <h3>完整原文回顾</h3>
{review_lines}
  </div>"""

        articles_parts.append(f"{title_html}\n{sections_html}\n{extra}\n{review_html}")

    articles_html = "\n\n".join(articles_parts)

    return f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="ja">
<head>
  <title>日语解析笔记</title>
  <style>
    body {{
      font-family: "Noto Sans JP", "Hiragino Sans", system-ui, sans-serif;
      line-height: 1.65;
      padding: 1.2em 1em;
      color: #1f1b2e;
    }}
    h1.context-title {{
      font-size: 1.4em;
      font-weight: 700;
      color: #1f1b2e;
      margin: 0 0 0.2em;
      text-align: left;
    }}
    h1.article-page-break {{ page-break-before: always; }}
    .colophon {{
      text-align: center;
      font-size: 1em;
      color: #4b465c;
      margin-bottom: 0.8em;
    }}
    .global-colophon {{
      page-break-after: always;
      margin-bottom: 1.5em;
      padding-bottom: 1em;
      border-bottom: 2px solid #e8e5f0;
    }}
    .colophon p {{ margin: 0.2em 0; }}
    h2.section-title {{
      font-size: 1.15em;
      font-weight: 600;
      margin: 1.4em 0 0.6em;
      color: #1f1b2e;
      border-bottom: 1px solid #e8e5f0;
      padding-bottom: 0.3em;
    }}
    h2.section-title:first-of-type {{ margin-top: 0; }}
    h2.long-title {{ page-break-before: always; }}
    a.to-review {{
      font-size: 0.7em;
      color: #a098b8;
      text-decoration: none;
      font-weight: 400;
    }}
    p.word {{
      font-size: 1em;
      margin: 0;
      padding: 0.15em 0 0.15em 0.3em;
      color: #1f1b2e;
      line-height: 1.35;
    }}
    blockquote {{
      margin: 0.8em 0 0 0;
      padding: 0.3em 0 0.3em 0.8em;
      border-left: 3px solid #d5d0e0;
      font-size: 1em;
      color: #4b465c;
      font-style: normal;
    }}
    blockquote.chinese-quote {{
      border-left: 3px solid #a0b8e8;
      color: #3b5078;
      white-space: pre-line;
    }}
    .summary-block {{
      margin: 1.2em 0 0 0;
      padding: 0.5em 0 0.5em 0.8em;
      border-left: 4px solid #9c7cb8;
      font-size: 1em;
      color: #3b3b4e;
    }}
    .explain-block {{ border-left-color: #7cb89c; }}
    .summary-label {{
      font-weight: 700;
      font-size: 0.9em;
      color: #6b5b7e;
      margin: 0 0 0.3em;
    }}
    .summary-text {{ margin: 0; white-space: pre-line; }}
    .full-original {{
      margin-top: 2.5em;
      padding-top: 1em;
      border-top: 2px solid #e8e5f0;
    }}
    .full-original h3 {{
      font-size: 1.05em;
      font-weight: 600;
      color: #1f1b2e;
      margin-bottom: 0.8em;
    }}
    .review-line {{
      font-size: 1em;
      line-height: 1.8;
      margin: 0;
      color: #1f1b2e;
    }}
    .review-line a {{
      color: #1f1b2e;
      text-decoration: none;
      font-weight: 600;
    }}
  </style>
</head>
<body>

{global_colophon}
{articles_html}

</body>
</html>"""


def generate_epub(xhtml: str, output_path: str) -> None:
    container_xml = """<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml" />
  </rootfiles>
</container>"""

    opf_xml = """<?xml version="1.0" encoding="UTF-8"?>
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
</package>"""

    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("mimetype", "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        zf.writestr("META-INF/container.xml", container_xml)
        zf.writestr("OEBPS/content.opf", opf_xml)
        zf.writestr("OEBPS/content.xhtml", xhtml.encode("utf-8"))

    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"\nEPUB 已生成: {output_path} ({size_mb:.1f} MB)")


# ── 主流程 ────────────────────────────────────────────


def process_one(art: dict, index: int, total: int, api_key: str) -> dict:
    """处理单篇文章（线程安全）。返回带 sections 的 result dict。"""
    title = art.get("title", "")
    body = art.get("body", "").strip()

    sections = call_deepseek(body, index, api_key)
    if sections is None:
        sections = []  # 失败用空列表占位

    total_chars = sum(len(s.get("text", "")) for s in sections)
    result = {
        "title": title,
        "bodyCn": art.get("bodyCn", ""),
        "explainCn": art.get("explainCn", ""),
        "sections": sections,
        "meta": {
            "generatedAt": datetime.now().strftime("%Y-%m-%d"),
            "sectionCount": len(sections),
            "totalChars": total_chars,
        },
    }
    ok = len(sections) > 0
    return {"index": index - 1, "result": result, "ok": ok}


def _thread_safe_save(progress_file: str, processed_map: dict[int, dict], total: int) -> int:
    """线程安全写入进度文件，返回已完成的 article 数量。"""
    with _PROGRESS_LOCK:
        articles_list = [
            processed_map[i]
            for i in sorted(processed_map.keys())
        ]
        done = len(articles_list)
        save_progress(progress_file, articles_list, done)
        return done


def main():
    parser = argparse.ArgumentParser(description="批量 EPUB 生成")
    parser.add_argument("--workers", type=int, default=DEFAULT_WORKERS,
                        help=f"并发线程数（默认 {DEFAULT_WORKERS}）")
    parser.add_argument("--retry-failed", action="store_true",
                        help="仅重试进度文件中 sections 为空的篇目")
    args = parser.parse_args()

    api_key = load_api_key()
    articles = load_input(INPUT_FILE)
    total = len(articles)

    print(f"API: {DEEPSEEK_API_URL}")
    print(f"Model: {DEEPSEEK_MODEL}")
    print(f"线程数: {args.workers}")
    print(f"共 {total} 篇文章\n")

    # ── 断点续传 ──
    processed_map: dict[int, dict] = {}

    if args.retry_failed:
        # 仅重试失败篇目
        prev, _ = load_progress(PROGRESS_FILE)
        failed_indices = []
        for i, art in enumerate(prev):
            if not art.get("sections"):
                failed_indices.append(i)
            else:
                processed_map[i] = art
        pending = [i for i in range(total) if i in failed_indices]
        print(f"重试模式: {len(failed_indices)} 篇失败，已完成 {len(processed_map)} 篇\n")
    else:
        prev, done_count = load_progress(PROGRESS_FILE)
        for i, art in enumerate(prev):
            processed_map[i] = art
        pending = list(range(done_count, total))
        if done_count > 0:
            print(f"从进度恢复: 已完成 {done_count}/{total}\n")

    # ── 多线程处理 ──
    if not pending:
        print("所有文章已处理完毕。")
    else:
        completed_since_save = 0
        active = len(pending)
        print(f"待处理: {active} 篇\n")

        with ThreadPoolExecutor(max_workers=args.workers) as executor:
            futures = {}
            for idx in pending:
                art = articles[idx]
                fut = executor.submit(process_one, art, idx + 1, total, api_key)
                futures[fut] = idx

            for fut in as_completed(futures):
                idx = futures[fut]
                try:
                    data = fut.result()
                except Exception as e:
                    print(f"[{idx + 1}/{total}] 线程异常: {e}")
                    processed_map[idx] = {
                        "title": articles[idx].get("title", ""),
                        "bodyCn": articles[idx].get("bodyCn", ""),
                        "explainCn": articles[idx].get("explainCn", ""),
                        "sections": [],
                        "meta": {"generatedAt": "", "sectionCount": 0, "totalChars": 0},
                    }
                else:
                    processed_map[idx] = data["result"]
                    status = "OK" if data["ok"] else "FAIL"
                    art = data["result"]
                    n_sec = len(art["sections"])
                    print(f"[{idx + 1}/{total}] {status} {art['title']} ({n_sec} 句)")

                # 每完成一篇即保存进度
                completed_since_save += 1
                done = _thread_safe_save(PROGRESS_FILE, processed_map, total)
                if completed_since_save % 10 == 0:
                    print(f"  ── 进度已保存 ({done}/{total})")

        # 最终保存
        _thread_safe_save(PROGRESS_FILE, processed_map, total)

    # ── 生成 EPUB ──
    all_results = [processed_map[i] for i in sorted(processed_map.keys())]
    valid = [a for a in all_results if a.get("sections")]
    skipped = len(all_results) - len(valid)

    if not valid:
        print("\n没有有效文章，无法生成 EPUB。")
        print(f"进度文件保留在 {PROGRESS_FILE}，修复后可重试。")
        sys.exit(1)

    print(f"\n有效 {len(valid)} 篇" + (f"，跳过 {skipped} 篇" if skipped else "") + "，生成 EPUB ...")
    xhtml = build_xhtml(valid)
    generate_epub(xhtml, OUTPUT_FILE)

    if os.path.exists(PROGRESS_FILE):
        os.remove(PROGRESS_FILE)

    print("完成！")


if __name__ == "__main__":
    main()
