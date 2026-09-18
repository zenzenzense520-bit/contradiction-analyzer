// 页面交互：保留原有离线入口，并展示真实命中的原文与可点击出处。
const app = {tab:"analysis",mode:"analysis",framework:"default",documents:[],history:[]};
const navItems = [["analysis","分析"],["documents","文献"],["debate","辩论"],["history","历史"],["settings","设置"]];
const modes = [["analysis","矛盾分析"],["chat","普通对话"],["literature","文献问答"]];
const quick = ["为什么大学生越来越难找到满意的工作？","AI 能否把自动化转化为人的自由时间？","为什么房价会影响年轻人的婚恋选择？","国际贸易摩擦中的主要矛盾是什么？"];
const labels = {fact:"事实范围",inference:"分析推论",user:"用户理论 R&L",other:"其他理论",classic:"经典文献"};
// 中文版本只作为核对入口，不把不同译本误称为同一原文。
const chineseSources = {
  "共产党宣言":"https://www.marxists.org/chinese/marx/01.htm",
  "资本论·第一卷":"https://www.marxists.org/chinese/marx/capital/index.htm",
  "国家与革命":"https://www.marxists.org/chinese/lenin/index.htm",
  "帝国主义是资本主义的最高阶段":"https://www.marxists.org/chinese/lenin/15.htm",
  "论列宁主义的几个问题":"https://www.marxists.org/chinese/stalin/index.htm",
  "矛盾论":"https://www.marxists.org/chinese/maozedong/marxist.org-chinese-mao-193708.htm",
  "实践论":"https://www.marxists.org/chinese/maozedong/marxist.org-chinese-mao-193707.htm",
  "中国社会各阶级的分析":"https://www.marxists.org/chinese/maozedong/marxist.org-chinese-mao-19251201.htm"
};

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g,char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[char]);
}

function safeUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? esc(parsed.href) : "";
  } catch { return ""; }
}

function notifyError(message) {
  document.getElementById("appError").textContent = message;
  document.getElementById("appError").classList.remove("hidden");
}

function load() {
  try {
    const documents = JSON.parse(localStorage.getItem("ca-documents") || "[]");
    const history = JSON.parse(localStorage.getItem("ca-history") || "[]");
    app.documents = Array.isArray(documents) ? documents : [];
    app.history = Array.isArray(history) ? history : [];
  } catch (error) {
    notifyError("浏览器保存的数据无法读取；页面仍可检索内置文献。详细信息："+error.message);
  }
}

function save() {
  try {
    localStorage.setItem("ca-documents",JSON.stringify(app.documents.slice(-10)));
    localStorage.setItem("ca-history",JSON.stringify(app.history.slice(0,20)));
  } catch (error) {
    notifyError("浏览器存储空间不足，新增内容未能保存。详细信息："+error.message);
  }
}

function renderNav() {
  const html = navItems.map(([id,title]) => `<button class="${app.tab===id?"active":""}" data-tab="${id}">${title}</button>`).join("");
  document.getElementById("topNav").innerHTML = html;
  document.getElementById("mobileNav").innerHTML = html;
  document.querySelectorAll("[data-tab]").forEach(button => button.onclick = () => showTab(button.dataset.tab));
}

function renderModes() {
  document.getElementById("modeButtons").innerHTML = modes.map(([id,title]) =>
    `<button class="${app.mode===id?"active":""}" data-mode="${id}">${title}</button>`).join("");
  document.querySelectorAll("[data-mode]").forEach(button => button.onclick = () => {
    app.mode = button.dataset.mode;
    renderModes(); syncFramework();
  });
}

function syncFramework() {
  const available = app.tab === "analysis" && app.mode === "analysis";
  document.getElementById("rlButton").classList.toggle("hidden",!available);
  document.getElementById("rlButton").classList.toggle("active",app.framework === "rl");
  document.getElementById("framework").classList.toggle("hidden",!available || app.framework !== "rl");
}

function showTab(tab) {
  app.tab = tab;
  if (tab === "debate") app.mode = "debate";
  if (tab === "analysis" && app.mode === "debate") app.mode = "analysis";
  document.getElementById("analysisView").classList.toggle("hidden",!["analysis","debate"].includes(tab));
  for (const name of ["documents","history","settings"]) {
    document.getElementById(name+"View").classList.toggle("hidden",tab !== name);
  }
  renderNav(); renderModes(); syncFramework();
  if (tab === "documents") renderDocuments();
  if (tab === "history") renderHistory();
}

function citationCard(hit,index) {
  const link = safeUrl(hit.url);
  const chineseLink = safeUrl(chineseSources[hit.title]);
  return `<article class="citation"><p class="eyebrow">文献依据 [${index+1}] · ${esc(hit.kind)}</p>`+
    `<h4>${esc(hit.title)} · ${esc(hit.chapter)}</h4><small>${esc(hit.author)}</small>`+
    `<p class="excerpt">${esc(hit.excerpt || hit.text.slice(0,560))}</p>`+
    (link ? `<a class="link-btn" href="${link}" target="_blank" rel="noopener noreferrer">打开来源与上下文 ↗</a>` :
      `<small>用户导入文件：请核对原文件版本。</small>`)+
    (chineseLink && chineseLink !== link ? ` <a class="link-btn" href="${chineseLink}" target="_blank" rel="noopener noreferrer">中文版本入口 ↗</a>` : "")+`</article>`;
}

function renderResult(question,sections,retrieval) {
  document.getElementById("hero").classList.add("hidden");
  const links = sections.map(item => `<a href="#${esc(item.key)}">${esc(item.title)}</a>`).join("");
  const cards = sections.map(item => `<section class="card" id="${esc(item.key)}"><div class="card-top"><h3>${esc(item.title)}</h3>`+
    `<span class="kind ${esc(item.kind)}">${labels[item.kind] || "分析"}</span></div>`+
    item.text.map(paragraph => `<p>${esc(paragraph)}</p>`).join("")+`</section>`).join("");
  const rl = app.framework === "rl" && app.mode === "analysis";
  const premise = rl ? `<div class="premise"><b>理论前提提示</b><br>R&L 是用户自定义框架。技术进步能否减少必要劳动、改善生活，取决于所有权、制度与现实条件；理论预测不能当作已经发生的事实。</div>` : "";
  const citationHtml = retrieval.hits.length ? retrieval.hits.map(citationCard).join("") :
    `<section class="card"><p>没有足够相关的本地原文命中。请改用具体的作品名、章节或导入新的 TXT/Markdown 文献。</p></section>`;
  const status = `离线原文检索：${retrieval.scanned} 段 · 命中 ${retrieval.hits.length} 段 · 无实时事实数据`;
  const title = rl ? "革命与爱（R&L）" : app.mode === "literature" ? "文献问答" : app.mode === "debate" ? "多视角辩论" : "离线结构分析";
  document.getElementById("result").innerHTML = `<div class="result-grid"><aside class="side"><p class="eyebrow">分析结构</p>${links}</aside>`+
    `<div class="result-body"><header class="result-head"><div><p class="eyebrow">当前分析框架</p><h2>${esc(title)}</h2></div>`+
    `<small>${esc(question.slice(0,55))}</small></header><div class="status"><span>${esc(status)}</span></div>${premise}${cards}`+
    `<section class="card"><p class="eyebrow">文献来源与原文摘录</p><p>摘录来自本地检索库；点击来源可核对完整上下文。英语译本与中文解释分开呈现。</p></section>${citationHtml}</div></div>`;
}

function analyze() {
  const question = document.getElementById("question").value.trim();
  if (question.length < 2) { notifyError("请输入至少两个字的问题。"); return; }
  const retrieval = window.CaRetrieval.retrieve(question,app.documents);
  const sections = window.CaAnalysis.makeSections(question,app.mode,app.framework,retrieval);
  renderResult(question,sections,retrieval);
  app.history.unshift({time:new Date().toISOString(),question,mode:app.mode,framework:app.framework,
    sections,retrieval:{hits:retrieval.hits.map(hit => ({...hit,text:hit.excerpt})),scanned:retrieval.scanned}});
  save();
}

function renderDocuments() {
  const catalog = [
    ["共产党宣言","马克思、恩格斯","1888 年英语译本；已收录主体段落",chineseSources["共产党宣言"]],
    ["资本论·第一卷","马克思","1887 年英语译本；已收录第一卷 33 章主体段落",chineseSources["资本论·第一卷"]],
    ["列宁著作","列宁","已收录《国家与革命》《帝国主义论》；全集未全卷收录","https://www.marxists.org/chinese/lenin-cworks/index.htm"],
    ["斯大林著作","斯大林","已收录《论列宁主义的几个问题》；选集未全卷收录",chineseSources["论列宁主义的几个问题"]],
    ["毛泽东选集","毛泽东","《矛盾论》《实践论》《中国社会各阶级的分析》收录短引与来源入口；未收录选集全文","https://www.marxists.org/chinese/maozedong/index.htm"]
  ];
  const builtIn = catalog.map(([title,author,coverage,url]) => `<article class="doc"><p class="eyebrow">白名单文献目录</p><h3>${esc(title)}</h3><p>${esc(author)} · ${esc(coverage)}</p><a class="link-btn" href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer">中文文库入口 ↗</a></article>`).join("");
  const uploaded = app.documents.map(doc => `<article class="doc"><p class="eyebrow">用户本地文献</p><h3>${esc(doc.title)}</h3><p>${esc(doc.author || "用户导入")} · ${String(doc.text || "").length} 字</p></article>`).join("");
  document.getElementById("docList").innerHTML = builtIn + uploaded;
}

function renderHistory() {
  document.getElementById("historyList").innerHTML = app.history.length ? app.history.map((item,index) =>
    `<button class="history-row" data-history="${index}"><span>${esc(item.question)}</span><small>${new Date(item.time).toLocaleString("zh-CN")}</small></button>`).join("") : `<p class="notice">还没有历史记录。</p>`;
  document.querySelectorAll("[data-history]").forEach(button => button.onclick = () => {
    const item = app.history[Number(button.dataset.history)];
    app.mode = item.mode; app.framework = item.framework; showTab("analysis");
    document.getElementById("question").value = item.question;
    if (item.retrieval && Array.isArray(item.sections)) renderResult(item.question,item.sections,item.retrieval);
    else analyze();
  });
}

document.getElementById("rlButton").onclick = () => {app.framework=app.framework === "rl"?"default":"rl";syncFramework();};
document.getElementById("analyzeButton").onclick = analyze;
document.getElementById("quickQuestions").innerHTML = quick.map((question,index) =>
  `<button class="chip" data-quick="${index}">${esc(question.slice(0,13))}…</button>`).join("");
document.querySelectorAll("[data-quick]").forEach(button => button.onclick = () => {
  document.getElementById("question").value = quick[Number(button.dataset.quick)];
});
document.getElementById("fileInput").onchange = async function() {
  const file = this.files && this.files[0];
  if (!file) return;
  if (file.size > 2*1024*1024) { notifyError("单个导入文件不能超过 2 MB。"); return; }
  try {
    const content = await file.text();
    // 用户要求排除托派文献：只检查明确的作者署名或文件名，避免误拦讨论该人物的文献。
    if (/托洛茨基|Trotsky|托派|第四国际/i.test(file.name) ||
        /(?:作者|author)\s*[:：]\s*(?:托洛茨基|Trotsky)/i.test(content.slice(0,500))) {
      notifyError("按当前资料库范围，不能导入托派作者文献。"); return;
    }
    app.documents.push({title:file.name.replace(/\.[^.]+$/,""),author:"用户导入",text:content.slice(0,150000)});
    save(); renderDocuments();
  } catch(error) {notifyError("文献读取失败："+error.message);}
};
load();renderNav();renderModes();syncFramework();
if (!Array.isArray(window.CLASSIC_CORPUS)) notifyError("未找到 corpus.js；请保持 index.html、corpus.js 和 src 文件夹在同一项目目录。");
