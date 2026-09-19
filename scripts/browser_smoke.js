// 使用真实 Edge 点击检索，验证本地或线上页面显示原著位置。
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {spawn} = require("node:child_process");
const {pathToFileURL} = require("node:url");

const root = path.resolve(__dirname,"..");
const edgeCandidates = [process.env["PROGRAMFILES(X86)"],process.env.PROGRAMFILES]
  .filter(Boolean).map(base => path.join(base,"Microsoft","Edge","Application","msedge.exe"));
const edge = edgeCandidates.find(candidate => fs.existsSync(candidate));
const profile = path.join(root,"logs",`edge-smoke-${process.pid}`);
const pageUrl = process.argv[2] || pathToFileURL(path.join(root,"index.html")).href;
const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));

async function debuggerPort() {
  const file = path.join(profile,"DevToolsActivePort");
  for (let attempt=0;attempt<40;attempt++) {
    if (fs.existsSync(file)) return Number(fs.readFileSync(file,"utf8").split("\n")[0]);
    await sleep(250);
  }
  throw new Error("Edge 调试端口未启动");
}

async function evaluate(socket, expression) {
  return new Promise((resolve,reject) => {
    const timer = setTimeout(() => reject(new Error("页面交互超时")),10000);
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      clearTimeout(timer);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result.result.value);
    };
    socket.send(JSON.stringify({id:1,method:"Runtime.evaluate",params:{expression,returnByValue:true,awaitPromise:true}}));
  });
}

async function main() {
  assert.ok(edge,"未找到 Microsoft Edge，无法运行浏览器测试");
  const child = spawn(edge,["--headless","--disable-gpu","--no-first-run","--remote-debugging-port=0",
    `--user-data-dir=${profile}`,pageUrl],
    {windowsHide:true,stdio:"ignore"});
  let socket;
  try {
    const port = await debuggerPort();
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const target = targets.find(item => item.type === "page" && item.url.startsWith(pageUrl));
    assert.ok(target,"未找到本地 HTML 页面");
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve,reject) => {socket.onopen=resolve;socket.onerror=reject;});
    let ready = false;
    for (let attempt=0;attempt<40;attempt++) {
      ready = await evaluate(socket,`document.readyState === "complete" &&
        typeof window.CaRetrieval === "object" &&
        document.querySelectorAll("[data-tab]").length > 0`);
      if (ready) break;
      await sleep(250);
    }
    assert.ok(ready,"本地页面脚本未准备好");
    const result = await evaluate(socket,`(() => {
      document.getElementById("question").value = "剩余价值";
      document.getElementById("analyzeButton").click();
      return {cards:document.querySelectorAll(".citation").length,
        text:document.getElementById("result").innerText,
        error:document.getElementById("appError").innerText};
    })()`);
    assert.equal(result.error,"","浏览器页面出现错误");
    assert.ok(result.cards > 0,"点击检索后没有原著卡片");
    assert.ok(result.text.includes("剩余价值") && result.text.includes("打开中文马克思主义文库原网页"),"原文或来源链接缺失");
    const filtered = await evaluate(socket,`(() => {
      const author=document.getElementById("authorFilter");author.value="毛泽东";author.dispatchEvent(new Event("change"));
      const work=document.getElementById("workFilter");work.value="实践论";work.dispatchEvent(new Event("change"));
      document.getElementById("question").value="实践";
      document.getElementById("analyzeButton").click();
      return document.getElementById("result").innerText;
    })()`);
    assert.ok(filtered.includes("毛泽东") && filtered.includes("《实践论》"),"作者作品筛选未显示正确结果");
    assert.ok(!filtered.includes("用户理论") && !filtered.includes("R&L"),"旧分析输出仍然存在");
    // 新增文库必须在真实浏览器中可按作者和作品定位。
    const expanded = await evaluate(socket,`(() => {
      const author=document.getElementById("authorFilter");author.value="周恩来";author.dispatchEvent(new Event("change"));
      const work=document.getElementById("workFilter");work.value="和平共处五项原则";work.dispatchEvent(new Event("change"));
      document.getElementById("question").value="和平共处";
      document.getElementById("analyzeButton").click();
      return document.getElementById("result").innerText;
    })()`);
    assert.ok(expanded.includes("周恩来") && expanded.includes("《和平共处五项原则》"),"扩展文库未显示正确结果");
    console.log(`通过：真实 Edge 检索“剩余价值”，显示 ${result.cards} 条原著位置。`);
    console.log("通过：作者与作品筛选定位到毛泽东《实践论》。");
    console.log("通过：扩展文库定位到周恩来《和平共处五项原则》。");
  } finally {
    if (socket) socket.close();
    child.kill();
    await sleep(1500);
    // 临时浏览器目录必须位于项目 logs 内，测试后移除以免不断占用 D 盘。
    const logsRoot = path.resolve(root,"logs") + path.sep;
    if (path.resolve(profile).startsWith(logsRoot)) {
      try {fs.rmSync(profile,{recursive:true,force:true});}
      catch (error) {console.warn("临时浏览器目录稍后可清理："+error.message);}
    }
  }
}

main().catch(error => {console.error(error);process.exitCode=1;});
