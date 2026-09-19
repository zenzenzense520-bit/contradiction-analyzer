// 页面交互：输入关键词，定位白名单作者原著中的真实段落。
const app = {tab:"search",author:"",title:"",history:[]};
const navItems = [["search","原著检索"],["documents","文献目录"],["history","检索历史"],["settings","说明"]];
const examples = ["剩余价值","生产关系","国家是阶级矛盾","真理的标准","主要矛盾","帝国主义"];

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g,char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[char]);
}

function safeUrl(url) {
  try {const parsed=new URL(url);return parsed.protocol==="https:"?esc(parsed.href):"";} catch {return "";}
}

function notifyError(message) {
  const element=document.getElementById("appError");element.textContent=message;element.classList.remove("hidden");
}

function clearError() {document.getElementById("appError").classList.add("hidden");}

function load() {
  try {
    const value=JSON.parse(localStorage.getItem("source-locator-history")||"[]");
    app.history=Array.isArray(value)?value:[];
  } catch(error) {notifyError("历史记录读取失败："+error.message);}
}

function save() {
  try {localStorage.setItem("source-locator-history",JSON.stringify(app.history.slice(0,30)));}
  catch(error) {notifyError("历史记录保存失败："+error.message);}
}

function renderNav() {
  const html=navItems.map(([id,title])=>`<button class="${app.tab===id?"active":""}" data-tab="${id}">${title}</button>`).join("");
  document.getElementById("topNav").innerHTML=html;document.getElementById("mobileNav").innerHTML=html;
  document.querySelectorAll("[data-tab]").forEach(button=>button.onclick=()=>showTab(button.dataset.tab));
}

function showTab(tab) {
  app.tab=tab;
  for(const name of ["search","documents","history","settings"]){
    document.getElementById(name+"View").classList.toggle("hidden",tab!==name);
  }
  renderNav();
  if(tab==="documents") renderDocuments();
  if(tab==="history") renderHistory();
}

function authorOptions() {
  const authors=[...new Set(window.CaRetrieval.catalog().map(work=>work.author))];
  const select=document.getElementById("authorFilter");
  select.innerHTML=`<option value="">全部作者</option>`+authors.map(author=>`<option value="${esc(author)}">${esc(author)}</option>`).join("");
  select.value=app.author;
}

function workOptions() {
  const works=window.CaRetrieval.catalog().filter(work=>!app.author||work.author===app.author);
  const select=document.getElementById("workFilter");
  select.innerHTML=`<option value="">全部作品</option>`+works.map(work=>`<option value="${esc(work.title)}">${esc(work.title)}</option>`).join("");
  if(!works.some(work=>work.title===app.title)) app.title="";
  select.value=app.title;
}

function highlighted(text,terms) {
  if(!terms.length) return esc(text);
  const pattern=terms.map(term=>term.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).sort((a,b)=>b.length-a.length).join("|");
  const regex=new RegExp(pattern,"gi");
  let last=0,html="";
  for(const match of text.matchAll(regex)) {html+=esc(text.slice(last,match.index))+`<mark>${esc(match[0])}</mark>`;last=match.index+match[0].length;}
  return html+esc(text.slice(last));
}

function resultCard(hit,index,terms) {
  const translation=hit.translation?`<span class="kind inference">机器翻译</span>`:`<span class="kind classic">中文原文</span>`;
  return `<article class="citation"><div class="card-top"><p class="eyebrow">结果 ${index+1} · ${esc(hit.author)}</p>${translation}</div>`+
    `<h4>《${esc(hit.title)}》</h4><small>${esc(hit.location)} · 网页第 ${hit.page} 页 · 索引第 ${hit.paragraph} 段</small>`+
    `<p class="excerpt">${highlighted(hit.excerpt,terms)}</p>`+
    `<a class="link-btn" href="${safeUrl(hit.url)}" target="_blank" rel="noopener noreferrer">打开中文马克思主义文库原网页 ↗</a></article>`;
}

function renderResults(result) {
  document.getElementById("hero").classList.add("hidden");
  const summary=result.total?`检索 ${result.scanned} 段，找到 ${result.total} 条，当前显示前 ${result.hits.length} 条。`:
    `检索了 ${result.scanned} 段，没有找到“${result.query}”。请缩短关键词或更换同义词。`;
  const cards=result.hits.map((hit,index)=>resultCard(hit,index,result.terms)).join("");
  document.getElementById("result").innerHTML=`<div class="result-body search-results"><header class="result-head"><div><p class="eyebrow">原著定位结果</p><h2>${esc(result.query)}</h2></div><small>${esc(summary)}</small></header>`+
    `<div class="notice">结果只表示关键词在当前已收录中文原著中的位置，不等于理论解释或现实判断。</div>`+
    (cards||`<section class="card"><h3>未找到原文</h3><p>本工具不会为了回答问题而生成或拼接引文。可到“文献目录”确认作品是否已收录。</p></section>`)+`</div>`;
}

function search() {
  clearError();
  const query=document.getElementById("question").value.trim();
  if(query.length<2){notifyError("请输入至少两个字的关键词或短语。");return;}
  const result=window.CaRetrieval.search(query,{author:app.author,title:app.title});
  renderResults(result);
  app.history.unshift({time:new Date().toISOString(),query,author:app.author,title:app.title,total:result.total});
  save();
}

function renderDocuments() {
  const works=window.CaRetrieval.catalog();
  document.getElementById("docList").innerHTML=works.map(work=>`<article class="doc"><p class="eyebrow">${esc(work.author)} · ${esc(work.language)}</p>`+
    `<h3>${esc(work.title)}</h3><p>${work.pages} 个原网页 · ${work.paragraphs} 个检索段落</p>`+
    `<a class="link-btn" href="${safeUrl(work.url)}" target="_blank" rel="noopener noreferrer">查看来源 ↗</a></article>`).join("");
}

function renderHistory() {
  document.getElementById("historyList").innerHTML=app.history.length?app.history.map((item,index)=>
    `<button class="history-row" data-history="${index}"><span>${esc(item.query)}${item.author?` · ${esc(item.author)}`:""}</span><small>${new Date(item.time).toLocaleString("zh-CN")} · ${item.total} 条</small></button>`).join(""):`<p class="notice">还没有检索记录。</p>`;
  document.querySelectorAll("[data-history]").forEach(button=>button.onclick=()=>{
    const item=app.history[Number(button.dataset.history)];app.author=item.author||"";app.title=item.title||"";
    showTab("search");authorOptions();workOptions();document.getElementById("question").value=item.query;search();
  });
}

document.getElementById("analyzeButton").onclick=search;
document.getElementById("question").addEventListener("keydown",event=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();search();}});
document.getElementById("quickQuestions").innerHTML=examples.map((term,index)=>`<button class="chip" data-quick="${index}">${esc(term)}</button>`).join("");
document.querySelectorAll("[data-quick]").forEach(button=>button.onclick=()=>{document.getElementById("question").value=examples[Number(button.dataset.quick)];search();});
document.getElementById("authorFilter").onchange=event=>{app.author=event.target.value;app.title="";workOptions();};
document.getElementById("workFilter").onchange=event=>{app.title=event.target.value;};

load();renderNav();authorOptions();workOptions();
if(!Array.isArray(window.CLASSIC_CORPUS)) notifyError("未找到 corpus.js，请保持项目文件结构完整。");
