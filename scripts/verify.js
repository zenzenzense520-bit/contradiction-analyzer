// 验证真实语料、中文检索和输出边界，防止回退为伪造引文。
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname,"..");
const context = {window:{}};
vm.createContext(context);
for (const file of ["corpus.js","src/retrieval.js","src/analysis.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root,file),"utf8"),context,{filename:file});
}
const corpus = context.window.CLASSIC_CORPUS;
assert.ok(Array.isArray(corpus) && corpus.length > 3000,"原文段落数量不足");
assert.ok(corpus.every(item => item.text.length > (item.kind.includes("短引") ? 5 : 20) && item.url.startsWith("https://")),"原文或出处缺失");
assert.ok(corpus.every(item => /^(马克思、恩格斯|马克思|列宁|斯大林|毛泽东)$/.test(item.author)),"存在白名单外作者");
const works = new Set(corpus.map(item => item.title));
for (const title of ["共产党宣言","资本论·第一卷","国家与革命","帝国主义是资本主义的最高阶段","论列宁主义的几个问题","矛盾论","实践论","中国社会各阶级的分析"]) {
  assert.ok(works.has(title),`未收录 ${title}`);
}
const technology = context.window.CaRetrieval.retrieve("AI 自动化怎样影响工人劳动时间？",[]);
assert.ok(technology.hits.length > 0,"中文技术问题未命中原文");
assert.ok(technology.hits.some(hit => hit.title === "资本论·第一卷"),"未找到《资本论》机器章节");
const mao = context.window.CaRetrieval.retrieve("毛泽东《矛盾论》讲什么？",[]);
assert.ok(mao.hits.some(hit => hit.title === "矛盾论"),"作品名未命中《矛盾论》");
const nonsense = context.window.CaRetrieval.retrieve("兮兮呵呵喵喵",[]);
assert.equal(nonsense.hits.length,0,"不相关问题不应产生伪文献依据");
const imported = context.window.CaRetrieval.retrieve("自动化如何影响就业？",[
  {title:"地区就业调查",author:"用户导入",text:"本次调查讨论自动化带来的岗位变化。研究记录了职业培训和收入差异。"}
]);
assert.ok(imported.hits.some(hit => hit.kind === "用户文献"),"中文用户文献未进入检索结果");
const sections = context.window.CaAnalysis.makeSections("AI 自动化怎样影响工人劳动时间？","analysis","rl",technology);
assert.equal(sections.length,11,"R&L 结构不完整");
assert.ok(sections[0].text.join(" ").includes("没有实时统计"),"事实边界提示缺失");
const html = fs.readFileSync(path.join(root,"index.html"),"utf8");
for (const src of ["corpus.js","src/retrieval.js","src/analysis.js","src/app.js"]) {
  assert.ok(html.includes(`src="${src}"`),`HTML 未引入 ${src}`);
}
console.log(`通过：${corpus.length} 段、${works.size} 部作品、中文检索与 11 项 R&L 分析。`);
console.log("技术问题命中："+technology.hits.map(hit => hit.title+" / "+hit.chapter).join("；"));
