"""从已核对的公开来源构建离线检索文本，不依赖第三方包。"""

from __future__ import annotations

import html
import json
import re
import urllib.request
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin


ROOT = Path(__file__).resolve().parents[1]
USER_AGENT = "ContradictionAnalyzer/0.2 (local research corpus)"


def download(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=35) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        content = response.read()
    return content.decode(charset, errors="replace")


class ParagraphParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.active = False
        self.skip_depth = 0
        self.parts: list[str] = []
        self.paragraphs: list[str] = []
        self.ignored = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style", "nav"}:
            self.skip_depth += 1
        if tag in {"p", "h2", "h3", "h4"} and not self.skip_depth:
            # 旧版 HTML 中部分 <p> 未闭合，新段开始时仍须结束上一段。
            self.flush()
            self.active = True
            attributes = dict(attrs)
            self.ignored = any(value in (attributes.get("class") or "").split()
                               for value in {"title", "toc", "index", "indexa", "footer", "information"})

    def handle_endtag(self, tag: str) -> None:
        if tag in {"p", "h2", "h3", "h4"}:
            self.flush()
        if tag in {"script", "style", "nav"} and self.skip_depth:
            self.skip_depth -= 1

    def handle_data(self, data: str) -> None:
        if self.active and not self.skip_depth:
            self.parts.append(data)

    def flush(self) -> None:
        if self.active:
            value = re.sub(r"\s+", " ", "".join(self.parts)).strip()
            if len(value) >= 25 and not self.ignored:
                self.paragraphs.append(value)
        self.parts = []
        self.active = False
        self.ignored = False


def parse_paragraphs(page: str) -> list[str]:
    parser = ParagraphParser()
    parser.feed(page)
    # 网页底部的转载/导航说明不作为经典原文入库。
    return [p for p in parser.paragraphs if not p.startswith(("Source:", "Public Domain:"))]


def chapter_urls(index_url: str, pattern: str) -> list[str]:
    page = download(index_url)
    paths = re.findall(r'href=["\']([^"\']+)["\']', page, re.I)
    urls = {urljoin(index_url, html.unescape(path)) for path in paths}
    matched = sorted(url for url in urls if re.search(pattern, url, re.I))
    if not matched:
        raise RuntimeError(f"没有找到章节链接：{index_url}")
    return matched


def add_html_work(
    entries: list[dict[str, str]], title: str, author: str,
    index_url: str, pattern: str, prefix: str,
) -> None:
    urls = chapter_urls(index_url, pattern)
    for number, url in enumerate(urls, 1):
        page = download(url)
        paragraphs = parse_paragraphs(page)
        if len(paragraphs) < 2:
            raise RuntimeError(f"章节正文为空：{url}")
        chapter = re.search(r"<h[234][^>]*>(.*?)</h[234]>", page, re.I | re.S)
        heading = re.sub(r"<[^>]+>", " ", chapter.group(1)) if chapter else f"Chapter {number}"
        heading = re.sub(r"\s+", " ", html.unescape(heading)).strip()
        for paragraph_number, paragraph in enumerate(paragraphs, 1):
            entries.append({
                "id": f"{prefix}-{number}-{paragraph_number}", "title": title,
                "author": author, "chapter": heading, "url": url,
                "text": paragraph, "kind": "原文（英语译本）",
            })
        print(f"已收录 {title} {number}/{len(urls)}：{len(paragraphs)} 段")


def add_manifesto(entries: list[dict[str, str]]) -> None:
    url = "https://www.gutenberg.org/ebooks/61.txt.utf-8"
    source = download(url)
    start = source.find("*** START OF THE PROJECT GUTENBERG EBOOK")
    end = source.find("*** END OF THE PROJECT GUTENBERG EBOOK")
    if start < 0 or end < 0:
        raise RuntimeError("《共产党宣言》下载文本缺少起止标记")
    content = source[source.find("\n", start) + 1:end]
    paragraphs = [re.sub(r"\s+", " ", p).strip() for p in re.split(r"\n\s*\n", content)]
    paragraphs = [p for p in paragraphs if len(p) >= 25]
    for index, paragraph in enumerate(paragraphs, 1):
        entries.append({"id": f"manifesto-{index}", "title": "共产党宣言",
                        "author": "马克思、恩格斯", "chapter": "1888 年英语译本",
                        "url": "https://www.gutenberg.org/ebooks/61", "text": paragraph,
                        "kind": "原文（英语译本）"})
    print(f"已收录《共产党宣言》：{len(paragraphs)} 段")


def main() -> None:
    entries: list[dict[str, str]] = []
    add_manifesto(entries)
    add_html_work(entries, "资本论·第一卷", "马克思",
                  "https://www.marxists.org/archive/marx/works/1867-c1/",
                  r"/1867-c1/ch\d+\.htm$", "capital1")
    add_html_work(entries, "国家与革命", "列宁",
                  "https://www.marxists.org/archive/lenin/works/1917/staterev/",
                  r"/1917/staterev/ch\d+\.htm$", "state-revolution")
    add_html_work(entries, "帝国主义是资本主义的最高阶段", "列宁",
                  "https://www.marxists.org/archive/lenin/works/1916/imp-hsc/",
                  r"/1916/imp-hsc/ch\d+\.htm$", "imperialism")
    stalin_url = "https://www.marxists.org/reference/archive/stalin/works/1926/01/25.htm"
    for index, paragraph in enumerate(parse_paragraphs(download(stalin_url)), 1):
        entries.append({"id": f"stalin-{index}", "title": "论列宁主义的几个问题",
                        "author": "斯大林", "chapter": "斯大林著作第八卷（1926）",
                        "url": stalin_url, "text": paragraph, "kind": "原文（英语译本）"})
    print("已收录《论列宁主义的几个问题》")
    # 毛泽东中文网页未见单篇明确转载许可，仅收录可核对的短引与原文入口。
    entries.append({
        "id": "mao-contradiction-short", "title": "矛盾论", "author": "毛泽东",
        "chapter": "毛泽东选集第一卷（1937）；短引",
        "url": "https://www.marxists.org/chinese/maozedong/marxist.org-chinese-mao-193708.htm",
        "text": "事物的矛盾法则，即对立统一的法则",
        "kind": "原文短引（中文）",
    })
    entries.extend([
        {"id": "mao-practice-short", "title": "实践论", "author": "毛泽东",
         "chapter": "毛泽东选集第一卷（1937）；短引",
         "url": "https://www.marxists.org/chinese/maozedong/marxist.org-chinese-mao-193707.htm",
         "text": "真理的标准只能是社会的实践。", "kind": "原文短引（中文）"},
        {"id": "mao-classes-short", "title": "中国社会各阶级的分析", "author": "毛泽东",
         "chapter": "毛泽东选集第一卷（1925）；短引",
         "url": "https://www.marxists.org/chinese/maozedong/marxist.org-chinese-mao-19251201.htm",
         "text": "谁是我们的敌人？谁是我们的朋友？", "kind": "原文短引（中文）"},
    ])
    output = ROOT / "corpus.js"
    output.write_text("// 自动生成的离线原文索引；来源与范围详见 docs/文献来源.md。\n"
                      + "window.CLASSIC_CORPUS = " + json.dumps(entries, ensure_ascii=False, separators=(",", ":"))
                      + ";\n", encoding="utf-8")
    print(f"完成：{len(entries)} 段，{output.stat().st_size} 字节")


if __name__ == "__main__":
    main()
