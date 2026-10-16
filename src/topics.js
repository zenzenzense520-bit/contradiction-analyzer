// 专题学习路径：按主题把已收录作品组织为有序书单，说明文字只做客观导言。
const CaTopics = (() => {
  // 每个专题：标题、简介、作品顺序（标题须与语料一致；note 为客观导言）。
  const topics = [
    {
      id: "intro",
      title: "一、入门导论：从这里开始",
      summary: "按写作顺序阅读，看到马克思主义从纲领诞生到通俗化、系统化的过程。",
      works: [
        { title: "共产党宣言", note: "科学社会主义纲领性文献，认识马克思主义的起点。" },
        { title: "共产主义原理", note: "以问答形式通俗阐述共产主义基本主张。" },
        { title: "社会主义从空想到科学的发展", note: "概述社会主义从空想到科学的发展过程。" },
        { title: "共产主义ABC", note: "通俗教材，逐条解释共产主义基本原理。" }
      ]
    },
    {
      id: "philosophy",
      title: "二、马克思主义哲学：世界观与方法论",
      summary: "本库收录的哲学专题以《实践论》《矛盾论》为核心，讲认识方法和分析方法。",
      works: [
        { title: "实践论", note: "论认识和实践的关系，即知与行的关系。" },
        { title: "矛盾论", note: "阐述对立统一规律，提供分析问题的方法。" }
      ]
    },
    {
      id: "economy",
      title: "三、政治经济学：资本与剥削",
      summary: "从两篇通俗讲演进入，再读《资本论》第一卷，逐步理解资本如何运作。",
      works: [
        { title: "雇佣劳动与资本", note: "早期讲演，说明资本与雇佣劳动的关系。" },
        { title: "工资、价格和利润", note: "讲演，说明工资、利润与价格的关系。" },
        { title: "资本论·第一卷", note: "政治经济学主要著作，从商品分析到资本积累。" }
      ]
    },
    {
      id: "state",
      title: "四、科学社会主义与国家学说",
      summary: "从未来社会纲领，到国家的起源与本质，再到革命中的国家问题。",
      works: [
        { title: "哥达纲领批判", note: "批判纲领草案，阐述对未来社会的设想。" },
        { title: "家庭、私有制和国家的起源", note: "依据摩尔根的研究，考察家庭与国家的起源。" },
        { title: "国家与革命", note: "系统阐述马克思主义国家学说。" },
        { title: "论列宁主义基础", note: "在大学的讲演，阐述列宁主义基本问题。" },
        { title: "古巴的社会主义和人", note: "思考社会主义建设中“人”的地位。" }
      ]
    },
    {
      id: "imperialism",
      title: "五、帝国主义、殖民压迫与革命战争",
      summary: "分析帝国主义阶段，揭露殖民统治，并讨论革命武装斗争的形式。",
      works: [
        { title: "帝国主义是资本主义的最高阶段", note: "分析帝国主义的基本特征。" },
        { title: "帝国主义与革命·第一部分", note: "论帝国主义理论与革命策略。" },
        { title: "法国殖民制度的罪状", note: "分章揭露法国在殖民地的统治。" },
        { title: "游击战", note: "总结游击战的一般原则与组织方法。" }
      ]
    },
    {
      id: "china",
      title: "六、中国革命与建设",
      summary: "中国革命的分析、战略与纲领，以及周恩来等的论述、毛泽东诗词。",
      works: [
        { title: "中国社会各阶级的分析", note: "分析中国社会各阶级及其态度。" },
        { title: "论持久战", note: "分析抗日战争的进程与战略方针。" },
        { title: "新民主主义论", note: "阐述新民主主义的政治、经济与文化纲领。" },
        { title: "为人民服务", note: "短文，阐述共产党人的宗旨。" },
        { title: "团结广大人民群众一道前进", note: "讲话，谈团结大多数人一道工作。" },
        { title: "关于知识分子的改造问题", note: "谈知识分子的学习与思想改造。" },
        { title: "和平共处五项原则", note: "阐述处理国家间关系的和平共处五项原则。" },
        { title: "毛泽东诗词及本人说明", note: "毛泽东诗词及本人对诗词的解释。" }
      ]
    }
  ];

  // 按标题查作品的作者与第一页位置（信息直接来自语料）。
  function meta(title) {
    let first = null;
    for (const passage of window.CLASSIC_CORPUS) {
      if (passage.title !== title) continue;
      if (!first || passage.page < first.page) first = passage;
    }
    return first ? { author: first.author, location: first.location } : { author: "", location: "" };
  }

  // 渲染一个作品条目。
  function workItem(work, index, topicIndex) {
    const info = meta(work.title);
    const progress = CaStore.getProgress(info.author, work.title);
    let html = '<li><span class="tw-no">' + (index + 1) + "</span>";
    html += '<div class="tw-info"><h4>《' + window.CaUI.esc(work.title) + "》</h4>";
    html += '<p class="tw-meta">' + window.CaUI.esc(info.author) + " · " + window.CaUI.esc(info.location) + "</p>";
    html += '<p class="tw-note">' + window.CaUI.esc(work.note) + "</p>";
    if (progress) html += '<p class="tw-progress">已读到第 ' + progress.page + " 页</p>";
    html += "</div>";
    html += '<button type="button" class="tw-read" data-ti="' + topicIndex + '" data-wi="' + index + '">' +
      (progress ? "继续阅读" : "开始阅读") + "</button></li>";
    return html;
  }

  function render() {
    const container = document.getElementById("topicList");
    container.innerHTML = topics.map((topic, topicIndex) => {
      let html = '<article class="topic"><div class="topic-head"><h3>' +
        window.CaUI.esc(topic.title) + "</h3><p>" + window.CaUI.esc(topic.summary) + "</p></div>";
      html += '<ol class="topic-works">' +
        topic.works.map((work, index) => workItem(work, index, topicIndex)).join("") + "</ol></article>";
      return html;
    }).join("");
    document.querySelectorAll(".tw-read").forEach(button => (button.onclick = () => {
      const work = topics[Number(button.dataset.ti)].works[Number(button.dataset.wi)];
      const info = meta(work.title);
      CaReader.open(info.author, work.title);
    }));
  }

  // 暴露全部被引用作品标题，供验证脚本核对是否真实存在。
  function titles() {
    return topics.flatMap(topic => topic.works.map(work => work.title));
  }

  return { render, titles };
})();

window.CaTopics = CaTopics;
