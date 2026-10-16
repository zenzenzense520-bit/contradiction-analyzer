// 验证中文原著语料、作者白名单、检索、学习数据层、专题路径与每日选段。
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");

// 内存版 localStorage，供 storage.js 在无浏览器环境下运行。
const mem = new Map();
const localStorageMock = {
  getItem: key => (mem.has(key) ? mem.get(key) : null),
  setItem: (key, value) => mem.set(key, String(value)),
  removeItem: key => mem.delete(key),
  clear: () => mem.clear()
};
const context = { console, localStorage: localStorageMock };
vm.createContext(context);
vm.runInContext("var window = {};", context);
vm.runInContext("var CaReader = { open() {} };", context);
const files = ["corpus.js", "src/retrieval.js", "src/storage.js", "src/topics.js", "src/daily.js"];
for (const file of files) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
}
const corpus = context.window.CLASSIC_CORPUS;
const Store = context.window.CaStore;
const Topics = context.window.CaTopics;
const Daily = context.window.CaDaily;

// —— 语料与白名单 ——
assert.ok(Array.isArray(corpus) && corpus.length > 6000, "中文原著段落数量不足");
const allowed = /^(马克思|马克思、恩格斯|恩格斯|列宁|斯大林|毛泽东|恩维尔·霍查|周恩来|胡志明|切·格瓦拉|布哈林、普列奥布拉任斯基)$/;
const banned = /托洛茨基|第四国际|主体思想|刘少奇|铁托|邓小平|trotsky|fourth[-_ ]international|juche|liu[-_ ]?shaoqi|tito|deng[-_ ]?xiaoping/i;
assert.ok(corpus.every(item => allowed.test(item.author)), "存在白名单外作者");
assert.ok(corpus.every(item => !banned.test(`${item.author} ${item.title} ${item.url}`)), "存在禁入作者、流派或作品");
assert.ok(corpus.every(item => item.language === "中文" && item.translation === false), "存在未标明的外文或译文");
assert.ok(corpus.every(item => item.text.length >= (item.title.includes("诗词") ? 2 : 12) && item.url.startsWith("https://www.marxists.org/chinese/")), "正文或中文来源缺失");
assert.ok(corpus.every(item => item.location && item.page >= 1 && item.paragraph >= 1), "定位字段缺失");
const works = new Set(corpus.map(item => item.title));
for (const title of ["共产党宣言", "资本论·第一卷", "国家与革命", "论列宁主义基础", "矛盾论", "帝国主义与革命·第一部分", "和平共处五项原则", "法国殖民制度的罪状", "游击战", "古巴的社会主义和人", "共产主义ABC", "毛泽东诗词及本人说明"]) {
  assert.ok(works.has(title), `未收录《${title}》`);
}
for (const query of ["剩余价值", "主要矛盾", "和平共处", "殖民地", "游击队", "共产主义", "沁园春"]) {
  const result = context.window.CaRetrieval.search(query);
  assert.ok(result.hits.length > 0, `关键词“${query}”没有命中`);
  assert.ok(result.hits.every(hit => hit.text.includes(query) || `${hit.author}${hit.title}${hit.location}`.includes(query)), `“${query}”出现伪命中`);
}
const filtered = context.window.CaRetrieval.search("实践", { author: "毛泽东", title: "实践论" });
assert.ok(filtered.hits.length > 0 && filtered.hits.every(hit => hit.author === "毛泽东" && hit.title === "实践论"), "作者作品筛选失效");
assert.equal(context.window.CaRetrieval.search("兮兮呵呵喵喵").hits.length, 0, "无关词不应生成结果");

// —— 检索分页与多词模式回归 ——
const firstPage = context.window.CaRetrieval.search("剩余价值", { limit: 12 });
const secondPage = context.window.CaRetrieval.search("剩余价值", { limit: 12, offset: 12 });
assert.equal(firstPage.hits.length, 12, "首页应显示 12 条");
assert.ok(firstPage.total > 12 && secondPage.hits.length > 0, "分页应能继续读取");
assert.ok(!firstPage.hits.some(hit => secondPage.hits.some(next => next.id === hit.id)), "分页结果不应重复");
const allWords = context.window.CaRetrieval.search("国家 革命", { mode: "all" });
const anyWord = context.window.CaRetrieval.search("国家 革命", { mode: "any" });
assert.ok(allWords.total > 0 && anyWord.total >= allWords.total, "多词匹配的包含关系错误");
assert.ok(allWords.hits.every(hit => hit.text.includes("国家") && hit.text.includes("革命")), "全部词模式出现伪命中");
const originalCorpus = context.window.CLASSIC_CORPUS;
context.window.CLASSIC_CORPUS = [{ id: "fixture", author: "作者", title: "标题命中", location: "网页标题", page: 1, paragraph: 1, url: "https://www.marxists.org/chinese/fixture.htm", text: "正文只有这句话。", language: "中文", translation: false }];
assert.equal(context.window.CaRetrieval.search("标题命中").total, 0, "仅作品名命中不应冒充正文");
context.window.CLASSIC_CORPUS = originalCorpus;

// —— 学习数据层：收藏与笔记 ——
const sample = corpus.find(item => item.title === "实践论");
assert.equal(Store.isFavorite(sample.id), false, "初始不应已收藏");
assert.equal(Store.toggleFavorite(sample), true, "收藏应返回 true");
assert.equal(Store.isFavorite(sample.id), true, "收藏状态未生效");
assert.equal(Store.setNote(sample.id, "重点段落"), true, "笔记应能保存");
assert.equal(Store.getFavorites()[0].note, "重点段落", "笔记内容不符");
assert.equal(Store.toggleFavorite(sample), false, "取消收藏应返回 false");
assert.equal(Store.getFavorites().length, 0, "取消收藏后应清空");

// —— 打卡与连续天数（固定基准日期，避免随真实日期漂移）——
const base = "2026-10-16";
Store.markDaily(base, "x");
Store.markDaily(Store.shiftDate(base, -1), "x");
Store.markDaily(Store.shiftDate(base, -2), "x");
assert.equal(Store.streak(base), 3, "连续三天打卡应为 3");
Store.unmarkDaily(Store.shiftDate(base, -2));
assert.equal(Store.streak(base), 2, "中断一天后应为 2");
Store.unmarkDaily(base);
Store.unmarkDaily(Store.shiftDate(base, -1));
assert.equal(Store.streak(base), 0, "清空后应为 0");

// —— 专题路径：引用作品必须真实存在 ——
const topicTitles = Topics.titles();
assert.ok(topicTitles.length >= 20, "专题收录条目过少");
assert.ok(topicTitles.every(title => works.has(title)), "专题引用了语料中不存在的作品");

// —— 每日选段：确定性与有效性 ——
assert.ok(Daily.poolSize() > 1000, "每日候选池过小");
const pickA = Daily.pick(base);
const pickB = Daily.pick(base);
assert.equal(pickA.id, pickB.id, "同一天应得到同一段");
assert.ok(pickA.text.length >= 60 && pickA.text.length <= 600, "选段长度不合规");
assert.ok(Daily.pick(Store.shiftDate(base, -100)).id, "历史日期应能选段");

// —— index.html 脚本与样式引入 ——
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert.ok(html.includes('href="src/style.css"'), "样式未加载");
for (const src of ["corpus.js", "src/retrieval.js", "src/storage.js", "src/app.js", "src/reader.js", "src/topics.js", "src/daily.js", "src/mine.js"]) {
  assert.ok(html.includes(`src="${src}"`), `HTML 未引入 ${src}`);
}
assert.ok(!html.includes("src/analysis.js") && !html.includes("革命与爱 R&amp;L"), "旧分析功能仍在入口中");

console.log(`通过：${corpus.length} 段、${works.size} 部作品、收藏笔记、打卡连续天数、专题路径与每日选段。`);
