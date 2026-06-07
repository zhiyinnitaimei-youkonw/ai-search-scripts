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
    { name: "bwiki_endfield", cat: "game",
      api: "https://wiki.biligame.com/zmd/api.php",
      page: "https://wiki.biligame.com/zmd/" },
    { name: "bwiki_wuwa", cat: "game",
      api: "https://wiki.biligame.com/ww/api.php",
      page: "https://wiki.biligame.com/ww/" },
    { name: "prts_wiki", cat: "game",
      api: "https://prts.wiki/api.php",
      page: "https://prts.wiki/" },

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

// ========== 专有名词中→英映射（Bing英文搜索更准） ==========
var CN_EN_MAP = {
  // 游戏名
  "原神": "Genshin Impact", "崩坏3": "Honkai Impact 3rd",
  "崩坏：星穹铁道": "Honkai Star Rail", "星穹铁道": "Honkai Star Rail",
  "明日方舟": "Arknights", "绝区零": "Zenless Zone Zero",
  "碧蓝航线": "Azur Lane", "王者荣耀": "Honor of Kings",
  // 原神角色
  "钟离": "Zhongli", "胡桃": "Hu Tao", "雷电将军": "Raiden Shogun",
  "纳西妲": "Nahida", "芙宁娜": "Furina", "万叶": "Kazuha",
  "夜兰": "Yelan", "神里绫华": "Kamisato Ayaka", "甘雨": "Ganyu",
  "魈": "Xiao", "可莉": "Klee", "温迪": "Venti",
  // 星穹角色
  "丹恒": "Dan Heng", "景元": "Jing Yuan", "银狼": "Silver Wolf",
  "刃": "Blade", "卡芙卡": "Kafka", "符玄": "Fu Xuan",
  // 方舟角色
  "史尔特尔": "Surtr", "玛恩纳": "Mlynar",
  // 绝区零
  "艾莲": "Ellen Joe", "鲨鱼妹": "Ellen Joe", "星见雅": "Miyabi",
  "终末地": "Arknights Endfield", "莱万汀": "Laevatein",
  // 崩3
  "爱莉希雅": "Elysia",
  // 通用
  "圣遗物": "artifact", "圣痕": "stigmata", "模组": "module",
  "攻略": "guide", "搭配": "build", "配队": "team comp",
  "技能": "skill", "命座": "constellation", "武器": "weapon"
};

function translateForBing(query) {
  var parts = query.split(/[\s,，、。！？]+/);
  var out = [];
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i].trim();
    if (!p) continue;
    // 已知专有名词 → 英文
    if (CN_EN_MAP[p]) {
      out.push(CN_EN_MAP[p]);
    } else if (/[a-zA-Z]/.test(p)) {
      out.push(p);  // 已是英文，保留
    } else {
      out.push(p);  // 未知中文，保留原词（让Bing自己处理）
    }
  }
  return out.join(" ");
}

// ========== 游戏分类器（萌娘定位 → 路由到对应Wiki） ==========
var GAME_SIGNATURES = [
  { keys: ["原神","Genshin","提瓦特"], wiki: "bwiki_ys" },
  { keys: ["星穹铁道","星穹","Star Rail","崩坏：星穹"], wiki: "bwiki_sr" },
  { keys: ["明日方舟","Arknights","罗德岛","源石","终末地"], wiki: "bwiki_ak" },
  { keys: ["绝区零","Zenless","ZZZ","新艾利都"], wiki: "bwiki_zzz" },
  { keys: ["崩坏3","崩坏3rd","Honkai Impact","休伯利安"], wiki: "bwiki_bh3" },
  { keys: ["碧蓝航线","Azur Lane"], wiki: "bwiki_blhx" },
  { keys: ["鸣潮","Wuthering Waves"], wiki: "bwiki_wuwa" },
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

// ========== 分词回退（整段匹配失败时拆词重搜） ==========
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

// ========== Bing RSS 搜索（通用网页 · 仅5KB · 带分词回退） ==========
function searchBing(engine, query, limit) {
  function _bingFetch(q, n) {
    var url = engine.page + encodeURIComponent(q);
    var res = fetch(url, {
      headers: { "User-Agent": CONFIG.userAgent, "Accept": "application/rss+xml" }
    });
    if (!res || !res.ok) return [];
    var xml = res.text();
    var itemRe = /<item>([\s\S]*?)<\/item>/gi;
    var items = [];
    var match;
    while ((match = itemRe.exec(xml)) !== null && items.length < (n || limit)) {
      var block = match[1];
      var title = (block.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || "";
      var link  = (block.match(/<link>([\s\S]*?)<\/link>/i) || [])[1] || "";
      var desc  = (block.match(/<description>([\s\S]*?)<\/description>/i) || [])[1] || "";
      title = decodeXmlEntities(stripHtml(title)).trim();
      desc  = decodeXmlEntities(stripHtml(desc)).trim();
      link  = link.trim();
      if (desc.length > 300) desc = desc.substring(0, 300) + "...";
      if (title && link) items.push({ title: title, url: link, text: desc, engine: engine.name });
    }
    return items;
  }

  try {
    // 优先用原文搜
    var items = _bingFetch(query, limit);
    // 结果不足 → 策略1: 专有名词翻英文重搜
    if (items.length < 3) {
      var translated = translateForBing(query);
      if (translated !== query) {
        var enItems = _bingFetch(translated, limit);
        var seen = {};
        for (var i = 0; i < items.length; i++) seen[items[i].url] = true;
        for (var j = 0; j < enItems.length; j++) {
          if (!seen[enItems[j].url]) { seen[enItems[j].url] = true; items.push(enItems[j]); }
        }
      }
    }
    // 结果仍不足 → 策略2: 降噪缩短重搜
    if (items.length < 3) {
      var candidates = simplifyForBing(query);
      var seen = {};
      for (var i = 0; i < items.length; i++) seen[items[i].url] = true;
      for (var c = 0; c < candidates.length && items.length < limit * 2; c++) {
        if (candidates[c] === query) continue;
        var extra = _bingFetch(candidates[c], Math.ceil(limit / 2));
        for (var j = 0; j < extra.length; j++) {
          if (!seen[extra[j].url]) { seen[extra[j].url] = true; items.push(extra[j]); }
        }
      }
    }
    return { items: items };
  } catch (e) {
    return { items: [] };
  }
}

// ========== MediaWiki 搜索（标题→全文→分词 三级回退） ==========
function searchMediaWiki(engine, query, limit, allowFallback) {
  function _mwFetch(q, n, what) {
    var url = engine.api + "?action=query&list=search&srsearch="
            + encodeURIComponent(q)
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
    // Level 1: 标题搜索
    var items = _mwFetch(query, limit, "title");
    // Level 2: 标题不够 → 全文搜索
    if (items.length < 2) {
      var textItems = _mwFetch(query, limit, "text");
      var seen = {};
      for (var i = 0; i < items.length; i++) seen[items[i].url] = true;
      for (var j = 0; j < textItems.length; j++) {
        if (!seen[textItems[j].url]) { seen[textItems[j].url] = true; items.push(textItems[j]); }
      }
    }
    // Level 3: 仍不够 且 允许回退 → 拆词重搜
    if (items.length < 2 && allowFallback !== false) {
      var terms = extractKeyTerms(query);
      var seen = {};
      for (var i = 0; i < items.length; i++) seen[items[i].url] = true;
      for (var t = 0; t < Math.min(terms.length, 2); t++) {
        if (terms[t] === query) continue;
        var extra = _mwFetch(terms[t], Math.ceil(limit / 2), "title");
        for (var j = 0; j < extra.length; j++) {
          if (!seen[extra[j].url]) { seen[extra[j].url] = true; items.push(extra[j]); }
        }
      }
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
    "@game":   ["bwiki_ys","bwiki_sr","bwiki_ak","bwiki_zzz","bwiki_bh3","bwiki_blhx","bwiki_endfield","bwiki_wuwa","prts_wiki","moegirl"],
    "@anime":  ["bing","moegirl","bilibili"],
    "@learn":  ["juejin","bing","bilibili"],
    "@tech":   ["juejin","bing"],
    "@baike":  ["baike","bing","moegirl"],
    "@wiki":   ["moegirl","bing"],
    "@web":    ["bing","sogou"],
    "@all":    ["bing","moegirl","bilibili","juejin","bwiki_ys","bwiki_sr","bwiki_ak","bwiki_zzz","bwiki_bh3","bwiki_blhx","bwiki_endfield","bwiki_wuwa","baike","sogou"]
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

// ========== Bing 专用：查询降噪（去掉游戏名/语气词，Bing怕长查询） ==========
var BING_NOISE_WORDS = [
  "攻略", "推荐", "搭配", "怎么", "如何", "什么", "最强", "哪个",
  "厉害", "值得", "可以", "应该", "需要", "怎么样", "好不好",
  "2026", "2025", "2024", "最新", "教程", "入门", "详解"
];

function simplifyForBing(query) {
  var parts = query.split(/[\s,，、。！？]+/);
  var clean = [];
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i].trim();
    if (p.length < 1) continue;
    var isNoise = false;
    for (var j = 0; j < BING_NOISE_WORDS.length; j++) {
      if (p === BING_NOISE_WORDS[j]) { isNoise = true; break; }
    }
    if (!isNoise) clean.push(p);
  }
  if (clean.length === 0) return [query];

  // 智能拼接：Latin 与 CJK 之间保留空格，同脚本连写
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
  var all = [];
  var seen = {};

  // @game 路由：萌娘先搜 → 定位游戏 → 优先搜对应Wiki
  if (routeTag === "@game") {
    // 找萌娘引擎
    var moegirlEng = null;
    for (var j = 0; j < CONFIG.engines.length; j++) {
      if (CONFIG.engines[j].name === "moegirl") { moegirlEng = CONFIG.engines[j]; break; }
    }
    if (moegirlEng) {
      var moeR = searchMediaWiki(moegirlEng, query, 5, false);
      if (moeR.items) {
        for (var i = 0; i < moeR.items.length; i++) {
          if (!seen[moeR.items[i].url]) { seen[moeR.items[i].url] = true; all.push(moeR.items[i]); }
        }
        // 检测游戏 → 把对应Wiki提到最前面
        var detected = detectGame(moeR.items);
        if (detected) {
          // 将检测到的Wiki移到引擎列表首位
          var newEngines = [];
          for (var k = 0; k < engines.length; k++) {
            if (engines[k].name === detected) { newEngines.push(engines[k]); break; }
          }
          for (var k = 0; k < engines.length; k++) {
            if (engines[k].name !== detected && engines[k].name !== "moegirl") {
              newEngines.push(engines[k]);
            }
          }
          engines = newEngines;
        }
      }
    }
  }

  // 主搜索引擎遍历
  for (var e = 0; e < engines.length; e++) {
    var eng = engines[e];
    // 已经搜过的跳过
    if (seen[eng.name + "_done"]) continue;
    seen[eng.name + "_done"] = true;

    var fn = dispatchEngine(eng);
    // 只在前2个引擎允许分词回退（控制API调用量）
    var allowFallback = e < 2;

    var r;
    if (eng.api && fn === searchMediaWiki) {
      r = searchMediaWiki(eng, query, perEngine, allowFallback);
    } else {
      r = fn(eng, query, perEngine);
    }

    if (r.items) {
      for (var i = 0; i < r.items.length; i++) {
        if (!seen[r.items[i].url]) { seen[r.items[i].url] = true; all.push(r.items[i]); }
      }
    }
    // 搜满 minEngines 后才允许提前退出
    if (e >= minEngines - 1 && all.length >= resultSize) break;
  }

  // 去重
  var dedup = [];
  var seenUrl = {};
  for (var j = 0; j < all.length; j++) {
    if (!seenUrl[all[j].url]) { seenUrl[all[j].url] = true; dedup.push(all[j]); }
  }

  // 最小匹配过滤（防Bing拆词噪音，@all + 默认 + Bing路由都生效）
  if (routeTag === "@all" || routeTag === "default" || routeTag === "@web" || routeTag === "@anime" || routeTag === "@learn") {
    dedup = minMatchFilter(dedup, query);
  }

  return {
    items: dedup.slice(0, resultSize),
    query: query,
    routeTag: routeTag || "default",
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
