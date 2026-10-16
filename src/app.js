// 页面升级：目录筛选、分段阅读、分页与引文复制集中在此文件。
const app={tab:"search",author:"",title:"",mode:"phrase",page:0,history:[],lastResult:null};
const pageSize=12;
const navItems=[["search","原著检索"],["documents","文献目录"],["history","检索历史"],["settings","使用说明"]];
const examples=["剩余价值","生产关系","主要矛盾","无产阶级","帝国主义"];

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
}

function safeUrl(url) {
  try {
    const parsed=new URL(url);
    return parsed.protocol==="https:" && parsed.hostname==="www.marxists.org" ? esc(parsed.href) : "";
  } catch {
    return "";
  }
}

function notifyError(message) {
  const element=document.getElementById("appError");
  element.textContent=message;
  element.classList.remove("hidden");
}

function clearError() {
  document.getElementById("appError").classList.add("hidden");
}

function loadHistory() {
  try {
    const value=JSON.parse(localStorage.getItem("source-locator-history")||"[]");
    app.history=Array.isArray(value)?value.filter(item=>item && typeof item.query==="string").slice(0,30):[];
  } catch(error) {
    notifyError("历史记录读取失败："+error.message);
  }
}

function saveHistory() {
  try {
    localStorage.setItem("source-locator-history",JSON.stringify(app.history.slice(0,30)));
  } catch(error) {
    notifyError("历史记录保存失败："+error.message);
  }
}

function renderNav() {
  const html=navItems.map(([id,label])=>'<button type="button" class="'+(app.tab===id?"active":"")+'" data-tab="'+id+'"'+
    (app.tab===id?' aria-current="page"':"")+'>'+label+"</button>").join("");
  for (const id of ["topNav","mobileNav"]) document.getElementById(id).innerHTML=html;
  document.querySelectorAll("[data-tab]").forEach(button=>button.onclick=()=>showTab(button.dataset.tab));
}

function showTab(tab) {
  if (!navItems.some(([id])=>id===tab)) return;
  app.tab=tab;
  for (const [id] of navItems) document.getElementById(id+"View").classList.toggle("hidden",id!==tab);
  renderNav();
  if (tab==="documents") renderDocuments();
  if (tab==="history") renderHistory();
  window.scrollTo({top:0,behavior:"smooth"});
}

function renderStats() {
  const works=window.CaRetrieval.catalog();
  document.getElementById("workCount").textContent=works.length.toLocaleString("zh-CN");
  document.getElementById("passageCount").textContent=works.reduce((sum,work)=>sum+work.paragraphs,0).toLocaleString("zh-CN");
}

function authorOptions() {
  const authors=[...new Set(window.CaRetrieval.catalog().map(work=>work.author))];
  const select=document.getElementById("authorFilter");
  select.innerHTML='<option value="">全部作者</option>'+authors.map(author=>
    '<option value="'+esc(author)+'">'+esc(author)+"</option>").join("");
  select.value=app.author;
}

function workOptions() {
  const works=window.CaRetrieval.catalog().filter(work=>!app.author||work.author===app.author);
  const select=document.getElementById("workFilter");
  select.innerHTML='<option value="">全部作品</option>'+works.map(work=>
    '<option value="'+esc(work.title)+'">'+esc(work.title)+"</option>").join("");
  if (!works.some(work=>work.title===app.title)) app.title="";
  select.value=app.title;
}

function highlighted(text,terms) {
  if (!terms.length) return esc(text);
  const pattern=terms.map(term=>term.replace(/[-/\\^$*+?.()|[\]{}]/g,"\\$&")).sort((a,b)=>b.length-a.length).join("|");
  const regex=new RegExp(pattern,"gi");
  let last=0,html="";
  for (const match of String(text).matchAll(regex)) {
    html+=esc(text.slice(last,match.index))+"<mark>"+esc(match[0])+"</mark>";
    last=match.index+match[0].length;
  }
  return html+esc(text.slice(last));
}

function resultCard(hit,index,terms) {
  const source=safeUrl(hit.url);
  const start='<article class="citation"><div class="citation-top"><span class="source-label">NO. '+
    String(index+1).padStart(2,"0")+"</span><span>"+esc(hit.translation?"机器翻译":"中文页面索引")+"</span></div>";
  const heading="<h3>《"+esc(hit.title)+"》</h3>";
  const meta='<div class="citation-meta"><span>'+esc(hit.author)+"</span><span>"+esc(hit.location)+
    "</span><span>网页 "+Number(hit.page)+" · 索引第 "+Number(hit.paragraph)+" 段</span></div>";
  const summary='<p class="excerpt">'+highlighted(hit.excerpt,terms)+"</p>";
  const full=hit.text.length>360?'<details class="full-text"><summary>展开索引中的完整段落</summary><p>'+
    highlighted(hit.text,terms)+"</p></details>":"";
  const link=source?'<a href="'+source+'" target="_blank" rel="noopener noreferrer">打开中文马克思主义文库原网页 ↗</a>':"";
  const actions='<div class="citation-actions">'+link+'<button type="button" data-copy="'+(index-app.page*pageSize)+
    '">复制定位信息</button></div>';
  return start+heading+meta+summary+full+actions+"</article>";
}

function renderResults(result) {
  document.getElementById("hero").classList.add("hidden");
  const rangeStart=result.total?app.page*pageSize+1:0;
  const rangeEnd=Math.min(result.total,(app.page+1)*pageSize);
  const summary=result.total.toLocaleString("zh-CN")+" 条命中 · 显示 "+rangeStart+"–"+rangeEnd+" 条";
  let html='<div class="result-layout"><div class="result-main"><div class="result-title"><div><p class="eyebrow">检索结果 / RESULTS</p><h2>'+
    esc(result.query)+"</h2></div><span>"+esc(summary)+"</span></div>";
  html+='<p class="result-note">只显示当前索引中实际含有关键词的段落。索引位置不是纸本页码，引用时请核对原网页。</p>';
  if (result.hits.length) {
    html+='<div class="result-list">'+result.hits.map((hit,index)=>resultCard(hit,app.page*pageSize+index,result.terms)).join("")+"</div>";
    const pages=Math.ceil(result.total/pageSize);
    html+='<div class="pager"><button type="button" data-page="previous"'+(app.page===0?" disabled":"")+
      '>← 上一页</button><span>第 '+(app.page+1)+" / "+pages+' 页</span><button type="button" data-page="next"'+
      (app.page+1>=pages?" disabled":"")+">下一页 →</button></div>";
  } else {
    html+='<div class="empty-result"><h3>当前范围内没有找到原文</h3><p>可缩短短语、更换关键词，或检查作者与作品筛选。目录中没有的作品暂不能全文检索。</p></div>';
  }
  html+="</div>";
  if (result.byWork.length) {
    html+='<aside class="result-side"><h3>命中作品</h3>'+result.byWork.slice(0,8).map((work,index)=>
      '<button class="facet" type="button" data-facet="'+index+'"><span>'+esc(work.title)+
      "</span><span>"+work.count+"</span></button>").join("")+
      '<p>点击作品，可限定当前关键词的检索范围。</p></aside>';
  }
  document.getElementById("result").innerHTML=html+"</div>";
  document.querySelectorAll("[data-page]").forEach(button=>button.onclick=()=>{
    app.page+=button.dataset.page==="next"?1:-1;
    performSearch(false);
    document.getElementById("result").scrollIntoView({behavior:"smooth"});
  });
  document.querySelectorAll("[data-facet]").forEach(button=>button.onclick=()=>{
    const work=result.byWork[Number(button.dataset.facet)];
    app.author=work.author;app.title=work.title;app.page=0;
    authorOptions();workOptions();performSearch(false);
  });
  document.querySelectorAll("[data-copy]").forEach(button=>button.onclick=()=>{
    const hit=result.hits[Number(button.dataset.copy)];
    if (hit) copyReference(hit);
  });
}

function performSearch(record=true) {
  clearError();
  const query=document.getElementById("question").value.trim();
  if (query.length<2) {notifyError("请输入至少两个字的关键词或短语。");return;}
  try {
    const result=window.CaRetrieval.search(query,{author:app.author,title:app.title,mode:app.mode,
      offset:app.page*pageSize,limit:pageSize});
    app.lastResult=result;
    renderResults(result);
    if (record) {
      app.history.unshift({time:new Date().toISOString(),query,author:app.author,title:app.title,
        mode:app.mode,total:result.total});
      app.history=app.history.slice(0,30);
      saveHistory();
    }
  } catch(error) {
    notifyError("检索失败："+error.message);
  }
}

async function copyReference(hit) {
  const reference=hit.author+"《"+hit.title+"》；"+hit.location+"；网页 "+hit.page+
    "，索引第 "+hit.paragraph+" 段。来源："+hit.url+"\n索引段落："+hit.text;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(reference);
    } else {
      const field=document.createElement("textarea");
      field.value=reference;field.style.position="fixed";field.style.opacity="0";
      document.body.append(field);field.select();
      const copied=document.execCommand("copy");
      field.remove();
      if (!copied) throw new Error("浏览器未允许复制");
    }
    clearError();
  } catch(error) {
    notifyError("复制失败，请手动选择段落文字："+error.message);
  }
}

function renderDocuments() {
  const term=document.getElementById("catalogQuery").value.trim().toLowerCase();
  const works=window.CaRetrieval.catalog().filter(work=>
    (work.author+" "+work.title).toLowerCase().includes(term));
  document.getElementById("catalogCount").textContent=works.length+" 部作品";
  document.getElementById("docList").innerHTML=works.length?works.map((work,index)=>
    '<article class="doc"><p class="doc-author">'+esc(work.author)+" · "+esc(work.language)+
    "</p><h3>《"+esc(work.title)+"》</h3><p>"+work.pages+" 个原网页 · "+work.paragraphs+
    ' 个索引段落</p><button type="button" data-doc="'+index+'">在此作品中检索 ↗</button></article>').join(""):
    '<p class="notice">目录中没有匹配的作品。</p>';
  document.querySelectorAll("[data-doc]").forEach(button=>button.onclick=()=>{
    const work=works[Number(button.dataset.doc)];
    app.author=work.author;app.title=work.title;app.page=0;
    authorOptions();workOptions();showTab("search");
    document.getElementById("question").focus();
    if (document.getElementById("question").value.trim().length>=2) performSearch(false);
  });
}

function renderHistory() {
  document.getElementById("historyList").innerHTML=app.history.length?app.history.map((item,index)=>
    '<button class="history-row" type="button" data-history="'+index+'"><span>'+esc(item.query)+
    (item.title?" · 《"+esc(item.title)+"》":"")+"</span><small>"+esc(new Date(item.time).toLocaleString("zh-CN"))+
    " · "+Number(item.total||0)+" 条</small></button>").join(""):
    '<p class="notice">还没有检索记录。</p>';
  document.querySelectorAll("[data-history]").forEach(button=>button.onclick=()=>{
    const item=app.history[Number(button.dataset.history)];
    app.author=item.author||"";app.title=item.title||"";
    app.mode=["phrase","all","any"].includes(item.mode)?item.mode:"phrase";app.page=0;
    showTab("search");authorOptions();workOptions();
    document.querySelector('input[name="matchMode"][value="'+app.mode+'"]').checked=true;
    document.getElementById("question").value=item.query;
    performSearch(false);
  });
}

document.getElementById("analyzeButton").onclick=()=>{app.page=0;performSearch();};
document.getElementById("question").onkeydown=event=>{
  if (event.key==="Enter") {event.preventDefault();app.page=0;performSearch();}
};
document.getElementById("browseButton").onclick=()=>showTab("documents");
document.getElementById("catalogQuery").oninput=renderDocuments;
document.getElementById("clearHistory").onclick=()=>{
  app.history=[];saveHistory();renderHistory();
};
document.getElementById("quickQuestions").innerHTML=examples.map((term,index)=>
  '<button class="chip" type="button" data-quick="'+index+'">'+esc(term)+"</button>").join("");
document.querySelectorAll("[data-quick]").forEach(button=>button.onclick=()=>{
  document.getElementById("question").value=examples[Number(button.dataset.quick)];
  app.mode="phrase";app.page=0;
  document.querySelector('input[name="matchMode"][value="phrase"]').checked=true;
  performSearch();
});
document.querySelectorAll('input[name="matchMode"]').forEach(input=>input.onchange=()=>{
  app.mode=input.value;app.page=0;
  if (app.lastResult) performSearch(false);
});
document.getElementById("authorFilter").onchange=event=>{
  app.author=event.target.value;app.title="";app.page=0;workOptions();
  if (app.lastResult) performSearch(false);
};
document.getElementById("workFilter").onchange=event=>{
  app.title=event.target.value;app.page=0;
  if (app.lastResult) performSearch(false);
};

loadHistory();
renderNav();
renderStats();
authorOptions();
workOptions();
if (!Array.isArray(window.CLASSIC_CORPUS)) notifyError("未找到 corpus.js，请保持项目文件结构完整。");
