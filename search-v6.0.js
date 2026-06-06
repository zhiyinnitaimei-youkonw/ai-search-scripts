// ============================================================
// 搜索脚本 v6.0 — 全量引擎版 (10 引擎, 全部国内可达)
// ============================================================

var console = typeof console !== 'undefined' ? console : {
  warn: function(){}, log: function(){}, error: function(){}
};

// ========== 配置 ==========
var CONFIG = {
  userAgent: "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36",
  defaultResultSize: 10,
  maxResultSize: 30,

  engines: [
    // ---- MediaWiki 类 (8个) ----
    { name: "moegirl",    cat: "wiki",
      api: "https://zh.moegirl.org.cn/api.php",
      page: "https://zh.moegirl.org.cn/" },
    { name: "bwiki_ys",   cat: "game",
      api: "https://wiki.biligame.com/ys/api.php",
      page: "https://wiki.biligame.com/ys/" },
    { name: "bwiki_sr",   cat: "game",
      api: "https://wiki.biligame.com/sr/api.php",
      page: "https://wiki.biligame.com/sr/" },
    { name: "bwiki_ak",   cat: "game",
      api: "https://wiki.biligame.com/arknights/api.php",
      page: "https://wiki.biligame.com/arknights/" },
    { name: "bwiki_zzz",  cat: "game",
      api: "https://wiki.biligame.com/zzz/api.php",
      page: "https://wiki.biligame.com/zzz/" },
    { name: "bwiki_bh3",  cat: "game",
      api: "https://wiki.biligame.com/bh3/api.php",
      page: "https://wiki.biligame.com/bh3/" },
    { name: "bwiki_blhx", cat: "game",
      api: "https://wiki.biligame.com/blhx/api.php",
      page: "https://wiki.biligame.com/blhx/" },
    { name: "wikipedia",  cat: "wiki",
      api: "https://zh.wikipedia.org/w/api.php",
      page: "https://zh.wikipedia.org/wiki/" },

    // ---- 专栏/文章类 ----
    { name: "bilibili",   cat: "article",
      page: "https://www.bilibili.com/read/cv" },
    { name: "juejin",     cat: "tech",
      page: "https://juejin.cn/post/" },

    // ---- 百科类（需显式路由，有反爬） ----
    { name: "baike",      cat: "encyclopedia",
      page: "https://baike.baidu.com/item/" }
  ]
};

// ========== 工具 ==========
function stripHtml(s) {
  return s.replace(/<[^>]*>/g, "");
}

function decodeHtmlEntities(s) {
  var e = { "&amp;":"&","&lt;":"<","&gt;":">","&quot;":'"',"&#39;":"'",
            "&nbsp;":" ","&mdash;":"—","&ndash;":"–",
            "&ldquo;":"“","&rdquo;":"”",
            "&lsquo;":"‘","&rsquo;":"’",
            "&hellip;":"…","&middot;":"·" };
  for (var k in e) s = s.split(k).join(e[k]);
  s = s.replace(/&#(\d+);?/g, function(_,c){ return String.fromCharCode(parseInt(c,10)); });
  s = s.replace(/&#x([0-9a-fA-F]+);?/g, function(_,c){ return String.fromCharCode(parseInt(c,16)); });
  return s;
}

// ========== MediaWiki 搜索（通用） ==========
function searchMediaWiki(engine, query, limit) {
  try {
    var url = engine.api + "?action=query&list=search&srsearch="
            + encodeURIComponent(query)
            + "&srlimit=" + Math.min(limit, 30)
            + "&srprop=snippet|titlesnippet&format=json&origin=*";
    var res = fetch(url, { headers: { "User-Agent": CONFIG.userAgent } });
    if (!res || !res.ok) return { items: [] };
    var data = res.json();
    var sr = (data.query && data.query.search) || [];
    var items = [];
    for (var i = 0; i < sr.length; i++) {
      items.push({
        title: decodeHtmlEntities(sr[i].title),
        url: engine.page + encodeURIComponent(sr[i].title.replace(/ /g, "_")),
        text: decodeHtmlEntities(stripHtml(sr[i].snippet || "")),
        engine: engine.name
      });
    }
    return { items: items };
  } catch (e) {
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
        "Referer": "https://www.bilibili.com/",
        "Accept": "application/json"
      }
    });
    if (!res || !res.ok) return { items: [] };
    var data = res.json();
    if (data.code !== 0) return { items: [] };
    var articles = (data.data && data.data.result) || [];
    var items = [];
    for (var i = 0; i < articles.length && i < limit; i++) {
      var a = articles[i];
      if (!a.id) continue;
      var desc = a.summary || a.description || "";
      if (desc.length > 300) desc = desc.substring(0, 300) + "...";
      items.push({
        title: decodeHtmlEntities(stripHtml(a.title || "")),
        url: engine.page + a.id,
        text: decodeHtmlEntities(stripHtml(desc)),
        engine: engine.name
      });
    }
    return { items: items };
  } catch (e) {
    return { items: [] };
  }
}

// ========== 掘金技术文章搜索 ==========
function searchJuejin(engine, query, limit) {
  try {
    var body = JSON.stringify({
      query: query,
      limit: Math.min(limit, 20),
      cursor: "0",
      sort_type: 0  // 0=综合 1=最新 2=最热
    });
    var res = fetch("https://api.juejin.cn/search_api/v1/search", {
      method: "POST",
      headers: {
        "User-Agent": CONFIG.userAgent,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: body
    });
    if (!res || !res.ok) return { items: [] };
    var data = res.json();
    if (data.err_no !== 0) return { items: [] };
    var results = data.data || [];
    var items = [];
    for (var i = 0; i < results.length && i < limit; i++) {
      var r = results[i];
      if (r.result_type !== 2) continue;  // type 2 = 文章
      var info = r.result_model && r.result_model.article_info;
      if (!info || !info.article_id) continue;
      var brief = info.brief_content || "";
      if (brief.length > 300) brief = brief.substring(0, 300) + "...";
      items.push({
        title: info.title || "",
        url: engine.page + info.article_id,
        text: brief,
        engine: engine.name
      });
    }
    return { items: items };
  } catch (e) {
    return { items: [] };
  }
}

// ========== 百度百科搜索 ==========
function searchBaiduBaike(engine, query, limit) {
  try {
    var url = engine.page + encodeURIComponent(query);
    var res = fetch(url, {
      headers: {
        "User-Agent": CONFIG.userAgent,
        "Accept": "text/html"
      }
    });
    if (!res || !res.ok) return { items: [] };
    var html = res.text();
    var para = html.match(/class="lemma-summary"[^>]*>([\s\S]*?)<\/div>/i);
    if (!para) para = html.match(/<p[^>]*>([\s\S]{30,500}?)<\/p>/i);
    var snippet = para ? stripHtml(para[1]).trim() : "";
    if (snippet.length > 300) snippet = snippet.substring(0, 300) + "...";
    if (!snippet) return { items: [] };
    return { items: [{
      title: query + " - 百度百科",
      url: url, text: snippet, engine: engine.name
    }] };
  } catch (e) {
    return { items: [] };
  }
}

// ========== 路由 ==========
function resolveEngines(rawQuery) {
  var query = rawQuery;
  var routeTag = "";

  var routeMap = {
    // 游戏 → 全部游戏 Wiki
    "@game":   ["bwiki_ys","bwiki_sr","bwiki_ak","bwiki_zzz","bwiki_bh3","bwiki_blhx","moegirl"],
    // 动漫 → 萌娘
    "@anime":  ["moegirl","bilibili"],
    // 技术/学习 → 掘金 + B站
    "@learn":  ["juejin","bilibili","moegirl"],
    "@tech":   ["juejin","bilibili"],
    // 百科 → 百度百科 + 萌娘
    "@baike":  ["baike","moegirl"],
    // Wiki → 萌娘 + 维基
    "@wiki":   ["moegirl","wikipedia"],
    // 全量 → 所有引擎（调试用）
    "@all":    ["moegirl","bilibili","juejin","bwiki_ys","bwiki_sr","bwiki_ak","bwiki_zzz","bwiki_bh3","bwiki_blhx"]
  };

  for (var tag in routeMap) {
    if (query.indexOf(tag) === 0) {
      routeTag = tag;
      query = query.substring(tag.length).trim();
      break;
    }
  }

  // 默认：通用知识（萌娘 + B站 + 掘金）
  var order = routeMap[routeTag] || [
    "moegirl", "bilibili", "juejin", "bwiki_ys"
  ];

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

// ========== 主搜索 ==========
function search(query, resultSize) {
  if (!resultSize || resultSize <= 0) resultSize = CONFIG.defaultResultSize;
  if (resultSize > CONFIG.maxResultSize) resultSize = CONFIG.maxResultSize;

  var resolved = resolveEngines(query);
  var engines = resolved.engines;
  query = resolved.query;
  if (!query) return { items: [], query: "", routeTag: null };

  var perEngine = Math.max(resultSize, 10);
  var all = [];

  for (var e = 0; e < engines.length; e++) {
    var eng = engines[e];
    // 调度：按 cat 字段选择搜索函数
    var searchFn;
    switch (eng.cat) {
      case "article":  searchFn = searchBilibili; break;
      case "tech":     searchFn = searchJuejin; break;
      case "encyclopedia": searchFn = searchBaiduBaike; break;
      default:         searchFn = searchMediaWiki; break;  // wiki / game
    }

    var r = searchFn(eng, query, perEngine);
    if (r.items) {
      for (var i = 0; i < r.items.length; i++) all.push(r.items[i]);
    }

    // 前2个引擎有足够结果就提前退出
    if (e <= 1 && all.length >= resultSize) break;
  }

  // 去重
  var seen = {}, dedup = [];
  for (var j = 0; j < all.length; j++) {
    if (!seen[all[j].url]) { seen[all[j].url] = true; dedup.push(all[j]); }
  }

  return {
    items: dedup.slice(0, resultSize),
    query: query,
    routeTag: resolved.routeTag || "default",
    total: dedup.length
  };
}

// ========== 连通性自检 ==========
function test() {
  var results = [];
  var tests = [
    { eng: "moegirl",    q: "test", fn: searchMediaWiki },
    { eng: "bwiki_ys",   q: "原神", fn: searchMediaWiki },
    { eng: "bwiki_sr",   q: "星穹", fn: searchMediaWiki },
    { eng: "bwiki_ak",   q: "test", fn: searchMediaWiki },
    { eng: "bwiki_zzz",  q: "test", fn: searchMediaWiki },
    { eng: "bwiki_bh3",  q: "test", fn: searchMediaWiki },
    { eng: "bwiki_blhx", q: "test", fn: searchMediaWiki },
    { eng: "bilibili",   q: "测试", fn: searchBilibili },
    { eng: "juejin",     q: "Python", fn: searchJuejin },
    { eng: "baike",      q: "中国", fn: searchBaiduBaike },
    { eng: "wikipedia",  q: "test", fn: searchMediaWiki }
  ];

  for (var i = 0; i < tests.length; i++) {
    var t = tests[i];
    var eng = null;
    for (var j = 0; j < CONFIG.engines.length; j++) {
      if (CONFIG.engines[j].name === t.eng) { eng = CONFIG.engines[j]; break; }
    }
    if (!eng) continue;
    var start = Date.now();
    var r = t.fn(eng, t.q, 2);
    var ms = Date.now() - start;
    results.push({
      engine: t.eng,
      ok: r.items && r.items.length > 0,
      count: r.items ? r.items.length : 0,
      ms: ms
    });
  }
  return { diagnostics: results };
}
