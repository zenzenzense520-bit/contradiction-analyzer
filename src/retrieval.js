// 检索升级：仅按段落正文匹配，支持短语/全部词/任意词与分页。
let cachedCorpus;
let cachedRecords;
let cachedCatalog;

function normalize(value) {
  return String(value ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g," ").trim();
}

function termsFor(query) {
  return [...new Set(normalize(query).split(/[\s,，、;；]+/).filter(term => term.length >= 2))];
}

function getCorpus() {
  return Array.isArray(window.CLASSIC_CORPUS) ? window.CLASSIC_CORPUS : [];
}

function records() {
  const corpus=getCorpus();
  if (corpus!==cachedCorpus) {
    cachedCorpus=corpus;
    cachedRecords=corpus.map(passage=>({passage,normalized:normalize(passage.text)}));
    cachedCatalog=null;
  }
  return cachedRecords;
}

function count(text,term) {
  let total=0,index=0;
  while ((index=text.indexOf(term,index))>=0) {
    total+=1;
    index+=Math.max(1,term.length);
  }
  return total;
}

function excerpt(text,terms) {
  const source=String(text);
  const normalized=normalize(source);
  const positions=terms.map(term=>normalized.indexOf(term)).filter(index=>index>=0);
  const start=positions.length ? Math.max(0,Math.min(...positions)-95) : 0;
  const snippet=source.slice(start,start+360);
  return (start?"…":"")+snippet+(start+360<source.length?"…":"");
}

function catalog() {
  records();
  if (cachedCatalog) return cachedCatalog;
  const works=new Map();
  for (const item of cachedCorpus) {
    const key=item.author+"\u0000"+item.title;
    const work=works.get(key) || {author:item.author,title:item.title,paragraphs:0,pages:new Set(),url:item.url,language:item.language};
    work.paragraphs+=1;
    work.pages.add(item.url);
    works.set(key,work);
  }
  cachedCatalog=[...works.values()].map(work=>({...work,pages:work.pages.size}));
  return cachedCatalog;
}

function search(query,options={}) {
  const normalized=normalize(query);
  const words=termsFor(query);
  const mode=["phrase","all","any"].includes(options.mode)?options.mode:"phrase";
  const terms=mode==="phrase"?[normalized].filter(term=>term.length>=2):words;
  const corpus=records();
  const limit=Math.min(80,Math.max(1,Number(options.limit)||80));
  const offset=Math.max(0,Number(options.offset)||0);
  if (!terms.length) return {query,terms:[],hits:[],total:0,scanned:corpus.length,offset,limit,mode,byWork:[]};
  const ranked=[];
  const byWork=new Map();
  for (const {passage,normalized:text} of corpus) {
    if (options.author && passage.author!==options.author) continue;
    if (options.title && passage.title!==options.title) continue;
    const matched=terms.filter(term=>text.includes(term));
    if (mode==="all" && matched.length!==terms.length) continue;
    if (mode==="phrase" && matched.length!==1) continue;
    if (mode==="any" && !matched.length) continue;
    const key=passage.author+"\u0000"+passage.title;
    const group=byWork.get(key)||{author:passage.author,title:passage.title,count:0};
    group.count+=1;
    byWork.set(key,group);
    const score=matched.reduce((sum,term)=>sum+count(text,term)*3,0)+matched.length*8;
    ranked.push({passage,score,matched});
  }
  ranked.sort((a,b)=>b.score-a.score ||
    a.passage.author.localeCompare(b.passage.author,"zh-CN") ||
    a.passage.title.localeCompare(b.passage.title,"zh-CN") ||
    a.passage.page-b.passage.page || a.passage.paragraph-b.passage.paragraph);
  const hits=ranked.slice(offset,offset+limit).map(item=>({
    ...item.passage,score:item.score,matched:item.matched,
    excerpt:excerpt(item.passage.text,item.matched)
  }));
  return {query,terms,hits,total:ranked.length,scanned:corpus.length,offset,limit,mode,
    byWork:[...byWork.values()].sort((a,b)=>b.count-a.count)};
}

window.CaRetrieval={search,catalog,termsFor};
