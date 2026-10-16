// 我的学习：收藏、笔记、检索历史与学习统计；数据全部来自 CaStore。
const CaMine = (() => {
  let tab = "favorites";

  function todayString() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
      "-" + String(d.getDate()).padStart(2, "0");
  }

  function stat(value, label) {
    return '<div><strong>' + value + '</strong><span>' + label + "</span></div>";
  }

  function renderStats() {
    const favorites = CaStore.getFavorites();
    const noteCount = favorites.filter(item => item.note.trim().length > 0).length;
    const marked = Object.keys(CaStore.getDailyMap());
    const today = todayString();
    document.getElementById("mineStats").innerHTML = '<div class="mine-stats-grid">' +
      stat(favorites.length, "收藏段落") + stat(noteCount, "学习笔记") +
      stat(CaStore.streak(today), "连续打卡（天）") + stat(marked.length, "累计打卡（天）") + "</div>";
  }

  function renderTabs() {
    const favCount = CaStore.getFavorites().length;
    const hisCount = CaStore.getHistory().length;
    let html = '<button type="button" class="' + (tab === "favorites" ? "active" : "") +
      '" data-mtab="favorites">收藏与笔记 · ' + favCount + "</button>";
    html += '<button type="button" class="' + (tab === "history" ? "active" : "") +
      '" data-mtab="history">检索历史 · ' + hisCount + "</button>";
    if (tab === "history") html += '<button type="button" class="mine-clear" data-clearhist>清空历史</button>';
    document.getElementById("mineTabs").innerHTML = html;
    document.querySelectorAll("[data-mtab]").forEach(button => (button.onclick = () => {
      tab = button.dataset.mtab;
      render();
    }));
    const clear = document.querySelector("[data-clearhist]");
    if (clear) clear.onclick = () => {
      CaStore.clearHistory();
      render();
    };
  }

  // 单张收藏卡片：正文 + 可编辑笔记 + 定位/取消。
  function favoriteCard(item, index) {
    let html = '<article class="fav-card"><div class="fav-head"><h3>《' +
      window.CaUI.esc(item.title) + "》</h3><span>" + window.CaUI.esc(item.author) + "</span></div>";
    html += '<p class="fav-meta">' + window.CaUI.esc(item.location) + " · 网页 " + item.page +
      " · 第 " + item.paragraph + " 段 · " + new Date(item.addedAt).toLocaleString("zh-CN") + "</p>";
    html += '<p class="fav-text">' + window.CaUI.esc(item.text) + "</p>";
    html += '<div class="fav-note"><label>笔记</label><textarea data-note="' + index +
      '" maxlength="1000" placeholder="写点笔记…">' + window.CaUI.esc(item.note) + "</textarea></div>";
    html += '<div class="fav-actions"><button type="button" data-floc="' + index + '">阅读定位</button>' +
      '<button type="button" data-fremove="' + index + '">取消收藏</button></div></article>';
    return html;
  }

  function renderFavorites() {
    const list = CaStore.getFavorites();
    const el = document.getElementById("mineFavorites");
    el.classList.toggle("hidden", tab !== "favorites");
    el.innerHTML = list.length ? list.map(favoriteCard).join("") :
      '<p class="notice">还没有收藏。去检索或阅读时，把重点段落收藏起来。</p>';
    el.querySelectorAll("[data-note]").forEach(textarea => (textarea.oninput = () => {
      CaStore.setNote(list[Number(textarea.dataset.note)].id, textarea.value);
    }));
    el.querySelectorAll("[data-floc]").forEach(button => (button.onclick = () => {
      const item = list[Number(button.dataset.floc)];
      CaReader.open(item.author, item.title, { page: item.page, paragraph: item.paragraph });
    }));
    el.querySelectorAll("[data-fremove]").forEach(button => (button.onclick = () => {
      CaStore.removeFavorite(list[Number(button.dataset.fremove)].id);
      render();
    }));
  }

  function historyRow(item, index) {
    return '<button class="history-row" type="button" data-hi="' + index + '"><span>' +
      window.CaUI.esc(item.query) + (item.title ? " · 《" + window.CaUI.esc(item.title) + "》" : "") +
      "</span><small>" + new Date(item.time).toLocaleString("zh-CN") + " · " +
      Number(item.total || 0) + " 条</small></button>";
  }

  function renderHistory() {
    const list = CaStore.getHistory();
    const el = document.getElementById("mineHistory");
    el.classList.toggle("hidden", tab !== "history");
    el.innerHTML = list.length ? list.map(historyRow).join("") : '<p class="notice">还没有检索记录。</p>';
    el.querySelectorAll("[data-hi]").forEach(button => (button.onclick = () => {
      const item = list[Number(button.dataset.hi)];
      const state = window.app;
      state.author = item.author || "";
      state.title = item.title || "";
      state.mode = ["phrase", "all", "any"].includes(item.mode) ? item.mode : "phrase";
      state.page = 0;
      document.querySelector('input[name="matchMode"][value="' + state.mode + '"]').checked = true;
      window.authorOptions();
      window.workOptions();
      document.getElementById("question").value = item.query;
      window.CaUI.showTab("search");
      window.performSearch(false);
    }));
  }

  function render() {
    renderStats();
    renderTabs();
    renderFavorites();
    renderHistory();
  }

  return { render };
})();

window.CaMine = CaMine;
