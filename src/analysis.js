// 分析输出：把文献观点、用户理论、事实边界和推论分别标明。
function section(key, title, text, kind) {
  return {key,title,text:Array.isArray(text)?text:[text],kind};
}

function citationText(hits) {
  return hits.length ? hits.map((hit,index) => `文献 [${index+1}]：《${hit.title}》${hit.chapter}提供了可核对的历史文本；它不能直接证明今天的经验情况。`).join(" ")
    : "本地资料未检索到足够相关的原文段落，以下只列分析问题，不给出有文献支持的结论。";
}

function makeSections(question, mode, framework, retrieval) {
  const topics = retrieval.topics;
  const leading = topics[0];
  const theme = leading ? leading.name : "当前问题";
  const tension = leading ? leading.tension : "相关主体的需要、资源与制度安排之间可能存在的张力";
  const checks = [...new Set(topics.map(topic => topic.checks))].join("；") || "时间、地点、受影响群体、可核对数据与反例";
  const evidence = citationText(retrieval.hits);
  if (mode === "literature") return [
    section("literature","文献检索结果",retrieval.hits.length?`围绕“${question}”找到 ${retrieval.hits.length} 段原文。请核对下方摘录与章节链接；英语译文不等同于中文定本。`:"没有找到可引用的相关段落。请换用更具体的作品名或关键词。","classic"),
    section("scope","收录范围","已离线收录《共产党宣言》《资本论》第一卷及部分列宁、斯大林文献；《毛泽东选集》目前只有三篇作品的短引和原文入口。列宁全集、斯大林选集均未全卷收录。","fact")
  ];
  if (mode === "chat") return [
    section("chat","基于本地资料的回答",["你的问题："+question,evidence,"本页面不连接大模型，暂不生成超出检索证据的开放式答案。"],"inference")
  ];
  if (mode === "debate") return [
    section("classic","经典文本视角",evidence,"classic"),
    section("liberal","自由主义视角",`对于${theme}，可从个人权利、选择空间、竞争和制度激励追问。此处是比较框架，不是已验证的事实。`,"other"),
    section("social","社会民主主义视角",`可进一步考察公共服务、保障、集体谈判与成本分担对${theme}的影响。`,"other"),
    section("test","分歧如何检验？",`对比不同解释对${checks}的预测，并寻找反例。`,"inference")
  ];
  const base = [
    section("reality","1. 现实是什么？",["待分析的问题："+question,"这只是用户提出的问题；页面没有实时统计，尚不能确认问题中的事实判断。"],"fact"),
    section("contradictions","2. 可能存在什么矛盾？",`关于${theme}，一个待检验的矛盾是：${tension}。是否为主要矛盾，仍需比较其他解释和现实数据。`,"inference"),
    section("history","3. 历史条件与经典文本",evidence,"classic"),
    section("resources","4. 谁拥有资源？",`针对${theme}，调查资产、技术、信息和决策权的实际控制者，区分法律所有权与实际支配。`,"inference"),
    section("costs","5. 谁承担成本？",`核对不同群体的劳动、收入风险、债务、照护或环境成本；需要按地区、性别和阶层分开看。`,"inference"),
    section("technology","6. 技术发挥了什么作用？",`考察技术能否减少必要劳动，以及收益和释放的时间由谁取得。不能把技术进步直接等同于人的解放。`,"user"),
    section("revolution","7. 革命维度",`R&L 会追问${theme}背后哪些所有权、分配和权力结构可以改变；这是用户理论的规范性提问。`,"user"),
    section("love","8. 爱维度","用具体人的自由、尊严、安全、身体自主、幸福与全面发展检验制度变化的结果。","user"),
    section("alternative","9. 其他理论如何解释？",`自由主义可强调选择和激励；社会民主主义可强调保障和再分配。对${theme}还应比较具体研究。`,"other"),
    section("conclusion","10. R&L 的暂定结论",retrieval.hits.length?`按用户定义的 R&L 框架，${tension}值得调查；经典文本提供概念线索，但不能替代当代证据。`:`当前资料不足以形成有文献支持的结论，先补充资料或收窄问题。`,"user"),
    section("limits","11. 理论局限与核验",`需要核实：${checks}。还应检验文化、心理、制度执行和个体差异，避免先有结论再找引文。`,"inference")
  ];
  if (framework === "rl") return base;
  return [base[0],base[1],base[2],base[3],base[4],base[8],base[10]];
}

window.CaAnalysis = {makeSections};
