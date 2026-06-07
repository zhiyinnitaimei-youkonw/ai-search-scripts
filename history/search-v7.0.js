// ============================================================
// 搜索脚本 v7.0 — 16引擎 + 深度搜索 + 全路由降噪
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
    { name: "bing",       cat: "web",     page: "https://cn.bing.com/search?format=rss&count=10&q=" },
    { name: "moegirl",    cat: "wiki",    api: "https://zh.moegirl.org.cn/api.php", page: "https://zh.moegirl.org.cn/" },
    { name: "bilibili",   cat: "article", page: "https://www.bilibili.com/read/cv" },
    { name: "juejin",     cat: "tech",    page: "https://juejin.cn/post/" },
    { name: "bwiki_ys",   cat: "game",    api: "https://wiki.biligame.com/ys/api.php", page: "https://wiki.biligame.com/ys/" },
    { name: "bwiki_sr",   cat: "game",    api: "https://wiki.biligame.com/sr/api.php", page: "https://wiki.biligame.com/sr/" },
    { name: "bwiki_ak",   cat: "game",    api: "https://wiki.biligame.com/arknights/api.php", page: "https://wiki.biligame.com/arknights/" },
    { name: "bwiki_zzz",  cat: "game",    api: "https://wiki.biligame.com/zzz/api.php", page: "https://wiki.biligame.com/zzz/" },
    { name: "bwiki_bh3",  cat: "game",    api: "https://wiki.biligame.com/bh3/api.php", page: "https://wiki.biligame.com/bh3/" },
    { name: "bwiki_blhx", cat: "game",    api: "https://wiki.biligame.com/blhx/api.php", page: "https://wiki.biligame.com/blhx/" },
    { name: "bwiki_endfield", cat: "game", api: "https://wiki.biligame.com/zmd/api.php", page: "https://wiki.biligame.com/zmd/" },
    { name: "bwiki_wuwa", cat: "game",    api: "https://wiki.biligame.com/ww/api.php", page: "https://wiki.biligame.com/ww/" },
    { name: "bwiki_gbf",  cat: "game",    api: "https://wiki.biligame.com/gbf/api.php", page: "https://wiki.biligame.com/gbf/" },
    { name: "prts_wiki",  cat: "game",    api: "https://prts.wiki/api.php", page: "https://prts.wiki/" },
    { name: "baike",      cat: "heavy",   page: "https://baike.baidu.com/item/" },
    { name: "wikipedia",  cat: "blocked", api: "https://zh.wikipedia.org/w/api.php", page: "https://zh.wikipedia.org/wiki/" }
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

// ========== CN->EN 映射 ==========
var CN_EN_MAP = {
  "原神":"Genshin Impact","崩坏3":"Honkai Impact 3rd","星穹铁道":"Honkai Star Rail",
  "崩坏：星穹铁道":"Honkai Star Rail","明日方舟":"Arknights","绝区零":"Zenless Zone Zero",
  "碧蓝航线":"Azur Lane","王者荣耀":"Honor of Kings","终末地":"Arknights Endfield",
  "鸣潮":"Wuthering Waves","碧蓝幻想":"Granblue Fantasy",
  "钟离":"Zhongli","胡桃":"Hu Tao","雷电将军":"Raiden Shogun","纳西妲":"Nahida",
  "芙宁娜":"Furina","万叶":"Kazuha","夜兰":"Yelan","神里绫华":"Kamisato Ayaka",
  "甘雨":"Ganyu","魈":"Xiao","可莉":"Klee","温迪":"Venti",
  "丹恒":"Dan Heng","景元":"Jing Yuan","银狼":"Silver Wolf","刃":"Blade",
  "卡芙卡":"Kafka","符玄":"Fu Xuan","史尔特尔":"Surtr","玛恩纳":"Mlynar",
  "艾莲":"Ellen Joe","鲨鱼妹":"Ellen Joe","星见雅":"Miyabi","莱万汀":"Laevatein",
  "爱莉希雅":"Elysia","卡缪":"Camus Endfield",
  "圣遗物":"artifact","圣痕":"stigmata","模组":"module","攻略":"guide",
  "搭配":"build","配队":"team comp","技能":"skill","命座":"constellation","武器":"weapon"
};

function translateForBing(query) {
  var parts = query.split(/[\s,，、。！？]+/);
  var out = [];
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i].trim();
    if (!p) continue;
    if (CN_EN_MAP[p]) out.push(CN_EN_MAP[p]);
    else out.push(p);  // 保留原词（Bing自己处理）
  }
  return out.join(" ");
}

// ========== 游戏分类器 ==========
var GAME_SIGNATURES = [
  { keys: ["原神","Genshin","提瓦特"], wiki: "bwiki_ys" },
  { keys: ["星穹铁道","星穹","Star Rail","崩坏：星穹"], wiki: "bwiki_sr" },
  { keys: ["明日方舟","Arknights","罗德岛","源石","终末地"], wiki: "bwiki_ak" },
  { keys: ["绝区零","Zenless","ZZZ","新艾利都"], wiki: "bwiki_zzz" },
  { keys: ["崩坏3","崩坏3rd","Honkai Impact","休伯利安"], wiki: "bwiki_bh3" },
  { keys: ["碧蓝航线","Azur Lane"], wiki: "bwiki_blhx" },
  { keys: ["鸣潮","Wuthering Waves"], wiki: "bwiki_wuwa" },
  { keys: ["碧蓝幻想","Granblue Fantasy","GBF"], wiki: "bwiki_gbf" },
];

function detectGame(items) {
  for (var i = 0; i < items.length; i++) {
    var haystack = ((items[i].title||"") + " " + (items[i].text||"")).toLowerCase();
    for (var j = 0; j < GAME_SIGNATURES.length; j++) {
      for (var k = 0; k < GAME_SIGNATURES[j].keys.length; k++) {
        if (haystack.indexOf(GAME_SIGNATURES[j].keys[k].toLowerCase()) !== -1) {
          return GAME_SIGNATURES[j].wiki;
        }
      }
    }
  }
  return null;
}

// ========== 分词 & 降噪 ==========
function extractKeyTerms(query) {
  var parts = query.split(/[\s,，、。！？]+/);
  var terms = [];
  for (var i = 0; i < parts.length; i++) {
    var t = parts[i].trim();
    if (t.length >= 2) terms.push(t);
  }
  terms.sort(function(a, b) { return b.length - a.length; });
  return terms.slice(0, 4);
}

var BING_NOISE_WORDS = [
  "攻略","推荐","搭配","怎么","如何","什么","最强","哪个",
  "厉害","值得","可以","应该","需要","怎么样","好不好",
  "2026","2025","2024","最新","教程","入门","详解"
];

function simplifyForBing(query) {
  var parts = query.split(/[\s,，、。！？]+/);
  var clean = [];
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i].trim();
    if (!p) continue;
    var isNoise = false;
    for (var j = 0; j < BING_NOISE_WORDS.length; j++) {
      if (p === BING_NOISE_WORDS[j]) { isNoise = true; break; }
    }
    if (!isNoise) clean.push(p);
  }
  if (clean.length === 0) return [query];

  function smartJoin(words) {
    var out = "";
    for (var i = 0; i < words.length; i++) {
      if (i > 0) {
        var prevLatin = /[a-zA-Z]$/.test(out);
        var currLatin = /^[a-zA-Z]/.test(words[i]);
        out += (prevLatin || currLatin) ? " " : "";
      }
      out += words[i];
    }
    return out;
  }

  var candidates = [];
  if (clean.length >= 2) candidates.push(smartJoin(clean.slice(0, 2)));
  var longest = clean[0];
  for (var i = 1; i < clean.length; i++) {
    if (clean[i].length > longest.length) longest = clean[i];
  }
  if (longest !== (candidates[0] || "")) candidates.push(longest);
  candidates.push(smartJoin(clean));
  return candidates;
}

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

// ========== 搜索引擎实现 ==========

// --- Bing RSS ---
function searchBing(engine, query, limit) {
  function _fetch(q, n) {
    var url = engine.page + encodeURIComponent(q);
    var res = fetch(url, { headers: { "User-Agent": CONFIG.userAgent, "Accept": "application/rss+xml" } });
    if (!res || !res.ok) return [];
    var xml = res.text();
    var re = /<item>([\s\S]*?)<\/item>/gi;
    var items = []; var m;
    while ((m = re.exec(xml)) !== null && items.length < (n || limit)) {
      var b = m[1];
      var ti = ((b.match(/<title>([\s\S]*?)<\/title>/i)||[])[1]||""); ti = decodeXmlEntities(stripHtml(ti)).trim();
      var li = ((b.match(/<link>([\s\S]*?)<\/link>/i)||[])[1]||"").trim();
      var de = ((b.match(/<description>([\s\S]*?)<\/description>/i)||[])[1]||""); de = decodeXmlEntities(stripHtml(de)).trim();
      if (de.length > 300) de = de.substring(0, 300) + "...";
      if (ti && li) items.push({ title: ti, url: li, text: de, engine: engine.name });
    }
    return items;
  }
  try {
    var items = _fetch(query, limit);
    if (items.length < 3) {
      var translated = translateForBing(query);
      if (translated !== query) {
        var enItems = _fetch(translated, limit);
        var seen = {}; for (var i = 0; i < items.length; i++) seen[items[i].url] = true;
        for (var j = 0; j < enItems.length; j++) { if (!seen[enItems[j].url]) { seen[enItems[j].url] = true; items.push(enItems[j]); } }
      }
    }
    if (items.length < 3) {
      var candidates = simplifyForBing(query);
      var seen = {}; for (var i = 0; i < items.length; i++) seen[items[i].url] = true;
      for (var c = 0; c < candidates.length && items.length < limit * 2; c++) {
        if (candidates[c] === query) continue;
        var extra = _fetch(candidates[c], Math.ceil(limit / 2));
        for (var j = 0; j < extra.length; j++) { if (!seen[extra[j].url]) { seen[extra[j].url] = true; items.push(extra[j]); } }
      }
    }
    return { items: items };
  } catch (e) { return { items: [] }; }
}

// --- MediaWiki ---
function searchMediaWiki(engine, query, limit, allowFallback) {
  function _fetch(q, n, what) {
    var url = engine.api + "?action=query&list=search&srsearch=" + encodeURIComponent(q)
            + "&srlimit=" + Math.min(n || limit, 30)
            + "&srprop=snippet|titlesnippet&format=json&origin=*"
            + "&srwhat=" + (what || "title");
    var res = fetch(url, { headers: { "User-Agent": CONFIG.userAgent } });
    if (!res || !res.ok) return [];
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
    return items;
  }
  try {
    var items = _fetch(query, limit, "title");
    if (items.length < 2) {
      var textItems = _fetch(query, limit, "text");
      var seen = {}; for (var i = 0; i < items.length; i++) seen[items[i].url] = true;
      for (var j = 0; j < textItems.length; j++) { if (!seen[textItems[j].url]) { seen[textItems[j].url] = true; items.push(textItems[j]); } }
    }
    if (items.length < 2 && allowFallback !== false) {
      var terms = extractKeyTerms(query);
      var seen = {}; for (var i = 0; i < items.length; i++) seen[items[i].url] = true;
      for (var t = 0; t < Math.min(terms.length, 2); t++) {
        if (terms[t] === query) continue;
        var extra = _fetch(terms[t], Math.ceil(limit / 2), "title");
        for (var j = 0; j < extra.length; j++) { if (!seen[extra[j].url]) { seen[extra[j].url] = true; items.push(extra[j]); } }
      }
    }
    return { items: items };
  } catch (e) { return { items: [] }; }
}

// --- B站专栏 ---
function searchBilibili(engine, query, limit) {
  try {
    var url = "https://api.bilibili.com/x/web-interface/search/type?search_type=article&keyword="
            + encodeURIComponent(query) + "&page=1&page_size=" + Math.min(limit, 20);
    var res = fetch(url, { headers: { "User-Agent": CONFIG.userAgent, "Referer": "https://www.bilibili.com/", "Accept": "application/json" } });
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
      items.push({ title: decodeHtmlEntities(stripHtml(a.title || "")), url: engine.page + a.id, text: decodeHtmlEntities(stripHtml(desc)), engine: engine.name });
    }
    return { items: items };
  } catch (e) { return { items: [] }; }
}

// --- 掘金 ---
function searchJuejin(engine, query, limit) {
  try {
    var res = fetch("https://api.juejin.cn/search_api/v1/search", {
      method: "POST",
      headers: { "User-Agent": CONFIG.userAgent, "Content-Type": "application/json" },
      body: JSON.stringify({ query: query, limit: Math.min(limit, 20), cursor: "0", sort_type: 0 })
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
      items.push({ title: info.title || "", url: engine.page + info.article_id, text: brief, engine: engine.name });
    }
    return { items: items };
  } catch (e) { return { items: [] }; }
}

// --- 百度百科 ---
function searchBaiduBaike(engine, query, limit) {
  try {
    var url = engine.page + encodeURIComponent(query);
    var res = fetch(url, { headers: { "User-Agent": CONFIG.userAgent, "Accept": "text/html" } });
    if (!res || !res.ok) return { items: [] };
    var html = res.text();
    var para = html.match(/class="lemma-summary"[^>]*>([\s\S]*?)<\/div>/i);
    if (!para) para = html.match(/<p[^>]*>([\s\S]{30,500}?)<\/p>/i);
    var snippet = para ? stripHtml(para[1]).trim() : "";
    if (snippet.length > 300) snippet = snippet.substring(0, 300) + "...";
    if (!snippet) return { items: [] };
    return { items: [{ title: query + " - 百度百科", url: url, text: snippet, engine: engine.name }] };
  } catch (e) { return { items: [] }; }
}

// ========== 调度 ==========
function dispatchEngine(eng) {
  switch (eng.name) {
    case "bing": return searchBing;
    case "bilibili": return searchBilibili;
    case "juejin": return searchJuejin;
    case "baike": return searchBaiduBaike;
    default: return searchMediaWiki;
  }
}

// ========== 路由 ==========
function resolveEngines(rawQuery) {
  var query = rawQuery, routeTag = "";
  var routeMap = {
    "@game":  ["bwiki_ys","bwiki_sr","bwiki_ak","bwiki_zzz","bwiki_bh3","bwiki_blhx","bwiki_endfield","bwiki_wuwa","bwiki_gbf","prts_wiki","moegirl"],
    "@anime": ["bing","moegirl","bilibili"],
    "@learn": ["juejin","bing","bilibili"],
    "@tech":  ["juejin","bing"],
    "@baike": ["baike","bing","moegirl"],
    "@wiki":  ["moegirl","bing"],
    "@web":   ["bing"],
    "@all":   ["bing","moegirl","bilibili","juejin","bwiki_ys","bwiki_sr","bwiki_ak","bwiki_zzz","bwiki_bh3","bwiki_blhx","bwiki_endfield","bwiki_wuwa","bwiki_gbf","prts_wiki","baike"]
  };
  var minEnginesMap = { "@game": 3, "@all": 99, "@web": 2 };

  for (var tag in routeMap) {
    if (query.indexOf(tag) === 0) { routeTag = tag; query = query.substring(tag.length).trim(); break; }
  }

  var order = routeMap[routeTag] || ["bing", "moegirl", "bilibili", "juejin"];
  var engines = [];
  for (var i = 0; i < order.length; i++) {
    for (var j = 0; j < CONFIG.engines.length; j++) {
      if (CONFIG.engines[j].name === order[i]) { engines.push(CONFIG.engines[j]); break; }
    }
  }
  return { engines: engines, query: query, routeTag: routeTag, minEngines: minEnginesMap[routeTag] || 2 };
}

// ========== 主搜索 ==========
function search(query, resultSize) {
  if (!resultSize || resultSize <= 0) resultSize = CONFIG.defaultResultSize;
  if (resultSize > CONFIG.maxResultSize) resultSize = CONFIG.maxResultSize;

  var resolved = resolveEngines(query);
  var engines = resolved.engines;
  query = resolved.query;
  var minEngines = resolved.minEngines || 2;
  var routeTag = resolved.routeTag || "";
  if (!query) return { items: [], query: "", routeTag: null };

  var perEngine = Math.max(resultSize, 10);
  var all = [], seenUrl = {}, seenEngine = {};

  // @game 路由：萌娘先搜 → 定位游戏 → 优先搜对应Wiki
  if (routeTag === "@game") {
    var moegirlEng = null;
    for (var j = 0; j < CONFIG.engines.length; j++) {
      if (CONFIG.engines[j].name === "moegirl") { moegirlEng = CONFIG.engines[j]; break; }
    }
    if (moegirlEng) {
      var moeR = searchMediaWiki(moegirlEng, query, 5, false);
      if (moeR.items) {
        for (var i = 0; i < moeR.items.length; i++) {
          if (!seenUrl[moeR.items[i].url]) { seenUrl[moeR.items[i].url] = true; all.push(moeR.items[i]); }
        }
        var detected = detectGame(moeR.items);
        if (detected) {
          var reordered = [];
          for (var k = 0; k < engines.length; k++) { if (engines[k].name === detected) { reordered.push(engines[k]); break; } }
          for (var k = 0; k < engines.length; k++) { if (engines[k].name !== detected && engines[k].name !== "moegirl") { reordered.push(engines[k]); } }
          engines = reordered;
        }
      }
    }
    seenEngine["moegirl_done"] = true;
  }

  // 遍历引擎
  for (var e = 0; e < engines.length; e++) {
    var eng = engines[e];
    if (seenEngine[eng.name + "_done"]) continue;
    seenEngine[eng.name + "_done"] = true;

    var fn = dispatchEngine(eng);
    var allowFallback = e < 2;
    var r;
    if (eng.api && fn === searchMediaWiki) {
      r = searchMediaWiki(eng, query, perEngine, allowFallback);
    } else {
      r = fn(eng, query, perEngine);
    }

    if (r.items) {
      for (var i = 0; i < r.items.length; i++) {
        if (!seenUrl[r.items[i].url]) { seenUrl[r.items[i].url] = true; all.push(r.items[i]); }
      }
    }
    if (e >= minEngines - 1 && all.length >= resultSize) break;
  }

  // 去重
  var dedup = [], urlSet = {};
  for (var j = 0; j < all.length; j++) {
    if (!urlSet[all[j].url]) { urlSet[all[j].url] = true; dedup.push(all[j]); }
  }

  // 全路由降噪（防Bing拆词噪音）
  if (routeTag !== "@game") {
    dedup = minMatchFilter(dedup, query);
  }

  return { items: dedup.slice(0, resultSize), query: query, routeTag: routeTag || "default", total: dedup.length };
}

// ========== 深度搜索（search + scrape 一键完成） ==========
function deepSearch(query, resultSize) {
  var searchResult = search(query, resultSize);
  if (!searchResult.items || searchResult.items.length === 0) {
    return { search: searchResult, deep: null };
  }

  // 自动抓取前2条 萌娘/Wiki 结果的完整正文
  var urls = [];
  for (var i = 0; i < searchResult.items.length && urls.length < 2; i++) {
    var url = searchResult.items[i].url;
    // 只抓 wiki/百科 类页面（非B站视频/专栏）
    if (url.indexOf("moegirl.org.cn") !== -1 ||
        url.indexOf("wiki.biligame.com") !== -1 ||
        url.indexOf("baike.baidu.com") !== -1 ||
        url.indexOf("prts.wiki") !== -1) {
      urls.push(url);
    }
  }

  if (urls.length === 0) {
    // 至少抓第一个非B站的结果
    for (var i = 0; i < searchResult.items.length; i++) {
      if (searchResult.items[i].url.indexOf("bilibili.com/video") === -1) {
        urls.push(searchResult.items[i].url);
        break;
      }
    }
  }

  if (urls.length === 0) return { search: searchResult, deep: null };

  // 简单抓取（轻量版，不依赖 crawl-final.js）
  var pages = [];
  for (var i = 0; i < urls.length; i++) {
    try {
      var res = fetch(urls[i], { headers: { "User-Agent": CONFIG.userAgent, "Accept": "text/html" } });
      if (!res || !res.ok) { pages.push({ url: urls[i], error: "HTTP " + (res ? res.status : "null") }); continue; }
      var html = res.text();
      var title = "";
      var titleM = html.match(/<title[^>]*>([^<]*)<\/title>/i);
      if (titleM) title = decodeHtmlEntities(titleM[1].trim());

      // 提取正文
      html = html.replace(/<script[\s\S]*?<\/script>/gi, "");
      html = html.replace(/<style[\s\S]*?<\/style>/gi, "");
      html = html.replace(/<nav[\s\S]*?<\/nav>/gi, "");
      html = html.replace(/<footer[\s\S]*?<\/footer>/gi, "");
      html = html.replace(/<header[\s\S]*?<\/header>/gi, "");
      html = html.replace(/<\/(div|p|h[1-6]|li|tr|article|section)[^>]*>/gi, "\n");
      html = html.replace(/<br\s*\/?>/gi, "\n");
      var text = stripHtml(html);
      text = decodeHtmlEntities(text);
      text = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").replace(/^[ \t]+/gm, "").trim();
      if (text.length > 50000) text = text.substring(0, 50000) + "\n\n[... truncated ...]";
      pages.push({ url: urls[i], title: title, content: text });
    } catch (e) {
      pages.push({ url: urls[i], error: e.message || "unknown" });
    }
  }

  return { search: searchResult, deep: { pages: pages } };
}

// ========== 连通性自检 ==========
function test() {
  var tests = [
    ["bing","Python",searchBing], ["moegirl","test",searchMediaWiki],
    ["bilibili","test",searchBilibili], ["juejin","Python",searchJuejin],
    ["bwiki_ys","原神",searchMediaWiki], ["bwiki_sr","星穹",searchMediaWiki],
    ["bwiki_ak","test",searchMediaWiki], ["bwiki_zzz","test",searchMediaWiki],
    ["bwiki_bh3","test",searchMediaWiki], ["bwiki_blhx","test",searchMediaWiki],
    ["bwiki_endfield","终末地",searchMediaWiki], ["bwiki_wuwa","test",searchMediaWiki],
    ["bwiki_gbf","test",searchMediaWiki], ["prts_wiki","test",searchMediaWiki],
    ["baike","中国",searchBaiduBaike]
  ];
  var results = [];
  for (var i = 0; i < tests.length; i++) {
    var t = tests[i], eng = null;
    for (var j = 0; j < CONFIG.engines.length; j++) { if (CONFIG.engines[j].name === t[0]) { eng = CONFIG.engines[j]; break; } }
    if (!eng) continue;
    var start = Date.now();
    var r = t[2](eng, t[1], 2);
    results.push({ engine: t[0], ok: r.items && r.items.length > 0, count: r.items ? r.items.length : 0, ms: Date.now() - start });
  }
  return { diagnostics: results };
}
