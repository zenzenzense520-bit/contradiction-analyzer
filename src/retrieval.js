// 文献检索：只返回真实存储的段落，并把中文问题映射到英语译本的检索词。
const topicRules = [
  {id:"work",name:"劳动与就业",test:/就业|工作|失业|工资|劳动|工时|打工|岗位|职业|剥削|job|labou?r|wage/i,
   terms:["labour","labor","wages","working day","employment","workman"],
   tension:"劳动者对收入与自主时间的需要，和雇用、劳动控制及收益分配方式之间的张力",checks:"岗位数量、工资、工时、就业质量与社会保障"},
  {id:"tech",name:"技术与自动化",test:/人工智能|\bAI\b|自动化|机器人|技术|机器|算法|平台|machin|technolog|automat/i,
   terms:["machinery","machine","productivity","labour","working day"],
   tension:"技术提高生产能力的可能性，和技术所有权、劳动替代及收益分配之间的张力",checks:"生产率、工时、就业变化、技术收益归属与自由时间"},
  {id:"housing",name:"住房与土地",test:/住房|房价|租房|土地|地产|房贷|housing|land|rent/i,
   terms:["rent","land","property","housing","expropriation"],
   tension:"居住需要，和土地、住房的占有与价格形成机制之间的张力",checks:"房价租金、收入、土地制度、住房供给及家庭负担"},
  {id:"global",name:"国际关系",test:/国际|贸易|帝国主义|殖民|战争|国家利益|民族|外资|全球|imperial|coloni|nation/i,
   terms:["imperialism","capital export","monopoly","colonies","nations"],
   tension:"不同国家、资本与劳动者的利益分配及权力关系之间的张力",checks:"贸易、资本流动、产业链、军事影响、国际法与当地居民意愿"},
  {id:"family",name:"家庭与性别",test:/家庭|婚姻|生育|性别|女性|照护|婚恋|family|marriage|women/i,
   terms:["family","women","property","labour","wages"],
   tension:"个人自主与照护需要，和家庭财产、性别分工及经济依赖之间的张力",checks:"照护时间、收入依赖、身体自主与个人选择"},
  {id:"state",name:"国家与制度",test:/国家|政府|制度|权力|革命|民主|阶级|state|revolution|class/i,
   terms:["state","class","revolution","power","democracy"],
   tension:"社会成员的政治参与和权利要求，和现实权力结构之间的张力",checks:"制度安排、决策权、监督机制与具体权利保障"},
];
const stopWords = new Set(["the","and","for","with","what","why","how","does","from","this","that","into","have","will","about","whether"]);

function detectTopics(question) {
  return topicRules.filter(rule => rule.test.test(question));
}

function questionTerms(question, topics) {
  const latin = (question.toLowerCase().match(/[a-z]{3,}/g) || []).filter(word => !stopWords.has(word));
  return [...new Set([...latin, ...topics.flatMap(topic => topic.terms)])];
}

function userPassages(documents) {
  return documents.flatMap((doc, docIndex) =>
    String(doc.text || "").split(/\n\s*\n/).filter(part => part.trim().length > 25)
      .slice(0, 350).map((part, partIndex) => ({
        id:`user-${docIndex}-${partIndex}`,title:doc.title,author:doc.author || "用户导入",
        chapter:"导入文本",url:"",text:part.trim(),kind:"用户文献"
      }))
  );
}

function scorePassage(passage, question, terms, topics) {
  const haystack = passage.text.toLowerCase();
  const title = (passage.title + " " + passage.author + " " + passage.chapter).toLowerCase();
  let score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 2 : 0) + (title.includes(term) ? 3 : 0), 0);
  // 两字以上的连续词片段可检索中文标题和用户导入文本，避免单字碰巧重合。
  const chinesePhrases = question.match(/[\u4e00-\u9fff]{2,}/g) || [];
  const chineseTerms = new Set();
  for (const phrase of chinesePhrases) {
    for (let size=2;size<=Math.min(4,phrase.length);size++) {
      for (let start=0;start<=phrase.length-size;start++) chineseTerms.add(phrase.slice(start,start+size));
    }
  }
  let importedMatches = 0;
  for (const word of chineseTerms) {
    if (title.includes(word)) score += word.length >= 3 ? 5 : 2;
    if (passage.kind === "用户文献" && haystack.includes(word)) {
      score += word.length >= 3 ? 3 : 1;
      importedMatches += 1;
    }
  }
  if (passage.kind === "用户文献" && importedMatches >= 2) score += 15;
  if (topics.some(topic => topic.id === "tech") && title.includes("资本论")) score += 1;
  return score;
}

function excerptFor(passage, terms) {
  const lower = passage.text.toLowerCase();
  const found = terms.map(term => lower.indexOf(term)).filter(index => index >= 0);
  const start = found.length ? Math.max(0, Math.min(...found) - 140) : 0;
  const excerpt = passage.text.slice(start, start + 560);
  return `${start ? "…" : ""}${excerpt}${start + 560 < passage.text.length ? "…" : ""}`;
}

function retrieve(question, documents) {
  const topics = detectTopics(question);
  const terms = questionTerms(question, topics);
  const corpus = Array.isArray(window.CLASSIC_CORPUS) ? window.CLASSIC_CORPUS : [];
  const ranked = corpus.concat(userPassages(documents)).map(passage => ({
    ...passage, score:scorePassage(passage, question, terms, topics)
  })).filter(passage => passage.score >= 2).sort((a,b) => b.score - a.score);
  const selected = [];
  const countByWork = new Map();
  for (const passage of ranked) {
    const count = countByWork.get(passage.title) || 0;
    if (count >= 2) continue;
    selected.push({...passage, excerpt:excerptFor(passage,terms)});
    countByWork.set(passage.title, count + 1);
    if (selected.length === 4) break;
  }
  return {topics, hits:selected, scanned:corpus.length};
}

window.CaRetrieval = {retrieve, detectTopics};
