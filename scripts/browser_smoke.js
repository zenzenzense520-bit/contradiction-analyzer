// 使用真实 Edge 点击，验证检索、阅读模式、专题路径、每日精读与我的学习。
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const edgeCandidates = [process.env["PROGRAMFILES(X86)"], process.env.PROGRAMFILES]
  .filter(Boolean).map(base => path.join(base, "Microsoft", "Edge", "Application", "msedge.exe"));
const edge = edgeCandidates.find(candidate => fs.existsSync(candidate));
const profile = path.join(root, "logs", `edge-smoke-${process.pid}`);
const pageUrl = process.argv[2] || pathToFileURL(path.join(root, "index.html")).href;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function debuggerPort() {
  const file = path.join(profile, "DevToolsActivePort");
  for (let attempt = 0; attempt < 40; attempt++) {
    if (fs.existsSync(file)) return Number(fs.readFileSync(file, "utf8").split("\n")[0]);
    await sleep(250);
  }
  throw new Error("Edge 调试端口未启动");
}

// 页面目标可能晚于扩展背景页就绪，轮询等待真正的 page 目标。
async function waitForTarget(port) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const target = list.find(item => item.type === "page" && item.url.includes("index.html")
      && typeof item.webSocketDebuggerUrl === "string" && item.webSocketDebuggerUrl.startsWith("ws://"));
    if (target) return target;
    if (attempt % 5 === 0) {
      console.log("等待页面，当前目标：",
        list.filter(item => item.type === "page").map(item => `${item.url} => ${item.webSocketDebuggerUrl}`));
    }
    await sleep(250);
  }
  throw new Error("未找到本地页面目标");
}

async function command(socket, id, method, params = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("页面交互超时")), 10000);
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;
      clearTimeout(timer);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    };
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(socket, expression) {
  const response = await command(socket, 1, "Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
  return response.result.value;
}

async function capture(socket, name) {
  const response = await command(socket, 2, "Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  fs.writeFileSync(path.join(root, "logs", name), Buffer.from(response.data, "base64"));
}

async function main() {
  assert.ok(edge, "未找到 Microsoft Edge");
  const child = spawn(edge, ["--headless", "--disable-gpu", "--disable-extensions", "--no-first-run",
    "--window-size=1440,1000", "--remote-debugging-port=0", `--user-data-dir=${profile}`, pageUrl],
    { windowsHide: true, stdio: "ignore" });
  let socket;
  try {
    const port = await debuggerPort();
    const target = await waitForTarget(port);
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      ready = await evaluate(socket, `document.readyState === "complete" && typeof window.CaMine === "object"`);
      if (ready) break;
      await sleep(250);
    }
    assert.ok(ready, "页面脚本未准备好");
    await capture(socket, "preview-home.png");

    // 检索“剩余价值”，并收藏第一张卡片。
    const search = await evaluate(socket, `(() => {
      document.getElementById("question").value = "剩余价值";
      document.getElementById("analyzeButton").click();
      const favBtn = document.querySelector("[data-fav]");
      favBtn.click();
      return { cards: document.querySelectorAll(".citation").length,
        faved: favBtn.classList.contains("is-fav"),
        error: document.getElementById("appError").innerText };
    })()`);
    assert.equal(search.error, "", "页面出现错误");
    assert.equal(search.cards, 12, "应显示 12 条结果");
    assert.ok(search.faved, "结果收藏未生效");
    await capture(socket, "preview-results.png");

    // 作者作品筛选。
    const filtered = await evaluate(socket, `(() => {
      const author = document.getElementById("authorFilter");
      author.value = "毛泽东"; author.dispatchEvent(new Event("change"));
      const work = document.getElementById("workFilter");
      work.value = "实践论"; work.dispatchEvent(new Event("change"));
      document.getElementById("question").value = "实践";
      document.getElementById("analyzeButton").click();
      return document.getElementById("result").innerText;
    })()`);
    assert.ok(filtered.includes("毛泽东") && filtered.includes("《实践论》"), "筛选结果错误");

    // 专题学习：进入并点击开始阅读，打开阅读模式。
    const topics = await evaluate(socket, `(() => {
      document.querySelector("[data-tab=topics]").click();
      const cards = document.querySelectorAll(".topic").length;
      document.querySelector(".tw-read").click();
      return { cards,
        inReader: !document.getElementById("readerView").classList.contains("hidden"),
        workTitle: document.getElementById("readerWorkTitle").innerText,
        pars: document.querySelectorAll(".reader-par").length,
        toc: document.querySelectorAll(".toc-item").length };
    })()`);
    assert.ok(topics.cards >= 6, "专题数不足 6 个");
    assert.ok(topics.inReader, "点击开始阅读未进入阅读模式");
    assert.ok(topics.workTitle.includes("共产党宣言"), "阅读作品不正确");
    assert.ok(topics.pars > 50 && topics.toc === 1, "阅读正文或目录异常");

    // 阅读模式内收藏一段，出现笔记框。
    const readerFav = await evaluate(socket, `(() => {
      const btn = document.querySelector("[data-parfav]");
      btn.click();
      const wrap = btn.closest(".reader-par");
      return { fav: wrap.classList.contains("is-fav"), note: !!document.querySelector(".par-note-box") };
    })()`);
    assert.ok(readerFav.fav && readerFav.note, "阅读内收藏与笔记框异常");

    // 打开多页作品《资本论》，测目录跳转。
    await evaluate(socket, `CaReader.open("马克思","资本论·第一卷")`);
    await sleep(300);
    const capital = await evaluate(socket, `(() => ({
      toc: document.querySelectorAll(".toc-item").length,
      head: document.querySelector(".reader-page-head h3").innerText
    }))()`);
    assert.equal(capital.toc, 26, "资本论目录应为 26 页");
    assert.ok(capital.head.includes("序和跋"), "资本论起始页错误");
    await evaluate(socket, `document.querySelector('[data-tocpage="5"]').click()`);
    const page5 = await evaluate(socket, `(() => ({
      head: document.querySelector(".reader-page-head h3").innerText,
      flag: document.querySelector(".page-flag").innerText
    }))()`);
    assert.ok(page5.head.includes("货币转化为资本"), "目录跳转章节错误");
    assert.ok(page5.flag.includes("5"), "页码标识错误");
    await capture(socket, "preview-reader.png");

    // 每日精读：打卡、统计、日期切换。
    const daily = await evaluate(socket, `(() => {
      document.querySelector("[data-tab=daily]").click();
      const date = document.querySelector(".daily-date strong").innerText;
      const title = document.querySelector(".daily-passage h3").innerText;
      const textLen = document.querySelector(".dp-text").innerText.length;
      document.querySelector("[data-dmark]").click();
      return { date, title, textLen,
        done: document.querySelector(".is-done").innerText,
        streak: document.querySelector(".daily-stats div strong").innerText };
    })()`);
    assert.ok(daily.title && daily.textLen >= 60, "每日段落异常");
    assert.ok(daily.done.includes("打卡"), "打卡状态未显示");
    assert.equal(Number(daily.streak), 1, "首次打卡连续天数应为 1");
    const prevDay = await evaluate(socket, `(() => {
      document.querySelector("[data-dd=prev]").click();
      return { date: document.querySelector(".daily-date strong").innerText,
        hasMark: !!document.querySelector("[data-dmark]") };
    })()`);
    assert.notEqual(prevDay.date, daily.date, "前一天切换失败");
    assert.ok(prevDay.hasMark, "历史日期应可补打卡");
    await evaluate(socket, `document.querySelector("[data-dd=today]").click()`);

    // 我的学习：统计、收藏、历史与恢复。
    const mine = await evaluate(socket, `(() => {
      document.querySelector("[data-tab=mine]").click();
      const stats = document.querySelectorAll(".mine-stats-grid div").length;
      const favCount = Number(document.querySelector(".mine-stats-grid div strong").innerText);
      const favCards = document.querySelectorAll(".fav-card").length;
      document.querySelector("[data-mtab=history]").click();
      const historyRows = document.querySelectorAll(".history-row").length;
      return { stats, favCount, favCards, historyRows };
    })()`);
    assert.equal(mine.stats, 4, "我的学习统计卡应为 4 个");
    assert.ok(mine.favCount >= 1 && mine.favCards >= 1, "收藏未在我的学习显示");
    assert.ok(mine.historyRows > 0, "检索历史未显示");
    const restored = await evaluate(socket, `(() => {
      document.querySelector(".history-row").click();
      return { tab: document.querySelector("[data-tab=search]").classList.contains("active"),
        cards: document.querySelectorAll(".citation").length };
    })()`);
    assert.ok(restored.tab && restored.cards > 0, "历史恢复检索失败");

    // 移动端 390px：无横向溢出、底部 5 项导航、阅读目录抽屉。
    await command(socket, 3, "Emulation.setDeviceMetricsOverride",
      { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await evaluate(socket, `CaReader.open("马克思","资本论·第一卷")`);
    const mobile = await evaluate(socket, `(() => {
      document.getElementById("readerTocBtn").click();
      const tocVisible = !document.getElementById("readerToc").classList.contains("hidden");
      document.querySelector("[data-tocclose]").click();
      return { tocVisible,
        width: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
        nav: getComputedStyle(document.getElementById("mobileNav")).display,
        navItems: document.querySelectorAll("#mobileNav button").length };
    })()`);
    assert.ok(mobile.width <= mobile.viewport + 1, "移动端横向溢出");
    assert.equal(mobile.nav, "grid", "移动端底部导航未显示");
    assert.equal(mobile.navItems, 5, "移动端导航应为 5 项");
    assert.ok(mobile.tocVisible, "移动端目录抽屉未打开");
    await capture(socket, "preview-mobile.png");

    console.log("通过：检索收藏、筛选、专题进入阅读、资本论目录跳转。");
    console.log("通过：每日打卡与日期切换、我的学习统计与历史恢复。");
    console.log("通过：390px 移动布局与目录抽屉；截图保存在 logs/。");
  } finally {
    if (socket) socket.close();
    child.kill();
    await sleep(1500);
    const logsRoot = path.resolve(root, "logs") + path.sep;
    if (path.resolve(profile).startsWith(logsRoot)) {
      try {
        fs.rmSync(profile, { recursive: true, force: true });
      } catch (error) {
        // Edge 刚退出时文件可能仍被占用，等待后重试一次。
        await sleep(1200);
        try { fs.rmSync(profile, { recursive: true, force: true }); }
        catch (retryError) { console.warn("临时浏览器目录稍后可清理：" + retryError.message); }
      }
    }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
