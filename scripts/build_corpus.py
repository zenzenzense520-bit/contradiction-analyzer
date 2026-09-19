"""从中文马克思主义文库的作者白名单构建原著定位索引。"""
from __future__ import annotations
import html, json, re, urllib.request
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urldefrag, urljoin

ROOT = Path(__file__).resolve().parents[1]
USER_AGENT = "ContradictionAnalyzer/0.3 (source locator)"

class TextParser(HTMLParser):
    """兼容文库旧式未闭合 HTML，保留正文段落。"""
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.active = False; self.in_body = False; self.skip_depth = 0; self.ignored = False
        self.parts: list[str] = []; self.blocks: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "body": self.in_body = True; self.active = True
        if tag in {"script", "style", "nav"}: self.skip_depth += 1
        if tag in {"p", "h1", "h2", "h3", "h4", "li"} and not self.skip_depth:
            self.flush(); self.active = True
            classes = (dict(attrs).get("class") or "").split()
            self.ignored = any(value in classes for value in {"footer", "information", "toplink", "menu", "index"})
        elif tag in {"br", "hr"} and self.in_body and not self.skip_depth:
            self.flush(); self.active = True

    def handle_endtag(self, tag: str) -> None:
        if tag in {"p", "h1", "h2", "h3", "h4", "li"}:
            self.flush(); self.active = self.in_body
        if tag == "body": self.flush(); self.in_body = False
        if tag in {"script", "style", "nav"} and self.skip_depth: self.skip_depth -= 1

    def handle_data(self, data: str) -> None:
        if self.active and not self.skip_depth: self.parts.append(data)

    def flush(self) -> None:
        if self.active:
            value = re.sub(r"\s+", " ", "".join(self.parts)).strip()
            if len(value) >= 12 and not self.ignored: self.blocks.append(value)
        self.parts = []; self.active = False; self.ignored = False

def download(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=40) as response:
        content = response.read(); charset = response.headers.get_content_charset()
    for encoding in [charset, "utf-8", "gb18030"]:
        if not encoding: continue
        try:
            page = content.decode(encoding)
            if page.count("�") < 3: return page
        except UnicodeDecodeError: continue
    return content.decode("utf-8", errors="replace")

def page_links(index_url: str, pattern: str) -> list[str]:
    paths = re.findall(r'href=["\']([^"\']+)["\']', download(index_url), re.I)
    urls = {urldefrag(urljoin(index_url, html.unescape(path)))[0] for path in paths}
    return sorted(url for url in urls if re.search(pattern, url, re.I))

def page_title(page: str, fallback: str) -> str:
    match = re.search(r"<title[^>]*>(.*?)</title>", page, re.I | re.S)
    if not match: return fallback
    value = re.sub(r"<[^>]+>", " ", match.group(1))
    return re.sub(r"\s+", " ", html.unescape(value)).strip()[:120] or fallback

def add_pages(entries: list[dict[str, object]], author: str, work: str,
              urls: list[str], prefix: str) -> None:
    if not urls: raise RuntimeError(f"没有找到《{work}》页面")
    for page_number, url in enumerate(urls, 1):
        page = download(url); parser = TextParser(); parser.feed(page)
        if not parser.blocks: raise RuntimeError(f"正文为空：{url}")
        location = page_title(page, f"第 {page_number} 页")
        for paragraph_number, text in enumerate(parser.blocks, 1):
            entries.append({"id": f"{prefix}-{page_number}-{paragraph_number}",
                "author": author, "title": work, "location": location,
                "page": page_number, "paragraph": paragraph_number,
                "url": url, "text": text, "language": "中文", "translation": False})
        print(f"已收录 {author}《{work}》{page_number}/{len(urls)}：{len(parser.blocks)} 段")

def single(entries: list[dict[str, object]], author: str, work: str, url: str, prefix: str) -> None:
    add_pages(entries, author, work, [url], prefix)

def main() -> None:
    entries: list[dict[str, object]] = []
    single(entries, "马克思、恩格斯", "共产党宣言", "https://www.marxists.org/chinese/marx/01.htm", "manifesto")
    capital = "https://www.marxists.org/chinese/marx/capital/index.htm"
    add_pages(entries, "马克思", "资本论·第一卷", page_links(capital, r"/capital/\d{2}\.htm$"), "capital")
    single(entries, "马克思", "雇佣劳动与资本", "https://www.marxists.org/chinese/marx/mia-chinese-marx-1847-1849.htm", "wage-labour")
    single(entries, "马克思", "工资、价格和利润", "https://www.marxists.org/chinese/marx/marxist.org-chinese-marx-1865-5.htm", "wages-price")
    single(entries, "马克思", "哥达纲领批判", "https://www.marxists.org/chinese/marx/marxist.org-chinese-marx-1875-4.htm", "gotha")
    single(entries, "恩格斯", "共产主义原理", "https://www.marxists.org/chinese/engels/marxist.org-chinese-engels-1847a.htm", "principles")
    socialism = "https://www.marxists.org/chinese/engels/1880/index.htm"
    socialism_pages = [socialism] + page_links(socialism, r"/engels/1880/\d+\.htm$")
    add_pages(entries, "恩格斯", "社会主义从空想到科学的发展", list(dict.fromkeys(socialism_pages)), "socialism")
    single(entries, "恩格斯", "家庭、私有制和国家的起源", "https://www.marxists.org/chinese/engels/marxist.org-chinese-engels-1884-3.htm", "family")
    state = "https://www.marxists.org/chinese/lenin/191708-09/index.htm"
    add_pages(entries, "列宁", "国家与革命", page_links(state, r"/191708-09/\d{2}\.htm$"), "state")
    single(entries, "列宁", "帝国主义是资本主义的最高阶段", "https://www.marxists.org/chinese/lenin/15.htm", "imperialism")
    single(entries, "斯大林", "论列宁主义基础", "https://www.marxists.org/chinese/stalin/mia-chinese-stalin-192404.htm", "foundations")
    mao = [
        ("中国社会各阶级的分析", "marxist.org-chinese-mao-19251201.htm", "classes"),
        ("实践论", "marxist.org-chinese-mao-193707.htm", "practice"),
        ("矛盾论", "marxist.org-chinese-mao-193708.htm", "contradiction"),
        ("论持久战", "marxist.org-chinese-mao-193805b.htm", "protracted-war"),
        ("新民主主义论", "marxist.org-chinese-mao-194001.htm", "new-democracy"),
        ("为人民服务", "marxist.org-chinese-mao-19440908.htm", "serve-people")]
    for work, filename, prefix in mao:
        single(entries, "毛泽东", work, f"https://www.marxists.org/chinese/maozedong/{filename}", prefix)
    allowed = {"马克思", "马克思、恩格斯", "恩格斯", "列宁", "斯大林", "毛泽东"}
    if any(entry["author"] not in allowed for entry in entries): raise RuntimeError("出现白名单外作者")
    output = ROOT / "corpus.js"
    output.write_text("// 自动生成的中文原著定位索引；来源见 docs/文献来源.md。\nwindow.CLASSIC_CORPUS = "
        + json.dumps(entries, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    print(f"完成：{len(entries)} 段，{len({e['title'] for e in entries})} 部作品，{output.stat().st_size} 字节")

if __name__ == "__main__": main()
