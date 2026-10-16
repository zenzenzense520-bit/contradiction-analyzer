// 原著阅读模式：按作品连续阅读，网页导航、目录跳转、段落收藏与笔记、进度自动保存。
const CaReader = (() => {
  const state = { author: "", title: "", page: 1, pages: [], map: null, tocOpen: false, hlParagraph: 0 };

  // 从全库提取该作品，按网页（page）分组并排序。
  function build(author, title) {
    const map = new Map();
    for (const passage of window.CLASSIC_CORPUS) {
      if (passage.author !== author || passage.title !== title) continue;
      if (!map.has(passage.page)) map.set(passage.page, { location: passage.location, list: [] });
      map.get(passage.page).list.push(passage);
    }
    for (const group of map.values()) group.list.sort((a, b) => a.paragraph - b.paragraph);
    return { map, pages: [...map.keys()].sort((a, b) => a - b) };
  }

  // 打开作品；options.page 直接定位，否则读取保存的进度。
  function open(author, title, options = {}) {
    const built = build(author, title);
    if (!built.pages.length) {
      window.CaUI.notifyError("该作品暂无可阅读的段落。");
      return;
    }
    state.author = author; state.title = title;
    state.map = built.map; state.pages = built.pages;
    state.tocOpen = false; state.hlParagraph = Number(options.paragraph) || 0;
    let page = Number(options.page);
    if (!state.pages.includes(page)) {
      const progress = CaStore.getProgress(author, title);
      page = progress && state.pages.includes(progress.page) ? progress.page : state.pages[0];
    }
    state.page = page;
    window.CaUI.showSecondary("reader");
    render();
    CaStore.setProgress(author, title, { page, paragraph: state.hlParagraph || 1 });
    if (state.hlParagraph) {
      requestAnimationFrame(() => {
        const target = document.querySelector('[data-paragraph="' + state.hlParagraph + '"]');
        if (target) target.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
  }

  // 面包屑、导航类短段在阅读中弱化显示。
  function isBreadcrumb(text) {
    return text.length < 24 && (text.includes("->") || text.includes("中文马克思主义文库"));
  }

  // 单个段落渲染。
  function renderParagraph(passage) {
    const fav = CaStore.isFavorite(passage.id);
    const classes = ["reader-par"];
    if (isBreadcrumb(passage.text)) classes.push("is-breadcrumb");
    if (fav) classes.push("is-fav");
    if (state.hlParagraph === passage.paragraph) classes.push("is-hl");
    let html = '<div class="' + classes.join(" ") + '" data-id="' + window.CaUI.esc(passage.id) +
      '" data-paragraph="' + passage.paragraph + '"><p>' + window.CaUI.esc(passage.text) + "</p>";
    html += '<div class="par-actions"><button type="button" data-parfav>' +
      (fav ? "★ 已收藏" : "☆ 收藏") + "</button></div>";
    if (fav) {
      const item = CaStore.getFavorites().find(entry => entry.id === passage.id);
      html += '<div class="par-note-box"><textarea maxlength="1000" placeholder="写点笔记（仅保存在本机）">' +
        window.CaUI.esc(item ? item.note : "") + "</textarea></div>";
    }
    return html + "</div>";
  }

  function renderToc() {
    const html = '<div class="toc-head"><h3>本作品目录</h3>' +
      '<button type="button" data-tocclose aria-label="关闭目录">✕</button></div><div class="toc-list">' +
      state.pages.map(page => {
        const group = state.map.get(page);
        return '<button type="button" class="toc-item' + (page === state.page ? " active" : "") +
          '" data-tocpage="' + page + '"><span>第 ' + page + " 页</span><small>" +
          window.CaUI.esc(group.location) + "</small></button>";
      }).join("") + "</div>";
    document.getElementById("readerToc").innerHTML = html;
    document.querySelectorAll("[data-tocpage]").forEach(button => (button.onclick = () => {
      goToPage(Number(button.dataset.tocpage));
      state.tocOpen = false;
      document.getElementById("readerView").classList.remove("toc-open");
    }));
    const close = document.querySelector("[data-tocclose]");
    if (close) close.onclick = () => {
      state.tocOpen = false;
      document.getElementById("readerView").classList.remove("toc-open");
    };
  }

  function renderBody() {
    const group = state.map.get(state.page);
    document.getElementById("readerWorkTitle").textContent = "《" + state.title + "》";
    document.getElementById("readerWorkAuthor").textContent = state.author;
    const multi = state.pages.length > 1;
    document.getElementById("readerPageHead").innerHTML =
      (multi ? '<span class="page-flag">第 ' + state.page + " / " + state.pages.length + " 页</span>" : "") +
      "<h3>" + window.CaUI.esc(group.location) + "</h3>";
    document.getElementById("readerBody").innerHTML = group.list.map(renderParagraph).join("");
    document.getElementById("readerPageNav").innerHTML = multi
      ? '<button type="button" data-gopage="prev"' + (state.page === state.pages[0] ? " disabled" : "") +
        ">← 上一页</button><span>" + state.page + " / " + state.pages.length +
        '</span><button type="button" data-gopage="next"' +
        (state.page === state.pages[state.pages.length - 1] ? " disabled" : "") + ">下一页 →</button>"
      : "";
    bindBody();
  }

  // 绑定正文与页导航事件。
  function bindBody() {
    document.querySelectorAll("[data-parfav]").forEach(button => (button.onclick = () => {
      const wrap = button.closest(".reader-par");
      const passage = state.map.get(state.page).list.find(item => item.id === wrap.dataset.id);
      const fav = CaStore.toggleFavorite(passage);
      wrap.classList.toggle("is-fav", fav);
      button.textContent = fav ? "★ 已收藏" : "☆ 收藏";
      let noteBox = wrap.querySelector(".par-note-box");
      if (fav && !noteBox) {
        noteBox = document.createElement("div");
        noteBox.className = "par-note-box";
        noteBox.innerHTML = '<textarea maxlength="1000" placeholder="写点笔记（仅保存在本机）"></textarea>';
        wrap.append(noteBox);
        noteBox.querySelector("textarea").oninput = event => CaStore.setNote(wrap.dataset.id, event.target.value);
        noteBox.querySelector("textarea").focus();
      } else if (!fav && noteBox) {
        noteBox.remove();
      }
    }));
    document.querySelectorAll(".par-note-box textarea").forEach(textarea => {
      const wrap = textarea.closest(".reader-par");
      textarea.oninput = () => CaStore.setNote(wrap.dataset.id, textarea.value);
    });
    document.querySelectorAll("[data-gopage]").forEach(button => (button.onclick = () => {
      const index = state.pages.indexOf(state.page);
      const next = state.pages[button.dataset.gopage === "next" ? index + 1 : index - 1];
      if (next !== undefined) goToPage(next);
    }));
  }

  function goToPage(page) {
    if (!state.pages.includes(page)) return;
    state.page = page; state.hlParagraph = 0;
    render();
    window.scrollTo({ top: 0 });
    CaStore.setProgress(state.author, state.title, { page, paragraph: 1 });
  }

  function render() {
    document.getElementById("readerView").classList.toggle("toc-open", state.tocOpen);
    renderToc();
    renderBody();
  }

  document.getElementById("readerBack").onclick = () => window.CaUI.showTab(window.app ? window.app.tab : "search");
  document.getElementById("readerTocBtn").onclick = () => {
    state.tocOpen = !state.tocOpen;
    document.getElementById("readerView").classList.toggle("toc-open", state.tocOpen);
  };

  return { open };
})();

window.CaReader = CaReader;
