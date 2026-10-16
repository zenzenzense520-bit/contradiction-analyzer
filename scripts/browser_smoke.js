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

// 浏览器验证升级：保留截图，覆盖分页、目录筛选和窄屏布局。
async function command(socket, id, method, params={}) {
  return new Promise((resolve,reject) => {
    const timer = setTimeout(() => reject(new Error("页面交互超时")),10000);
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;
      clearTimeout(timer);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    };
    socket.send(JSON.stringify({id,method,params}));
  });
}

async function evaluate(socket, expression) {
  const response=await command(socket,1,"Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
  return response.result.value;
}

async function capture(socket,name) {
  const response=await command(socket,2,"Page.captureScreenshot",{format:"png",captureBeyondViewport:false});
  fs.writeFileSync(path.join(root,"logs",name),Buffer.from(response.data,"base64"));
}

async function main() {
  assert.ok(edge,"未找到 Microsoft Edge，无法运行浏览器测试");
  const child = spawn(edge,["--headless","--disable-gpu","--no-first-run","--window-size=1440,1000","--remote-debugging-port=0",
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
    await capture(socket,"preview-home.png");
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
    await capture(socket,"preview-results.png");
    const pagination=await evaluate(socket,'(() => { document.querySelector("[data-page=next]").click(); return {cards:document.querySelectorAll(".citation").length,first:document.querySelector(".source-label").innerText}; })()');
    assert.equal(pagination.cards,12,"下一页应显示 12 条");
    assert.ok(pagination.first.includes("13"),"翻页后仍显示首页段落");
    const modes=await evaluate(socket,'(() => { document.getElementById("question").value="国家 革命"; document.querySelector("input[value=all]").click(); const all=document.querySelector(".result-title span").innerText; document.querySelector("input[value=any]").click(); const any=document.querySelector(".result-title span").innerText; return {all,any}; })()');
    assert.ok(modes.all.includes("命中") && modes.any.includes("命中"),"多词匹配控件没有更新结果");
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
    const catalog=await evaluate(socket,'(() => { document.querySelector("[data-tab=documents]").click(); const field=document.getElementById("catalogQuery"); field.value="矛盾论"; field.dispatchEvent(new Event("input")); const count=document.querySelectorAll(".doc").length; document.querySelector("[data-doc]").click(); return {count,author:document.getElementById("authorFilter").value,work:document.getElementById("workFilter").value}; })()');
    assert.equal(catalog.count,1,"目录搜索应定位到一部作品");
    assert.equal(catalog.author,"毛泽东");
    assert.equal(catalog.work,"矛盾论");
    await evaluate(socket,'(() => { const author=document.getElementById("authorFilter"); author.value=""; author.dispatchEvent(new Event("change")); document.querySelector("input[value=phrase]").click(); document.getElementById("question").value="剩余价值"; document.getElementById("analyzeButton").click(); })()');
    await command(socket,3,"Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
    const mobile=await evaluate(socket,'({width:document.documentElement.scrollWidth,viewport:window.innerWidth,navigation:getComputedStyle(document.getElementById("mobileNav")).display})');
    assert.ok(mobile.width<=mobile.viewport+1,"移动端出现横向溢出");
    assert.equal(mobile.navigation,"grid","移动端导航未显示");
    await capture(socket,"preview-mobile.png");
    console.log(`通过：真实 Edge 检索“剩余价值”，显示 ${result.cards} 条原著位置。`);
    console.log("通过：作者与作品筛选定位到毛泽东《实践论》。");
    console.log("通过：扩展文库定位到周恩来《和平共处五项原则》。");
    console.log("通过：分页、多词模式、目录定位与 390px 移动布局；截图保存在 logs/。");
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
