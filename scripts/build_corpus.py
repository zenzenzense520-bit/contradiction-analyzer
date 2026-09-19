"""从中文马克思主义文库的作者白名单构建原著定位索引。"""
from __future__ import annotations
import html, json, re, time, urllib.error, urllib.request
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urldefrag, urljoin

ROOT = Path(__file__).resolve().parents[1]
USER_AGENT = "ContradictionAnalyzer/0.3 (source locator)"
BANNED_METADATA = re.compile(
    r"托洛茨基|第四国际|主体思想|刘少奇|铁托|邓小平|"
    r"trotsky|fourth[-_ ]international|juche|liu[-_ ]?shaoqi|tito|deng[-_ ]?xiaoping",
    re.I,
)
ALLOWED_AUTHORS = {
    "马克思", "马克思、恩格斯", "恩格斯", "列宁", "斯大林", "毛泽东",
    "恩维尔·霍查", "周恩来", "胡志明", "切·格瓦拉", "布哈林、普列奥布拉任斯基",
}

class TextParser(HTMLParser):
    """兼容文库旧式未闭合 HTML，保留正文段落。"""
    def __init__(self, min_length: int = 12) -> None:
        super().__init__(convert_charrefs=True)
        self.min_length = min_length
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
            if len(value) >= self.min_length and not self.ignored: self.blocks.append(value)
        self.parts = []; self.active = False; self.ignored = False

def download(url: str) -> str:
    # 文库偶尔会中断 TLS 连接；有限重试后仍失败才中止，避免生成残缺索引。
    for attempt in range(1, 4):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=40) as response:
                content = response.read(); charset = response.headers.get_content_charset()
            break
        except (urllib.error.URLError, TimeoutError, ConnectionError) as error:
            if attempt == 3: raise RuntimeError(f"下载失败（已重试 3 次）：{url}") from error
            print(f"连接中断，等待后重试 {attempt}/3：{url}")
            time.sleep(attempt * 2)
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
    if author not in ALLOWED_AUTHORS: raise RuntimeError(f"出现白名单外作者：{author}")
    for page_number, url in enumerate(urls, 1):
        if BANNED_METADATA.search(f"{author} {work} {url}"):
            raise RuntimeError(f"禁入文献被拦截：{author}《{work}》 {url}")
        # 诗词的标题和单行正文很短，需要降低长度阈值才能精确检索。
        page = download(url); parser = TextParser(2 if "诗词" in work else 12); parser.feed(page)
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
    # 扩展文库逐篇列入，避免从作者目录误收禁入作品。
    hoxha = "https://www.marxists.org/chinese/hoxha/1978/index.htm"
    add_pages(entries, "恩维尔·霍查", "帝国主义与革命·第一部分",
              page_links(hoxha, r"/hoxha/1978/02-0[1-3]\.htm$"), "hoxha-imperialism")
    zhou = "https://www.marxists.org/chinese/zhouenlai/"
    for work, filename, prefix in [
        ("团结广大人民群众一道前进", "056.htm", "zhou-unity"),
        ("关于知识分子的改造问题", "107.htm", "zhou-intellectuals"),
        ("和平共处五项原则", "113.htm", "zhou-peace"),
    ]:
        single(entries, "周恩来", work, zhou + filename, prefix)
    ho_index = "https://www.marxists.org/chinese/reference-books/ho-chi-minh-1924/index.htm"
    add_pages(entries, "胡志明", "法国殖民制度的罪状",
              page_links(ho_index, r"/ho-chi-minh-1924/(?:0[1-9]|1[0-3])\.htm$"), "ho-colonialism")
    che_index = "https://www.marxists.org/chinese/guevara/1960/index.htm"
    add_pages(entries, "切·格瓦拉", "游击战",
              page_links(che_index, r"/guevara/1960/0[0-4]\.htm$"), "che-guerrilla")
    single(entries, "切·格瓦拉", "古巴的社会主义和人",
           "https://www.marxists.org/chinese/guevara/marxist.org-chinese-che-19650411.htm", "che-socialism-man")
    abc_index = "https://www.marxists.org/chinese/bukharin/1919/index.htm"
    add_pages(entries, "布哈林、普列奥布拉任斯基", "共产主义ABC",
              page_links(abc_index, r"/bukharin/1919/(?:0[1-9]|1[0-9]|20|21|07-1)\.htm$"), "communism-abc")
    single(entries, "毛泽东", "毛泽东诗词及本人说明",
           "https://www.marxists.org/chinese/maozedong/1968/4-098.htm", "mao-poetry")
    if any(entry["author"] not in ALLOWED_AUTHORS for entry in entries):
        raise RuntimeError("出现白名单外作者")
    if any(BANNED_METADATA.search(f"{entry['author']} {entry['title']} {entry['url']}") for entry in entries):
        raise RuntimeError("最终索引出现禁入文献")
    output = ROOT / "corpus.js"
    output.write_text("// 自动生成的中文原著定位索引；来源见 docs/文献来源.md。\nwindow.CLASSIC_CORPUS = "
        + json.dumps(entries, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    print(f"完成：{len(entries)} 段，{len({e['title'] for e in entries})} 部作品，{output.stat().st_size} 字节")

if __name__ == "__main__": main()
