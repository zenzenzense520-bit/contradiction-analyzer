// 原著定位：仅返回语料中真实存在的中文段落，不生成答案。
function normalize(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/\s+/g," ").trim();
}

function termsFor(query) {
  const normalized = normalize(query);
  const split = normalized.split(/[\s,，、;；]+/).filter(term => term.length >= 2);
  return [...new Set([normalized,...split].filter(term => term.length >= 2))];
}

function count(text, term) {
  let total = 0, index = 0;
  while ((index = text.indexOf(term,index)) >= 0) {total += 1; index += Math.max(1,term.length);}
  return total;
}

function excerpt(text, terms) {
  const source = String(text);
  const lower = normalize(source);
  const positions = terms.map(term => lower.indexOf(term)).filter(index => index >= 0);
  const start = positions.length ? Math.max(0,Math.min(...positions)-95) : 0;
  const value = source.slice(start,start+360);
  return `${start ? "…" : ""}${value}${start+360 < source.length ? "…" : ""}`;
}

function search(query, filters={}) {
  const corpus = Array.isArray(window.CLASSIC_CORPUS) ? window.CLASSIC_CORPUS : [];
  const terms = termsFor(query);
  if (!terms.length) return {query,terms:[],hits:[],total:0,scanned:corpus.length};
  const exact = terms[0];
  const ranked = [];
  for (const passage of corpus) {
    if (filters.author && passage.author !== filters.author) continue;
    if (filters.title && passage.title !== filters.title) continue;
    const text = normalize(passage.text);
    const metadata = normalize(`${passage.author} ${passage.title} ${passage.location}`);
    const matched = terms.filter(term => text.includes(term) || metadata.includes(term));
    if (!matched.length) continue;
    let score = matched.reduce((sum,term) => sum + count(text,term)*3 + count(metadata,term)*7,0);
    if (text.includes(exact)) score += 12;
    if (metadata.includes(exact)) score += 20;
    ranked.push({...passage,score,matched,excerpt:excerpt(passage.text,matched)});
  }
  ranked.sort((a,b) => b.score-a.score || a.author.localeCompare(b.author,"zh-CN") || a.title.localeCompare(b.title,"zh-CN") || a.page-b.page || a.paragraph-b.paragraph);
  return {query,terms,hits:ranked.slice(0,80),total:ranked.length,scanned:corpus.length};
}

function catalog() {
  const corpus = Array.isArray(window.CLASSIC_CORPUS) ? window.CLASSIC_CORPUS : [];
  const works = new Map();
  for (const item of corpus) {
    const key = `${item.author}\u0000${item.title}`;
    const current = works.get(key) || {author:item.author,title:item.title,paragraphs:0,pages:new Set(),url:item.url,language:item.language};
    current.paragraphs += 1; current.pages.add(item.url); works.set(key,current);
  }
  return [...works.values()].map(work => ({...work,pages:work.pages.size}));
}

window.CaRetrieval = {search,catalog,termsFor};
