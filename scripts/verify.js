// 验证中文原著语料、作者白名单、定位字段和关键词检索。
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname,"..");
const context = {window:{}};
vm.createContext(context);
for (const file of ["corpus.js","src/retrieval.js"]) vm.runInContext(fs.readFileSync(path.join(root,file),"utf8"),context,{filename:file});
const corpus = context.window.CLASSIC_CORPUS;
assert.ok(Array.isArray(corpus) && corpus.length > 6000,"中文原著段落数量不足");
const allowed = /^(马克思|马克思、恩格斯|恩格斯|列宁|斯大林|毛泽东|恩维尔·霍查|周恩来|胡志明|切·格瓦拉|布哈林、普列奥布拉任斯基)$/;
const banned = /托洛茨基|第四国际|主体思想|刘少奇|铁托|邓小平|trotsky|fourth[-_ ]international|juche|liu[-_ ]?shaoqi|tito|deng[-_ ]?xiaoping/i;
assert.ok(corpus.every(item => allowed.test(item.author)),"存在白名单外作者");
assert.ok(corpus.every(item => !banned.test(`${item.author} ${item.title} ${item.url}`)),"存在禁入作者、流派或作品");
assert.ok(corpus.every(item => item.language === "中文" && item.translation === false),"存在未标明的外文或译文");
assert.ok(corpus.every(item => item.text.length >= (item.title.includes("诗词") ? 2 : 12) && item.url.startsWith("https://www.marxists.org/chinese/")),"正文或中文来源缺失");
assert.ok(corpus.every(item => item.location && item.page >= 1 && item.paragraph >= 1),"定位字段缺失");
const works = new Set(corpus.map(item => item.title));
for (const title of ["共产党宣言","资本论·第一卷","国家与革命","论列宁主义基础","矛盾论","帝国主义与革命·第一部分","和平共处五项原则","法国殖民制度的罪状","游击战","古巴的社会主义和人","共产主义ABC","毛泽东诗词及本人说明"]) assert.ok(works.has(title),`未收录《${title}》`);
for (const query of ["剩余价值","主要矛盾","和平共处","殖民地","游击队","共产主义","沁园春"]) {
  const result = context.window.CaRetrieval.search(query);
  assert.ok(result.hits.length > 0,`关键词“${query}”没有命中`);
  assert.ok(result.hits.every(hit => hit.text.includes(query) || `${hit.author}${hit.title}${hit.location}`.includes(query)),`“${query}”出现伪命中`);
}
const filtered = context.window.CaRetrieval.search("实践",{author:"毛泽东",title:"实践论"});
assert.ok(filtered.hits.length > 0 && filtered.hits.every(hit => hit.author === "毛泽东" && hit.title === "实践论"),"作者作品筛选失效");
assert.equal(context.window.CaRetrieval.search("兮兮呵呵喵喵").hits.length,0,"无关词不应生成结果");
const html = fs.readFileSync(path.join(root,"index.html"),"utf8");
for (const src of ["corpus.js","src/retrieval.js","src/app.js"]) assert.ok(html.includes(`src="${src}"`),`HTML 未引入 ${src}`);
assert.ok(!html.includes("src/analysis.js") && !html.includes("革命与爱 R&amp;L"),"旧分析功能仍在入口中");
console.log(`通过：${corpus.length} 段、${works.size} 部中文作品、${new Set(corpus.map(item => item.author)).size} 类作者白名单、禁入规则与关键词定位。`);
