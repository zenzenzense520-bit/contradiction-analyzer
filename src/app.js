// 主程序：导航路由、原著检索、文献目录；通用工具挂 window.CaUI 供各模块复用。
const app = { tab: "search", author: "", title: "", mode: "phrase", page: 0, lastResult: null };
const pageSize = 12;
const mainTabs = [["search", "原著检索"], ["topics", "专题学习"], ["daily", "每日精读"], ["documents", "文献库"], ["mine", "我的学习"]];
const secondaryViews = ["reader", "settings"];
const examples = ["剩余价值", "生产关系", "主要矛盾", "无产阶级", "帝国主义"];

// HTML 转义，防止正文与标题注入。
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, char =>
    ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"}[char]));
}

// 仅允许指向中文马克思主义文库的 https 链接。
function safeUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === "www.marxists.org" ? esc(parsed.href) : "";
  } catch {
    return "";
  }
}

function notifyError(message) {
  const element = document.getElementById("appError");
  element.textContent = message;
  element.classList.remove("hidden");
}

function clearError() {
  document.getElementById("appError").classList.add("hidden");
}

// 主导航渲染（桌面顶部与移动端底部共用）。
function renderNav() {
  const html = mainTabs.map(([id, label]) =>
    '<button type="button" class="' + (app.tab === id ? "active" : "") + '" data-tab="' + id + '"' +
    (app.tab === id ? ' aria-current="page"' : "") + ">" + label + "</button>").join("");
  for (const id of ["topNav", "mobileNav"]) document.getElementById(id).innerHTML = html;
  document.querySelectorAll("[data-tab]").forEach(button => (button.onclick = () => showTab(button.dataset.tab)));
}

// 切换主标签页，并隐藏全屏次级视图。
function showTab(tab) {
  if (!mainTabs.some(([id]) => id === tab)) return;
  app.tab = tab;
  for (const [id] of mainTabs) document.getElementById(id + "View").classList.toggle("hidden", id !== tab);
  for (const id of secondaryViews) document.getElementById(id + "View").classList.add("hidden");
  renderNav();
  if (tab === "documents") renderDocuments();
  if (tab === "mine") window.CaMine.render();
  if (tab === "topics") window.CaTopics.render();
  if (tab === "daily") window.CaDaily.render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// 打开全屏次级视图（阅读、使用说明）。
function showSecondary(id) {
  if (!secondaryViews.includes(id)) return;
  for (const [main] of mainTabs) document.getElementById(main + "View").classList.add("hidden");
  for (const sec of secondaryViews) document.getElementById(sec + "View").classList.toggle("hidden", sec !== id);
  renderNav();
  window.scrollTo({ top: 0 });
}

function renderStats() {
  const works = window.CaRetrieval.catalog();
  document.getElementById("workCount").textContent = works.length.toLocaleString("zh-CN");
  document.getElementById("passageCount").textContent =
    works.reduce((sum, work) => sum + work.paragraphs, 0).toLocaleString("zh-CN");
}

function authorOptions() {
  const authors = [...new Set(window.CaRetrieval.catalog().map(work => work.author))];
  const select = document.getElementById("authorFilter");
  select.innerHTML = '<option value="">全部作者</option>' +
    authors.map(author => '<option value="' + esc(author) + '">' + esc(author) + "</option>").join("");
  select.value = app.author;
}

function workOptions() {
  const works = window.CaRetrieval.catalog().filter(work => !app.author || work.author === app.author);
  const select = document.getElementById("workFilter");
  select.innerHTML = '<option value="">全部作品</option>' +
    works.map(work => '<option value="' + esc(work.title) + '">' + esc(work.title) + "</option>").join("");
  if (!works.some(work => work.title === app.title)) app.title = "";
  select.value = app.title;
}

// 关键词高亮（长词优先，避免短词覆盖长词）。
function highlighted(text, terms) {
  if (!terms.length) return esc(text);
  const pattern = terms.map(term => term.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"))
    .sort((a, b) => b.length - a.length).join("|");
  const regex = new RegExp(pattern, "gi");
  let last = 0, html = "";
  for (const match of String(text).matchAll(regex)) {
    html += esc(text.slice(last, match.index)) + "<mark>" + esc(match[0]) + "</mark>";
    last = match.index + match[0].length;
  }
  return html + esc(text.slice(last));
}

// 单条检索结果卡片：含收藏、阅读定位、复制、来源链接。
function resultCard(hit, index, terms) {
  const source = safeUrl(hit.url);
  const fav = window.CaStore.isFavorite(hit.id);
  const localIndex = index - app.page * pageSize;
  let html = '<article class="citation"><div class="citation-top"><span class="source-label">NO. ' +
    String(index + 1).padStart(2, "0") + '</span><span>中文页面索引</span></div>';
  html += "<h3>《" + esc(hit.title) + "》</h3>";
  html += '<div class="citation-meta"><span>' + esc(hit.author) + "</span><span>" + esc(hit.location) +
    "</span><span>网页 " + Number(hit.page) + " · 索引第 " + Number(hit.paragraph) + " 段</span></div>";
  html += '<p class="excerpt">' + highlighted(hit.excerpt, terms) + "</p>";
  html += '<details class="full-text"><summary>展开索引中的完整段落</summary><p>' +
    highlighted(hit.text, terms) + "</p></details>";
  html += '<div class="citation-actions">';
  if (source) html += '<a href="' + source + '" target="_blank" rel="noopener noreferrer">文库原网页 ↗</a>';
  html += '<button type="button" data-readloc="' + localIndex + '">在阅读中定位</button>';
  html += '<button type="button" class="fav-btn' + (fav ? " is-fav" : "") + '" data-fav="' + localIndex + '">' +
    (fav ? "★ 已收藏" : "☆ 收藏") + "</button>";
  html += '<button type="button" data-copy="' + localIndex + '">复制定位</button></div></article>';
  return html;
}

function renderResults(result) {
  document.getElementById("hero").classList.add("hidden");
  const start = result.total ? app.page * pageSize + 1 : 0;
  const end = Math.min(result.total, (app.page + 1) * pageSize);
  const summary = result.total.toLocaleString("zh-CN") + " 条命中 · 显示 " + start + "–" + end + " 条";
  let html = '<div class="result-layout"><div class="result-main"><div class="result-title"><div>' +
    '<p class="eyebrow">检索结果 / RESULTS</p><h2>' + esc(result.query) + "</h2></div><span>" +
    esc(summary) + "</span></div>";
  html += '<p class="result-note">只显示当前索引中实际含有关键词的段落。索引位置不是纸本页码，引用时请核对原网页。</p>';
  if (result.hits.length) {
    html += '<div class="result-list">' +
      result.hits.map((hit, index) => resultCard(hit, app.page * pageSize + index, result.terms)).join("") + "</div>";
    const pages = Math.ceil(result.total / pageSize);
    html += '<div class="pager"><button type="button" data-page="previous"' + (app.page === 0 ? " disabled" : "") +
      '>← 上一页</button><span>第 ' + (app.page + 1) + " / " + pages + ' 页</span>' +
      '<button type="button" data-page="next"' + (app.page + 1 >= pages ? " disabled" : "") + ">下一页 →</button></div>";
  } else {
    html += '<div class="empty-result"><h3>当前范围内没有找到原文</h3><p>可缩短短语、更换关键词，或检查作者与作品筛选。</p></div>';
  }
  html += '</div><aside class="result-side"><h3>命中作品</h3>' + result.byWork.slice(0, 8).map((work, index) =>
    '<button class="facet" type="button" data-facet="' + index + '"><span>' + esc(work.title) +
    "</span><span>" + work.count + '</span></button>').join("") +
    "<p>点击作品可限定当前检索范围。</p></aside></div>";
  document.getElementById("result").innerHTML = html;
  bindResultControls(result);
}

// 绑定结果页全部按钮事件。
function bindResultControls(result) {
  document.querySelectorAll("[data-page]").forEach(button => (button.onclick = () => {
    app.page += button.dataset.page === "next" ? 1 : -1;
    performSearch(false);
    document.getElementById("result").scrollIntoView({ behavior: "smooth" });
  }));
  document.querySelectorAll("[data-facet]").forEach(button => (button.onclick = () => {
    const work = result.byWork[Number(button.dataset.facet)];
    app.author = work.author; app.title = work.title; app.page = 0;
    authorOptions(); workOptions(); performSearch(false);
  }));
  document.querySelectorAll("[data-fav]").forEach(button => (button.onclick = () => {
    const hit = result.hits[Number(button.dataset.fav)];
    if (!hit) return;
    const fav = window.CaStore.toggleFavorite(hit);
    button.classList.toggle("is-fav", fav);
    button.textContent = fav ? "★ 已收藏" : "☆ 收藏";
  }));
  document.querySelectorAll("[data-readloc]").forEach(button => (button.onclick = () => {
    const hit = result.hits[Number(button.dataset.readloc)];
    if (hit) window.CaReader.open(hit.author, hit.title, { page: hit.page, paragraph: hit.paragraph });
  }));
  document.querySelectorAll("[data-copy]").forEach(button => (button.onclick = () => {
    const hit = result.hits[Number(button.dataset.copy)];
    if (hit) copyReference(hit);
  }));
}

function performSearch(record = true) {
  clearError();
  const query = document.getElementById("question").value.trim();
  if (query.length < 2) { notifyError("请输入至少两个字的关键词或短语。"); return; }
  try {
    const result = window.CaRetrieval.search(query, {
      author: app.author, title: app.title, mode: app.mode,
      offset: app.page * pageSize, limit: pageSize
    });
    app.lastResult = result;
    renderResults(result);
    if (record) {
      window.CaStore.addHistory({
        time: new Date().toISOString(), query, author: app.author,
        title: app.title, mode: app.mode, total: result.total
      });
    }
  } catch (error) {
    notifyError("检索失败：" + error.message);
  }
}

async function copyReference(hit) {
  const reference = hit.author + "《" + hit.title + "》；" + hit.location + "；网页 " + hit.page +
    "，索引第 " + hit.paragraph + " 段。来源：" + hit.url + "\n索引段落：" + hit.text;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(reference);
    } else {
      const field = document.createElement("textarea");
      field.value = reference; field.style.position = "fixed"; field.style.opacity = "0";
      document.body.append(field); field.select();
      const copied = document.execCommand("copy");
      field.remove();
      if (!copied) throw new Error("浏览器未允许复制");
    }
    clearError();
  } catch (error) {
    notifyError("复制失败，请手动选择段落文字：" + error.message);
  }
}

// 文献库目录：开始阅读、继续阅读、在此作品中检索。
function renderDocuments() {
  const term = document.getElementById("catalogQuery").value.trim().toLowerCase();
  const works = window.CaRetrieval.catalog().filter(work =>
    (work.author + " " + work.title).toLowerCase().includes(term));
  document.getElementById("catalogCount").textContent = works.length + " 部作品";
  document.getElementById("docList").innerHTML = works.length ? works.map((work, index) => {
    const progress = window.CaStore.getProgress(work.author, work.title);
    let html = '<article class="doc"><p class="doc-author">' + esc(work.author) + " · " + esc(work.language) + "</p>";
    html += "<h3>《" + esc(work.title) + "》</h3><p>" + work.pages + " 个原网页 · " + work.paragraphs + " 个索引段落</p>";
    if (progress) html += '<p class="doc-progress">读到第 ' + progress.page + " 页 · " +
      new Date(progress.updatedAt).toLocaleDateString("zh-CN") + "</p>";
    html += '<div class="doc-actions"><button type="button" data-read="' + index + '">' +
      (progress ? "继续阅读 ↗" : "开始阅读 ↗") + '</button><button type="button" data-doc="' + index + '">在此作品中检索</button></div>';
    return html + "</article>";
  }).join("") : '<p class="notice">目录中没有匹配的作品。</p>';
  document.querySelectorAll("[data-read]").forEach(button => (button.onclick = () => {
    const work = works[Number(button.dataset.read)];
    if (work) window.CaReader.open(work.author, work.title);
  }));
  document.querySelectorAll("[data-doc]").forEach(button => (button.onclick = () => {
    const work = works[Number(button.dataset.doc)];
    app.author = work.author; app.title = work.title; app.page = 0;
    authorOptions(); workOptions(); showTab("search");
    document.getElementById("question").focus();
    if (document.getElementById("question").value.trim().length >= 2) performSearch(false);
  }));
}

// 控件初始化。
document.getElementById("analyzeButton").onclick = () => { app.page = 0; performSearch(); };
document.getElementById("question").onkeydown = event => {
  if (event.key === "Enter") { event.preventDefault(); app.page = 0; performSearch(); }
};
document.getElementById("browseButton").onclick = () => showTab("documents");
document.getElementById("catalogQuery").oninput = renderDocuments;
document.getElementById("quickQuestions").innerHTML = examples.map((term, index) =>
  '<button class="chip" type="button" data-quick="' + index + '">' + esc(term) + "</button>").join("");
document.querySelectorAll("[data-quick]").forEach(button => (button.onclick = () => {
  document.getElementById("question").value = examples[Number(button.dataset.quick)];
  app.mode = "phrase"; app.page = 0;
  document.querySelector('input[name="matchMode"][value="phrase"]').checked = true;
  performSearch();
}));
document.querySelectorAll('input[name="matchMode"]').forEach(input => (input.onchange = () => {
  app.mode = input.value; app.page = 0;
  if (app.lastResult) performSearch(false);
}));
document.getElementById("authorFilter").onchange = event => {
  app.author = event.target.value; app.title = ""; app.page = 0; workOptions();
  if (app.lastResult) performSearch(false);
};
document.getElementById("workFilter").onchange = event => {
  app.title = event.target.value; app.page = 0;
  if (app.lastResult) performSearch(false);
};

window.CaUI = { esc, safeUrl, notifyError, clearError, showTab, showSecondary };
window.app = app;
document.getElementById("guideLink").onclick = () => showSecondary("settings");
document.getElementById("settingsBack").onclick = () => showTab(app.tab);
renderNav();
renderStats();
authorOptions();
workOptions();
if (!Array.isArray(window.CLASSIC_CORPUS)) notifyError("未找到 corpus.js，请保持项目文件结构完整。");
