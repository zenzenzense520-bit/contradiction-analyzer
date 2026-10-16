// 每日精读：按日期从原著中确定性选取一段，支持打卡、收藏、回看与连续天数统计。
const CaDaily = (() => {
  let pool = null;
  let viewDate = "";

  function format(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  function todayString() {
    return format(new Date());
  }

  // 构建候选池：长度适中、非面包屑导航、非单独的章节标题。
  function buildPool() {
    if (pool) return pool;
    pool = window.CLASSIC_CORPUS.filter(passage => {
      const text = passage.text.trim();
      return passage.text.length >= 60 && passage.text.length <= 600 &&
        !passage.text.includes("中文马克思主义文库 ->") &&
        !/^(第[一二三四五六七八九十百]+[章节]|目\s*录|前\s*言|序\s*言)$/.test(text);
    });
    return pool;
  }

  // FNV-1a 32 位哈希，保证同一天总是得到同一段。
  function hash32(string) {
    let h = 0x811c9dc5;
    for (let i = 0; i < string.length; i++) {
      h ^= string.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  function passageFor(date) {
    const list = buildPool();
    return list[hash32(date) % list.length];
  }

  // 顶部统计：连续、累计、本月打卡天数。
  function renderStatsBlock() {
    const today = todayString();
    const marked = Object.keys(CaStore.getDailyMap());
    const monthPrefix = today.slice(0, 7);
    const monthCount = marked.filter(date => date.startsWith(monthPrefix)).length;
    const html = '<div class="daily-stats"><div><strong>' + CaStore.streak(today) +
      '</strong><span>连续打卡（天）</span></div><div><strong>' + marked.length +
      '</strong><span>累计打卡（天）</span></div><div><strong>' + monthCount +
      '</strong><span>本月打卡（天）</span></div></div>';
    document.getElementById("dailyStats").innerHTML = html;
  }

  function renderCard() {
    const passage = passageFor(viewDate);
    const today = todayString();
    const status = CaStore.dailyStatus(viewDate);
    const fav = CaStore.isFavorite(passage.id);
    const source = window.CaUI.safeUrl(passage.url);
    let html = '<article class="daily-card"><div class="daily-date"><strong>' + viewDate + "</strong>";
    html += '<div class="daily-nav"><button type="button" data-dd="prev">← 前一天</button>' +
      '<button type="button" data-dd="today">今天</button>' +
      '<button type="button" data-dd="next"' + (viewDate >= today ? " disabled" : "") + ">后一天 →</button></div></div>";
    html += '<div class="daily-passage"><h3>《' + window.CaUI.esc(passage.title) + "》</h3>";
    html += '<p class="dp-meta">' + window.CaUI.esc(passage.author) + " · " + window.CaUI.esc(passage.location) + "</p>";
    html += '<p class="dp-text">' + window.CaUI.esc(passage.text) + "</p>";
    html += '<div class="dp-actions">';
    if (status) {
      html += '<button type="button" class="is-done" disabled>✓ 已打卡</button>';
      html += '<button type="button" data-dunmark>取消打卡</button>';
    } else if (viewDate < today) {
      html += '<button type="button" class="primary" data-dmark>补打卡</button>';
    } else if (viewDate === today) {
      html += '<button type="button" class="primary" data-dmark>读完打卡</button>';
    }
    html += '<button type="button" data-dfav>' + (fav ? "★ 已收藏" : "☆ 收藏") + "</button>";
    html += '<button type="button" data-dread>在阅读中打开</button>';
    if (source) html += '<a href="' + source + '" target="_blank" rel="noopener noreferrer">文库原网页</a>';
    html += "</div></div></article>";
    document.getElementById("dailyCard").innerHTML = html;
  }

  function bind() {
    document.querySelectorAll("[data-dd]").forEach(button => (button.onclick = () => {
      const action = button.dataset.dd;
      if (action === "prev") viewDate = CaStore.shiftDate(viewDate, -1);
      else if (action === "next") viewDate = CaStore.shiftDate(viewDate, 1);
      else viewDate = todayString();
      render();
    }));
    const mark = document.querySelector("[data-dmark]");
    if (mark) mark.onclick = () => {
      CaStore.markDaily(viewDate, passageFor(viewDate).id);
      render();
    };
    const unmark = document.querySelector("[data-dunmark]");
    if (unmark) unmark.onclick = () => {
      CaStore.unmarkDaily(viewDate);
      render();
    };
    const fav = document.querySelector("[data-dfav]");
    if (fav) fav.onclick = () => {
      CaStore.toggleFavorite(passageFor(viewDate));
      render();
    };
    const read = document.querySelector("[data-dread]");
    if (read) read.onclick = () => {
      const passage = passageFor(viewDate);
      CaReader.open(passage.author, passage.title, { page: passage.page, paragraph: passage.paragraph });
    };
  }

  function render() {
    if (!viewDate) viewDate = todayString();
    renderCard();
    renderStatsBlock();
    bind();
  }

  // 暴露日期选段与候选池大小，供验证脚本核对确定性与有效性。
  return { render, pick: passageFor, poolSize: () => buildPool().length };
})();

window.CaDaily = CaDaily;
