// ============================================================
// 搜索脚本 v5.4 — 精简稳定版（仅已验证可用的引擎）
// ============================================================

// ⚠️ 安全 console（必须放最前面，防止 console 未定义导致崩溃）
var console = typeof console !== 'undefined' ? console : {
  warn: function(){}, log: function(){}, error: function(){}
};

// ========== 配置 ==========
var CONFIG = {
  userAgent: "Mozilla/5.0 QuickJS-SearchBot/5.4",
  defaultResultSize: 8,
  maxResultSize: 20,

  // 🔥 已验证可用的引擎（国内手机网络均可访问）
  engines: [
    // MediaWiki 类 — 稳定可靠
    { name: "moegirl",  type: "mediawiki",
      api: "https://zh.moegirl.org.cn/api.php",
      page: "https://zh.moegirl.org.cn/" },
    { name: "bwiki_ys", type: "mediawiki",
      api: "https://wiki.biligame.com/ys/api.php",
      page: "https://wiki.biligame.com/ys/" },
    { name: "bwiki_ak", type: "mediawiki",
      api: "https://wiki.biligame.com/arknights/api.php",
      page: "https://wiki.biligame.com/arknights/" },

    // B站专栏 — API 可能限流，仅 @ 路由启用
    { name: "bilibili", type: "bilibili",
      page: "https://www.bilibili.com/read/cv" },

    // 百度百科 — 有反爬，仅 @baike 显式启用
    { name: "baike",    type: "baike",
      page: "https://baike.baidu.com/item/" },

    // 维基百科 — 国内需代理，仅 @wiki 启用
    { name: "wikipedia", type: "mediawiki",
      api: "https://zh.wikipedia.org/w/api.php",
      page: "https://zh.wikipedia.org/wiki/" }
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

// ========== MediaWiki 搜索 ==========
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
        "User-Agent": "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36",
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

// ========== 百度百科搜索 ==========
function searchBaiduBaike(engine, query, limit) {
  try {
    var url = engine.page + encodeURIComponent(query);
    var res = fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36",
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

  // 路由配置：仅包含稳定的引擎
  var routeMap = {
    "@game":   ["bwiki_ys", "bwiki_ak", "moegirl"],
    "@anime":  ["moegirl"],
    "@learn":  ["moegirl"],
    "@baike":  ["baike"],
    "@wiki":   ["wikipedia"],
    "@full":   ["moegirl", "bwiki_ys", "bwiki_ak", "bilibili", "baike"]
  };

  for (var tag in routeMap) {
    if (query.indexOf(tag) === 0) {
      routeTag = tag;
      query = query.substring(tag.length).trim();
      break;
    }
  }

  // 🔥 默认: 已验证全部可用的引擎（moegirl + bwiki_ys + bwiki_ak + bilibili）
  var order = routeMap[routeTag] || ["moegirl", "bwiki_ys", "bwiki_ak", "bilibili"];

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
    var r;
    if (eng.type === "bilibili") {
      r = searchBilibili(eng, query, perEngine);
    } else if (eng.type === "baike") {
      r = searchBaiduBaike(eng, query, perEngine);
    } else {
      r = searchMediaWiki(eng, query, perEngine);
    }
    if (r.items) {
      for (var i = 0; i < r.items.length; i++) all.push(r.items[i]);
    }
    // 首引擎命中 2+ 条就停，减少不必要的网络请求
    if (e === 0 && all.length >= 2) break;
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
  var testQueries = [
    { eng: "moegirl",  q: "test" },
    { eng: "bwiki_ys", q: "原神" },
    { eng: "bwiki_ak", q: "test" },
    { eng: "bilibili", q: "测试" },
    { eng: "baike",    q: "中国" },
    { eng: "wikipedia", q: "test" }
  ];

  for (var i = 0; i < testQueries.length; i++) {
    var tq = testQueries[i];
    var eng = null;
    for (var j = 0; j < CONFIG.engines.length; j++) {
      if (CONFIG.engines[j].name === tq.eng) { eng = CONFIG.engines[j]; break; }
    }
    if (!eng) continue;

    var start = Date.now();
    var r;
    if (eng.type === "bilibili") {
      r = searchBilibili(eng, tq.q, 2);
    } else if (eng.type === "baike") {
      r = searchBaiduBaike(eng, tq.q, 1);
    } else {
      r = searchMediaWiki(eng, tq.q, 2);
    }
    var ms = Date.now() - start;
    results.push({
      engine: tq.eng,
      ok: r.items && r.items.length > 0,
      count: r.items ? r.items.length : 0,
      ms: ms
    });
  }
  return { diagnostics: results };
}
