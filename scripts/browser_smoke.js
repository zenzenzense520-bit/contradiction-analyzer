// 使用真实 Edge 的 file:// 页面点击“开始分析”，验证引文确实显示。
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
    `--user-data-dir=${profile}`,pathToFileURL(path.join(root,"index.html")).href],
    {windowsHide:true,stdio:"ignore"});
  let socket;
  try {
    const port = await debuggerPort();
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const target = targets.find(item => item.type === "page" && item.url.endsWith("/index.html"));
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
      document.getElementById("question").value = "AI 自动化怎样影响工人劳动时间？";
      document.getElementById("analyzeButton").click();
      return {cards:document.querySelectorAll(".citation").length,
        text:document.getElementById("result").innerText,
        error:document.getElementById("appError").innerText};
    })()`);
    assert.equal(result.error,"","浏览器页面出现错误");
    assert.ok(result.cards > 0,"点击分析后没有引文卡片");
    assert.ok(result.text.includes("资本论"),"分析结果没有引用相关经典原文");
    assert.ok(result.text.includes("无实时事实数据"),"事实边界说明缺失");
    const framework = await evaluate(socket,`(() => {
      document.getElementById("rlButton").click();
      document.getElementById("analyzeButton").click();
      return {sections:document.querySelectorAll(".card[id]").length,
        includesLove:document.getElementById("result").innerText.includes("8. 爱维度")};
    })()`);
    assert.equal(framework.sections,11,"R&L 页面没有显示 11 个分析维度");
    assert.ok(framework.includesLove,"R&L 的个人解放维度缺失");
    const blocked = await evaluate(socket,`(async () => {
      const previous = app.documents.length;
      const fakeFile = new File(["作者：托洛茨基"],"Trotsky.txt",{type:"text/plain"});
      await document.getElementById("fileInput").onchange.call({files:[fakeFile]});
      return app.documents.length === previous &&
        document.getElementById("appError").textContent.includes("不能导入托派作者文献");
    })()`);
    assert.ok(blocked,"托派作者文件未被拦截");
    console.log(`通过：真实 Edge 点击分析，显示 ${result.cards} 条原文引文。`);
    console.log("通过：R&L 模式显示 11 个分析维度。");
    console.log("通过：托派作者文件导入被拦截。");
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
