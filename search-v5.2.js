// ============================================================
// 搜索脚本 v5.2 — 多引擎并行 + 相关性排序（AI 搜索优化版）
// ============================================================

// ========== 配置 ==========
var CONFIG = {
  userAgent: "QuickJS-SearchBot/5.2",
  defaultResultSize: 10,
  maxResultSize: 30,
  engines: [
    // ---- MediaWiki 类 ----
    { name: "moegirl",   type: "mediawiki",
      api: "https://zh.moegirl.org.cn/api.php",
      page: "https://zh.moegirl.org.cn/" },
    { name: "bwiki_ys",  type: "mediawiki",
      api: "https://wiki.biligame.com/ys/api.php",
      page: "https://wiki.biligame.com/ys/" },
    { name: "bwiki_ak",  type: "mediawiki",
      api: "https://wiki.biligame.com/arknights/api.php",
      page: "https://wiki.biligame.com/arknights/" },
    { name: "wikipedia", type: "mediawiki",
      api: "https://zh.wikipedia.org/w/api.php",
      page: "https://zh.wikipedia.org/wiki/" },

    // ---- B站专栏 ----
    { name: "bilibili",  type: "bilibili",
      page: "https://www.bilibili.com/read/cv" },

    // ---- 百度百科 (HTML scrape) ----
    { name: "baike",     type: "baike",
      page: "https://baike.baidu.com/item/" }
  ]
};

// ========== 工具 ==========
function stripHtml(s) {
  return s.replace(/<[^>]*>/g, "");
}

function decodeHtmlEntities(s) {
  var entities = {
    "&amp;":"&", "&lt;":"<", "&gt;":">", "&quot;":'"', "&#39;":"'",
    "&nbsp;":" ", "&mdash;":"—", "&ndash;":"–",
    "&ldquo;":"“", "&rdquo;":"”",
    "&lsquo;":"‘", "&rsquo;":"’",
    "&hellip;":"…", "&middot;":"·"
  };
  for (var k in entities) {
    s = s.split(k).join(entities[k]);
  }
  // 十进制数字实体 &#(\d+); （可选分号）
  s = s.replace(/&#(\d+);?/g, function(_, c) {
    return String.fromCharCode(parseInt(c, 10));
  });
  // 十六进制实体 &#x([0-9a-fA-F]+);?
  s = s.replace(/&#x([0-9a-fA-F]+);?/g, function(_, c) {
    return String.fromCharCode(parseInt(c, 16));
  });
  return s;
}

// ========== MediaWiki 搜索 ==========
function searchMediaWiki(engine, query, limit) {
  try {
    var url = engine.api + "?action=query&list=search&srsearch="
            + encodeURIComponent(query)
            + "&srlimit=" + Math.min(limit, 50)
            + "&srprop=snippet|titlesnippet|wordcount|timestamp"
            + "&format=json&origin=*";
    var res = fetch(url, { headers: { "User-Agent": CONFIG.userAgent } });
    if (!res.ok) return { items: [] };
    var data = res.json();
    var sr = (data.query && data.query.search) || [];
    var items = [];
    for (var i = 0; i < sr.length; i++) {
      var rawSnippet = sr[i].snippet || sr[i].titlesnippet || "";
      var cleanSnippet = decodeHtmlEntities(stripHtml(rawSnippet));
      items.push({
        title: decodeHtmlEntities(sr[i].title),
        url: engine.page + encodeURIComponent(sr[i].title.replace(/ /g, "_")),
        text: cleanSnippet,
        engine: engine.name,
        score: (sr[i].wordcount || 100)  // 字数多的页面优先
      });
    }
    return { items: items };
  } catch (e) {
    console.warn(engine.name + " failed:", e.message);
    return { items: [] };
  }
}

// ========== B站专栏搜索 ==========
function searchBilibili(engine, query, limit) {
  try {
    var url = "https://api.bilibili.com/x/web-interface/search/type"
            + "?search_type=article&keyword=" + encodeURIComponent(query)
            + "&page=1&page_size=" + Math.min(limit, 20);
    var res = fetch(url, {
      headers: {
        "User-Agent": CONFIG.userAgent,
        "Referer": "https://www.bilibili.com/"
      }
    });
    if (!res.ok) return { items: [] };
    var data = res.json();
    if (data.code !== 0) return { items: [] };
    var articles = (data.data && data.data.result) || [];
    var items = [];
    for (var i = 0; i < articles.length && i < limit; i++) {
      var a = articles[i];
      if (!a.id) continue;  // 跳过无效条目
      var desc = a.summary || a.description || "";
      if (desc.length > 300) desc = desc.substring(0, 300) + "...";
      items.push({
        title: decodeHtmlEntities(stripHtml(a.title || "")),
        url: engine.page + a.id,
        text: decodeHtmlEntities(stripHtml(desc)),
        engine: engine.name,
        score: (a.like || 0) + (a.view || 0) / 100  // 热度评分
      });
    }
    return { items: items };
  } catch (e) {
    console.warn("bilibili failed:", e.message);
    return { items: [] };
  }
}

// ========== 百度百科搜索 (HTML scrape) ==========
function searchBaiduBaike(engine, query, limit) {
  try {
    var url = engine.page + encodeURIComponent(query);
    var res = fetch(url, {
      headers: {
        "User-Agent": CONFIG.userAgent,
        "Accept": "text/html"
      }
    });
    if (!res.ok) return { items: [] };
    var html = res.text();
    // 提取简介段落
    var paraMatch = html.match(/class="lemma-summary"[^>]*>([\s\S]*?)<\/div>/i);
    if (!paraMatch) {
      // 回退：取第一个有意义的 <p>
      paraMatch = html.match(/<p[^>]*>([\s\S]{50,500}?)<\/p>/i);
    }
    var snippet = paraMatch ? stripHtml(paraMatch[1]).trim() : "";
    if (snippet.length > 300) snippet = snippet.substring(0, 300) + "...";
    if (!snippet) return { items: [] };  // 没提取到有效内容

    return { items: [{
      title: query + " - 百度百科",
      url: url,
      text: snippet,
      engine: engine.name,
      score: 150  // 百科类结果基础分较高
    }] };
  } catch (e) {
    console.warn("baike failed:", e.message);
    return { items: [] };
  }
}

// ========== 路由：根据 @标记 / 关键词智能选引擎顺序 ==========
function resolveEngines(rawQuery) {
  var query = rawQuery;
  var routeTag = "";

  // 解析显式路由标记
  var routeMap = {
    "@game":   ["bwiki_ys", "bwiki_ak", "moegirl", "bilibili", "baike"],
    "@anime":  ["moegirl", "bilibili", "baike"],
    "@wiki":   ["wikipedia", "moegirl", "baike"],
    "@learn":  ["wikipedia", "baike", "bilibili"],
    "@baike":  ["baike", "wikipedia", "moegirl"]
  };

  for (var tag in routeMap) {
    if (query.indexOf(tag) === 0) {
      routeTag = tag;
      query = query.substring(tag.length).trim();
      break;
    }
  }

  var order = routeMap[routeTag] || [
    "moegirl", "wikipedia", "bilibili", "baike", "bwiki_ys", "bwiki_ak"
  ];

  // 按 order 顺序组装引擎对象
  var engines = [];
  for (var i = 0; i < order.length; i++) {
    for (var j = 0; j < CONFIG.engines.length; j++) {
      if (CONFIG.engines[j].name === order[i]) {
        engines.push(CONFIG.engines[j]);
        break;
      }
    }
  }
  return { engines: engines, query: query, routeTag: routeTag };
}

// ========== 相关性评分 ==========
function relevanceScore(item, queryTerms) {
  var score = item.score || 50;
  var title = (item.title || "").toLowerCase();
  var text  = (item.text  || "").toLowerCase();

  for (var i = 0; i < queryTerms.length; i++) {
    var term = queryTerms[i];
    if (term.length < 1) continue;
    // 标题命中加权
    if (title.indexOf(term) !== -1) score += 30;
    // 摘要命中
    if (text.indexOf(term) !== -1) score += 10;
    // 标题完全匹配
    if (title === term) score += 80;
  }

  // 同引擎结果微降权，增加多样性
  return score;
}

// ========== 分词（简易中文+英文） ==========
function tokenize(query) {
  // 去掉标点，按空白和中文字符边界拆分
  var cleaned = query.toLowerCase()
    .replace(/[，。！？、《》""：；（）—…\.,!?;:'"()\[\]{}]/g, " ")
    .replace(/([a-zA-Z]+)/g, " $1 ");
  var raw = cleaned.split(/[\s]+/).filter(function(t) { return t.length > 0; });
  // 对纯中文做 2-gram 补充
  var bigrams = [];
  var chinese = query.replace(/[a-zA-Z0-9\s]/g, "");
  for (var i = 0; i < chinese.length - 1; i++) {
    bigrams.push(chinese.substring(i, i + 2));
  }
  return raw.concat(bigrams);
}

// ========== 主搜索（并行引擎） ==========
function search(query, resultSize) {
  if (!resultSize || resultSize <= 0) resultSize = CONFIG.defaultResultSize;
  if (resultSize > CONFIG.maxResultSize) resultSize = CONFIG.maxResultSize;

  var resolved = resolveEngines(query);
  var engines = resolved.engines;
  query = resolved.query;
  if (!query) return { items: [], query: "", routeTag: resolved.routeTag };

  // 每引擎请求 limit = resultSize（后续合并去重后再截断）
  var perEngine = Math.max(resultSize, 10);

  // ---- 并行搜索所有引擎（QuickJS 中 fetch 顺序发起即可并发） ----
  var allResults = [];
  for (var e = 0; e < engines.length; e++) {
    var eng = engines[e];
    var r;
    if (eng.type === "bilibili") {
      r = searchBilibili(eng, query, perEngine);
    } else if (eng.type === "baike") {
      r = searchBaiduBaike(eng, query, perEngine);
    } else {
      // 默认 mediawiki
      r = searchMediaWiki(eng, query, perEngine);
    }
    if (r.items) {
      for (var i = 0; i < r.items.length; i++) {
        allResults.push(r.items[i]);
      }
    }
  }

  // ---- 去重 ----
  var seen = {};
  var dedup = [];
  for (var j = 0; j < allResults.length; j++) {
    var key = allResults[j].url;
    if (!seen[key]) {
      seen[key] = true;
      dedup.push(allResults[j]);
    }
  }

  // ---- 相关性排序 ----
  var queryTerms = tokenize(query);
  for (var k = 0; k < dedup.length; k++) {
    dedup[k].finalScore = relevanceScore(dedup[k], queryTerms);
  }
  dedup.sort(function(a, b) { return b.finalScore - a.finalScore; });

  // ---- 截断 ----
  var finalItems = dedup.slice(0, resultSize);

  // ---- 清理内部字段 ----
  for (var m = 0; m < finalItems.length; m++) {
    delete finalItems[m].score;
    delete finalItems[m].finalScore;
  }

  return {
    items: finalItems,
    query: query,
    routeTag: resolved.routeTag || "default",
    total: finalItems.length
  };
}
