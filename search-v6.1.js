// ============================================================
// 搜索脚本 v6.1 — 全量引擎版（13引擎 · 分层调度 · AI搜索优化）
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
    // ── 轻量级（JSON/XML API，响应 <10KB）──
    { name: "bing",       cat: "web",
      page: "https://cn.bing.com/search?format=rss&count=10&q=" },
    { name: "moegirl",    cat: "wiki",
      api: "https://zh.moegirl.org.cn/api.php",
      page: "https://zh.moegirl.org.cn/" },

    // ── 中等（JSON API, 响应 <20KB）──
    { name: "bilibili",   cat: "article",
      page: "https://www.bilibili.com/read/cv" },
    { name: "juejin",     cat: "tech",
      page: "https://juejin.cn/post/" },

    // ── 游戏 Wiki（JSON API, 响应 <1KB）──
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

    // ── 重量级（HTML 抓取，响应 >40KB，仅显式路由）──
    { name: "baike",      cat: "heavy",
      page: "https://baike.baidu.com/item/" },
    { name: "sogou",      cat: "heavy",
      page: "https://www.sogou.com/web?query=" },
    { name: "wikipedia",  cat: "blocked",
      api: "https://zh.wikipedia.org/w/api.php",
      page: "https://zh.wikipedia.org/wiki/" }
  ]
};

// ========== 工具 ==========
function stripHtml(s) { return s.replace(/<[^>]*>/g, ""); }

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

function decodeXmlEntities(s) {
  return s.replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&")
          .replace(/&quot;/g,'"').replace(/&apos;/g,"'");
}

// ========== Bing RSS 搜索（通用网页 · 仅5KB） ==========
function searchBing(engine, query, limit) {
  try {
    var url = engine.page + encodeURIComponent(query);
    var res = fetch(url, {
      headers: { "User-Agent": CONFIG.userAgent, "Accept": "application/rss+xml" }
    });
    if (!res || !res.ok) return { items: [] };
    var xml = res.text();
    // 正则提取 <item> 块
    var itemRe = /<item>([\s\S]*?)<\/item>/gi;
    var items = [];
    var match;
    while ((match = itemRe.exec(xml)) !== null && items.length < limit) {
      var block = match[1];
      var title = (block.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || "";
      var link  = (block.match(/<link>([\s\S]*?)<\/link>/i) || [])[1] || "";
      var desc  = (block.match(/<description>([\s\S]*?)<\/description>/i) || [])[1] || "";
      title = decodeXmlEntities(stripHtml(title)).trim();
      desc  = decodeXmlEntities(stripHtml(desc)).trim();
      link  = link.trim();
      if (desc.length > 300) desc = desc.substring(0, 300) + "...";
      if (title && link) {
        items.push({
          title: title, url: link, text: desc, engine: engine.name
        });
      }
    }
    return { items: items };
  } catch (e) {
    return { items: [] };
  }
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

// ========== 掘金技术搜索 ==========
function searchJuejin(engine, query, limit) {
  try {
    var body = JSON.stringify({
      query: query, limit: Math.min(limit, 20),
      cursor: "0", sort_type: 0
    });
    var res = fetch("https://api.juejin.cn/search_api/v1/search", {
      method: "POST",
      headers: {
        "User-Agent": CONFIG.userAgent,
        "Content-Type": "application/json"
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
      if (r.result_type !== 2) continue;
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

// ========== 百度百科 ==========
function searchBaiduBaike(engine, query, limit) {
  try {
    var url = engine.page + encodeURIComponent(query);
    var res = fetch(url, {
      headers: { "User-Agent": CONFIG.userAgent, "Accept": "text/html" }
    });
    if (!res || !res.ok) return { items: [] };
    var html = res.text();
    var para = html.match(/class="lemma-summary"[^>]*>([\s\S]*?)<\/div>/i);
    if (!para) para = html.match(/<p[^>]*>([\s\S]{30,500}?)<\/p>/i);
    var snippet = para ? stripHtml(para[1]).trim() : "";
    if (snippet.length > 300) snippet = snippet.substring(0, 300) + "...";
    if (!snippet) return { items: [] };
    return { items: [{
      title: query + " - 百度百科", url: url, text: snippet, engine: engine.name
    }] };
  } catch (e) {
    return { items: [] };
  }
}

// ========== 搜狗搜索（HTML抓取，仅@full） ==========
function searchSogou(engine, query, limit) {
  try {
    var url = engine.page + encodeURIComponent(query);
    var res = fetch(url, {
      headers: { "User-Agent": CONFIG.userAgent, "Accept": "text/html" }
    });
    if (!res || !res.ok) return { items: [] };
    var html = res.text();
    // 搜狗结果块: <div class="vrwrap"> or <div class="rb">
    var blocks = html.match(/<div[^>]*class="[^"]*(?:vrwrap|rb)[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>/gi);
    if (!blocks) blocks = html.match(/<h3[^>]*>[\s\S]*?<\/h3>/gi);
    var items = [];
    for (var i = 0; i < (blocks ? blocks.length : 0) && items.length < limit; i++) {
      var b = blocks[i];
      var title = stripHtml((b.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i) || [])[1] || "");
      var link  = ((b.match(/href="([^"]*)"/i) || [])[1] || "");
      var desc  = stripHtml((b.match(/<p[^>]*>([\s\S]*?)<\/p>/i) || [])[1] || "");
      if (desc.length > 200) desc = desc.substring(0, 200) + "...";
      if (title && link) items.push({
        title: decodeHtmlEntities(title), url: link, text: decodeHtmlEntities(desc), engine: engine.name
      });
    }
    return { items: items };
  } catch (e) {
    return { items: [] };
  }
}

// ========== 引擎调度 ==========
function dispatchEngine(eng) {
  switch (eng.name) {
    case "bing":       return searchBing;
    case "bilibili":   return searchBilibili;
    case "juejin":     return searchJuejin;
    case "baike":      return searchBaiduBaike;
    case "sogou":      return searchSogou;
    default:           return searchMediaWiki;  // wiki / game / wikipedia
  }
}

// ========== 路由 ==========
function resolveEngines(rawQuery) {
  var query = rawQuery;
  var routeTag = "";

  var routeMap = {
    "@game":   ["bwiki_ys","bwiki_sr","bwiki_ak","bwiki_zzz","bwiki_bh3","bwiki_blhx","moegirl"],
    "@anime":  ["bing","moegirl","bilibili"],
    "@learn":  ["juejin","bing","bilibili"],
    "@tech":   ["juejin","bing"],
    "@baike":  ["baike","bing","moegirl"],
    "@wiki":   ["moegirl","bing"],
    "@web":    ["bing","sogou"],
    "@all":    ["bing","moegirl","bilibili","juejin","bwiki_ys","bwiki_sr","bwiki_ak","bwiki_zzz","bwiki_bh3","bwiki_blhx","baike","sogou"]
  };

  // 每个路由的最少搜索引擎数（防止过早退出）
  var minEnginesMap = {
    "@game": 3,
    "@all":  99,
    "@web":  2
  };

  for (var tag in routeMap) {
    if (query.indexOf(tag) === 0) {
      routeTag = tag;
      query = query.substring(tag.length).trim();
      break;
    }
  }

  var order = routeMap[routeTag] || [
    "bing", "moegirl", "bilibili", "juejin"
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

  var minEngines = minEnginesMap[routeTag] || 2;

  return { engines: engines, query: query, routeTag: routeTag, minEngines: minEngines };
}

// ========== 中文最小匹配过滤（防拆词噪音） ==========
function minMatchFilter(items, query) {
  var chinese = query.replace(/[a-zA-Z0-9\s]/g, "");
  if (chinese.length < 2) return items;

  var bigrams = [];
  for (var i = 0; i < chinese.length - 1; i++) {
    bigrams.push(chinese.substring(i, i + 2));
  }

  return items.filter(function(item) {
    var haystack = ((item.title || "") + " " + (item.text || "")).toLowerCase();
    for (var i = 0; i < bigrams.length; i++) {
      if (haystack.indexOf(bigrams[i]) !== -1) return true;
    }
    return false;
  });
}

// ========== 主搜索 ==========
function search(query, resultSize) {
  if (!resultSize || resultSize <= 0) resultSize = CONFIG.defaultResultSize;
  if (resultSize > CONFIG.maxResultSize) resultSize = CONFIG.maxResultSize;

  var resolved = resolveEngines(query);
  var engines = resolved.engines;
  query = resolved.query;
  var minEngines = resolved.minEngines || 2;
  if (!query) return { items: [], query: "", routeTag: null };

  var perEngine = Math.max(resultSize, 10);
  var all = [];

  for (var e = 0; e < engines.length; e++) {
    var eng = engines[e];
    var fn = dispatchEngine(eng);
    var r = fn(eng, query, perEngine);
    if (r.items) {
      for (var i = 0; i < r.items.length; i++) all.push(r.items[i]);
    }
    // 搜满 minEngines 个引擎后才允许提前退出
    if (e >= minEngines - 1 && all.length >= resultSize) break;
  }

  // 去重
  var seen = {}, dedup = [];
  for (var j = 0; j < all.length; j++) {
    if (!seen[all[j].url]) { seen[all[j].url] = true; dedup.push(all[j]); }
  }

  // @all 路由：最小匹配过滤
  if (resolved.routeTag === "@all") {
    dedup = minMatchFilter(dedup, query);
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
    ["bing","Python",searchBing],
    ["moegirl","test",searchMediaWiki],
    ["bilibili","测试",searchBilibili],
    ["juejin","Python",searchJuejin],
    ["bwiki_ys","原神",searchMediaWiki],
    ["bwiki_sr","星穹",searchMediaWiki],
    ["bwiki_ak","test",searchMediaWiki],
    ["bwiki_zzz","test",searchMediaWiki],
    ["bwiki_bh3","test",searchMediaWiki],
    ["bwiki_blhx","test",searchMediaWiki],
    ["baike","中国",searchBaiduBaike],
    ["sogou","test",searchSogou],
    ["wikipedia","test",searchMediaWiki]
  ];
  for (var i = 0; i < tests.length; i++) {
    var t = tests[i];
    var eng = null;
    for (var j = 0; j < CONFIG.engines.length; j++) {
      if (CONFIG.engines[j].name === t[0]) { eng = CONFIG.engines[j]; break; }
    }
    if (!eng) continue;
    var start = Date.now();
    var r = t[2](eng, t[1], 2);
    var ms = Date.now() - start;
    results.push({
      engine: t[0],
      ok: r.items && r.items.length > 0,
      count: r.items ? r.items.length : 0,
      ms: ms
    });
  }
  return { diagnostics: results };
}
