// 本地学习数据层：统一封装收藏、笔记、阅读进度、每日打卡、检索历史。
// 所有读写均做异常兜底，localStorage 不可用时不影响页面其他功能。
const CaStore = (() => {
  const KEYS = {
    history: "source-locator-history",
    favorites: "marxist-favorites",
    progress: "marxist-reader-progress",
    daily: "marxist-daily"
  };

  // 读取并解析一个键，失败或不存在时返回 fallback。
  function readKey(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      console.warn("本地数据读取失败：" + key, error);
      return fallback;
    }
  }

  // 序列化写入一个键，失败（如配额已满）返回 false。
  function writeKey(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn("本地数据写入失败：" + key, error);
      return false;
    }
  }

  // —— 检索历史（保留旧键，兼容历史版本）——
  function getHistory() {
    const value = readKey(KEYS.history, []);
    return Array.isArray(value)
      ? value.filter(item => item && typeof item.query === "string").slice(0, 30)
      : [];
  }

  function addHistory(entry) {
    const list = getHistory();
    list.unshift(entry);
    writeKey(KEYS.history, list.slice(0, 30));
    return list;
  }

  function clearHistory() {
    writeKey(KEYS.history, []);
  }

  // —— 收藏与笔记：数组按收藏时间倒序，每项携带完整定位信息 ——
  function getFavorites() {
    const value = readKey(KEYS.favorites, []);
    return Array.isArray(value)
      ? value.filter(item => item && typeof item.id === "string")
      : [];
  }

  function saveFavorites(list) {
    return writeKey(KEYS.favorites, list);
  }

  function isFavorite(id) {
    return getFavorites().some(item => item.id === id);
  }

  // 收藏或取消收藏；返回处理后的收藏状态（true=已收藏）。
  function toggleFavorite(passage) {
    const list = getFavorites();
    const index = list.findIndex(item => item.id === passage.id);
    if (index >= 0) {
      list.splice(index, 1);
      saveFavorites(list);
      return false;
    }
    list.unshift({
      id: passage.id, author: passage.author, title: passage.title,
      location: passage.location, page: passage.page, paragraph: passage.paragraph,
      url: passage.url, text: passage.text, note: "", addedAt: new Date().toISOString()
    });
    saveFavorites(list);
    return true;
  }

  function setNote(id, note) {
    const list = getFavorites();
    const item = list.find(entry => entry.id === id);
    if (!item) return false;
    item.note = String(note ?? "").slice(0, 1000);
    return saveFavorites(list);
  }

  function removeFavorite(id) {
    saveFavorites(getFavorites().filter(item => item.id !== id));
  }

  // —— 阅读进度：键为“作者|标题” ——
  function workKey(author, title) {
    return author + "|" + title;
  }

  function getAllProgress() {
    const value = readKey(KEYS.progress, {});
    return value && typeof value === "object" ? value : {};
  }

  function getProgress(author, title) {
    return getAllProgress()[workKey(author, title)] || null;
  }

  function setProgress(author, title, position) {
    const all = getAllProgress();
    all[workKey(author, title)] = {
      page: Number(position.page) || 1,
      paragraph: Number(position.paragraph) || 1,
      updatedAt: new Date().toISOString()
    };
    writeKey(KEYS.progress, all);
  }

  // —— 每日打卡：映射 “YYYY-MM-DD” -> {id, markedAt} ——
  function getDailyMap() {
    const value = readKey(KEYS.daily, {});
    return value && typeof value === "object" ? value : {};
  }

  function dailyStatus(date) {
    return getDailyMap()[date] || null;
  }

  function markDaily(date, id) {
    const all = getDailyMap();
    if (!all[date]) {
      all[date] = { id, markedAt: new Date().toISOString() };
      writeKey(KEYS.daily, all);
    }
    return all[date];
  }

  function unmarkDaily(date) {
    const all = getDailyMap();
    delete all[date];
    writeKey(KEYS.daily, all);
  }

  // 本地日期字符串解析（避免 new Date("YYYY-MM-DD") 被按 UTC 解析）。
  function parseDate(string) {
    const parts = string.split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  // 以某日期为基准前后移动指定天数，返回日期字符串。
  function shiftDate(string, delta) {
    const base = parseDate(string);
    const next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + delta);
    const y = next.getFullYear();
    const m = String(next.getMonth() + 1).padStart(2, "0");
    const d = String(next.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  // 连续打卡天数：今天没打卡则从昨天起向前数，断一天即终止。
  function streak(baseDate) {
    const marked = new Set(Object.keys(getDailyMap()));
    let cursor = baseDate;
    let count = 0;
    if (!marked.has(cursor)) cursor = shiftDate(cursor, -1);
    while (marked.has(cursor)) {
      count += 1;
      cursor = shiftDate(cursor, -1);
    }
    return count;
  }

  return {
    getHistory, addHistory, clearHistory,
    getFavorites, isFavorite, toggleFavorite, setNote, removeFavorite,
    getProgress, setProgress, workKey,
    getDailyMap, dailyStatus, markDaily, unmarkDaily, shiftDate, streak
  };
})();

window.CaStore = CaStore;
