// ============================================================
// 搜索 v7.2 — 精简·快速·16引擎
// ============================================================
var console = typeof console !== 'undefined' ? console : { warn: function(){}, log: function(){}, error: function(){} };

var CONFIG = {
  userAgent: "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36",
  defaultResultSize: 10, maxResultSize: 30,
  // 引擎按速度排序：快(API<1KB) → 中(JSON<20KB) → 慢(HTML>50KB)
  engines: [
    // 快速 (MediaWiki API, <1KB, <500ms)
    { name: "moegirl",    cat: "wiki", api: "https://zh.moegirl.org.cn/api.php", page: "https://zh.moegirl.org.cn/" },
    { name: "bwiki_ys",   cat: "game", api: "https://wiki.biligame.com/ys/api.php",        page: "https://wiki.biligame.com/ys/" },
    { name: "bwiki_sr",   cat: "game", api: "https://wiki.biligame.com/sr/api.php",        page: "https://wiki.biligame.com/sr/" },
    { name: "bwiki_ak",   cat: "game", api: "https://wiki.biligame.com/arknights/api.php", page: "https://wiki.biligame.com/arknights/" },
    { name: "bwiki_zzz",  cat: "game", api: "https://wiki.biligame.com/zzz/api.php",       page: "https://wiki.biligame.com/zzz/" },
    { name: "bwiki_bh3",  cat: "game", api: "https://wiki.biligame.com/bh3/api.php",       page: "https://wiki.biligame.com/bh3/" },
    { name: "bwiki_blhx", cat: "game", api: "https://wiki.biligame.com/blhx/api.php",      page: "https://wiki.biligame.com/blhx/" },
    { name: "bwiki_zmd",  cat: "game", api: "https://wiki.biligame.com/zmd/api.php",       page: "https://wiki.biligame.com/zmd/" },
    { name: "bwiki_ww",   cat: "game", api: "https://wiki.biligame.com/ww/api.php",        page: "https://wiki.biligame.com/ww/" },
    { name: "bwiki_gbf",  cat: "game", api: "https://wiki.biligame.com/gbf/api.php",       page: "https://wiki.biligame.com/gbf/" },
    { name: "prts_wiki",  cat: "game", api: "https://prts.wiki/api.php",                   page: "https://prts.wiki/" },
    // 中速 (JSON/XML API, <20KB, ~500ms-2s)
    { name: "bing",       cat: "web",     page: "https://cn.bing.com/search?format=rss&count=10&q=" },
    { name: "bilibili",   cat: "article", page: "https://www.bilibili.com/read/cv" },
    { name: "juejin",     cat: "tech",    page: "https://juejin.cn/post/" },
    // 慢速 (HTML抓取, >50KB) — 仅显式路由
    { name: "baike",      cat: "heavy",   page: "https://baike.baidu.com/item/" }
  ]
};

// ========== 工具 ==========
function stripHtml(s) { return s.replace(/<[^>]*>/g, ""); }
function decodeHtmlEntities(s) {
  var e = { "&amp;":"&","&lt;":"<","&gt;":">","&quot;":'"',"&#39;":"'","&nbsp;":" ","&mdash;":"—","&ndash;":"–" };
  for (var k in e) s = s.split(k).join(e[k]);
  s = s.replace(/&#(\d+);?/g, function(_,c){ return String.fromCharCode(parseInt(c,10)); });
  s = s.replace(/&#x([0-9a-fA-F]+);?/g, function(_,c){ return String.fromCharCode(parseInt(c,16)); });
  return s;
}
function decodeXmlEntities(s) { return s.replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&apos;/g,"'"); }

// 降噪 + 过滤
var NOISE = ["攻略","推荐","搭配","怎么","如何","什么","最强","哪个","厉害","值得","可以","应该","需要","怎么样","好不好","最新","教程","入门","详解"];
function simplify(q) {
  var parts = q.split(/[\s,，、。！？]+/), clean = [];
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i].trim(), n = false;
    if (!p) continue;
    for (var j = 0; j < NOISE.length; j++) if (p === NOISE[j]) { n = true; break; }
    if (!n) clean.push(p);
  }
  if (clean.length === 0) return [q];
  var c = []; if (clean.length >= 2) c.push(clean[0]+clean[1]);
  var l = clean[0]; for (var i = 1; i < clean.length; i++) if (clean[i].length > l.length) l = clean[i];
  if (l !== (c[0]||"")) c.push(l); c.push(clean.join("")); return c;
}
function bigrams(q) { var c = q.replace(/[a-zA-Z0-9\s]/g,""), r = []; for (var i = 0; i < c.length-1; i++) r.push(c.substring(i,i+2)); return r; }
function minMatch(items, q) {
  var bg = bigrams(q); if (!bg.length) return items;
  return items.filter(function(x) { var h = ((x.title||"")+" "+(x.text||"")).toLowerCase(); for (var i = 0; i < bg.length; i++) if (h.indexOf(bg[i])!==-1) return true; return false; });
}

// ========== 引擎 ==========
function searchBing(eng, q, limit) {
  function _f(qq, n) {
    var u = eng.page + encodeURIComponent(qq);
    var res = fetch(u, { headers: { "User-Agent": CONFIG.userAgent } });
    if (!res || !res.ok) return [];
    var xml = res.text(), re = /<item>([\s\S]*?)<\/item>/gi, out = [], m;
    while ((m = re.exec(xml)) !== null && out.length < (n||limit)) {
      var b = m[1];
      var t = ((b.match(/<title>([\s\S]*?)<\/title>/i)||[])[1]||""); t = decodeXmlEntities(stripHtml(t)).trim();
      var l = ((b.match(/<link>([\s\S]*?)<\/link>/i)||[])[1]||"").trim();
      var d = ((b.match(/<description>([\s\S]*?)<\/description>/i)||[])[1]||""); d = decodeXmlEntities(stripHtml(d)).trim();
      if (d.length > 300) d = d.substring(0,300)+"...";
      if (t && l) out.push({ title: t, url: l, text: d, engine: eng.name });
    }
    return out;
  }
  try {
    var items = _f(q, limit);
    if (items.length < 3) {
      var cs = simplify(q), seen = {};
      for (var i = 0; i < items.length; i++) seen[items[i].url] = true;
      for (var c = 0; c < cs.length && items.length < limit*2; c++) {
        if (cs[c] === q) continue;
        var ex = _f(cs[c], Math.ceil(limit/2));
        for (var j = 0; j < ex.length; j++) if (!seen[ex[j].url]) { seen[ex[j].url] = true; items.push(ex[j]); }
      }
    }
    return { items: items };
  } catch(e) { return { items: [] }; }
}

function searchMediaWiki(eng, q, limit, fallback) {
  function _f(qq, n, what) {
    var u = eng.api + "?action=query&list=search&srsearch=" + encodeURIComponent(qq)
          + "&srlimit=" + Math.min(n||limit,30) + "&srprop=snippet|titlesnippet&format=json&origin=*&srwhat="+(what||"title");
    var res = fetch(u, { headers: { "User-Agent": CONFIG.userAgent } });
    if (!res || !res.ok) return [];
    var data = res.json(), sr = (data.query&&data.query.search)||[], out = [];
    for (var i = 0; i < sr.length; i++)
      out.push({ title: decodeHtmlEntities(sr[i].title), url: eng.page+encodeURIComponent(sr[i].title.replace(/ /g,"_")), text: decodeHtmlEntities(stripHtml(sr[i].snippet||"")), engine: eng.name });
    return out;
  }
  try {
    var items = _f(q, limit, "title");
    if (items.length < 2) {
      var txt = _f(q, limit, "text"), seen = {};
      for (var i = 0; i < items.length; i++) seen[items[i].url] = true;
      for (var j = 0; j < txt.length; j++) if (!seen[txt[j].url]) { seen[txt[j].url] = true; items.push(txt[j]); }
    }
    if (items.length < 2 && fallback !== false) {
      var parts = q.split(/[\s,，、。！？]+/).filter(function(x){return x.length>=2}).sort(function(a,b){return b.length-a.length}).slice(0,3);
      var seen = {}; for (var i = 0; i < items.length; i++) seen[items[i].url] = true;
      for (var t = 0; t < parts.length; t++) {
        if (parts[t] === q) continue;
        var ex = _f(parts[t], Math.ceil(limit/2), "title");
        for (var j = 0; j < ex.length; j++) if (!seen[ex[j].url]) { seen[ex[j].url] = true; items.push(ex[j]); }
      }
    }
    return { items: items };
  } catch(e) { return { items: [] }; }
}

function searchBilibili(eng, q, limit) {
  try {
    var u = "https://api.bilibili.com/x/web-interface/search/type?search_type=article&keyword="+encodeURIComponent(q)+"&page=1&page_size="+Math.min(limit,20);
    var res = fetch(u, { headers: { "User-Agent": CONFIG.userAgent, "Referer": "https://www.bilibili.com/", "Accept": "application/json" } });
    if (!res || !res.ok) return { items: [] };
    var data = res.json(); if (data.code !== 0) return { items: [] };
    var articles = (data.data&&data.data.result)||[], items = [];
    for (var i = 0; i < articles.length && i < limit; i++) {
      var a = articles[i]; if (!a.id) continue;
      var d = a.summary||a.description||""; if (d.length > 300) d = d.substring(0,300)+"...";
      items.push({ title: decodeHtmlEntities(stripHtml(a.title||"")), url: eng.page+a.id, text: decodeHtmlEntities(stripHtml(d)), engine: eng.name });
    }
    return { items: items };
  } catch(e) { return { items: [] }; }
}

function searchJuejin(eng, q, limit) {
  try {
    var res = fetch("https://api.juejin.cn/search_api/v1/search", {
      method: "POST", headers: { "User-Agent": CONFIG.userAgent, "Content-Type": "application/json" },
      body: JSON.stringify({ query: q, limit: Math.min(limit,20), cursor: "0", sort_type: 0 })
    });
    if (!res || !res.ok) return { items: [] };
    var data = res.json(); if (data.err_no !== 0) return { items: [] };
    var results = data.data||[], items = [];
    for (var i = 0; i < results.length && i < limit; i++) {
      var r = results[i]; if (r.result_type !== 2) continue;
      var info = r.result_model&&r.result_model.article_info; if (!info||!info.article_id) continue;
      var b = info.brief_content||""; if (b.length > 300) b = b.substring(0,300)+"...";
      items.push({ title: info.title||"", url: eng.page+info.article_id, text: b, engine: eng.name });
    }
    return { items: items };
  } catch(e) { return { items: [] }; }
}

function searchBaiduBaike(eng, q, limit) {
  try {
    var u = eng.page + encodeURIComponent(q);
    var res = fetch(u, { headers: { "User-Agent": CONFIG.userAgent } });
    if (!res || !res.ok) return { items: [] };
    var html = res.text();
    var para = html.match(/class="lemma-summary"[^>]*>([\s\S]*?)<\/div>/i) || html.match(/<p[^>]*>([\s\S]{30,500}?)<\/p>/i);
    var s = para ? stripHtml(para[1]).trim() : "";
    if (s.length > 300) s = s.substring(0,300)+"...";
    if (!s) return { items: [] };
    return { items: [{ title: q+" - 百度百科", url: u, text: s, engine: eng.name }] };
  } catch(e) { return { items: [] }; }
}

function dispatch(eng) {
  switch (eng.name) {
    case "bing": return searchBing; case "bilibili": return searchBilibili;
    case "juejin": return searchJuejin; case "baike": return searchBaiduBaike;
    default: return searchMediaWiki;
  }
}

// ========== 路由 ==========
var ROUTES = {
  "@game":  { o: ["bwiki_ys","bwiki_sr","bwiki_ak","bwiki_zzz","bwiki_bh3","bwiki_blhx","bwiki_zmd","bwiki_ww","bwiki_gbf","prts_wiki","moegirl","bing"], min: 3 },
  "@anime": { o: ["moegirl","bilibili","bing"], min: 2 },
  "@learn": { o: ["juejin","bing","bilibili"], min: 2 },
  "@tech":  { o: ["juejin","bing"], min: 2 },
  "@baike": { o: ["baike","moegirl","bing"], min: 2 },
  "@wiki":  { o: ["moegirl","bing"], min: 2 },
  "@web":   { o: ["bing"], min: 1 },
  "@all":   { o: ["moegirl","bing","bilibili","juejin","bwiki_ys","bwiki_sr","bwiki_ak","bwiki_zzz","bwiki_bh3","bwiki_blhx","bwiki_zmd","bwiki_ww","bwiki_gbf","prts_wiki","baike"], min: 99 }
};
var DEF = { o: ["bing","moegirl","bilibili","juejin"], min: 2 };

function resolve(q) {
  var tag = "";
  for (var k in ROUTES) { if (q.indexOf(k) === 0) { tag = k; q = q.substring(k.length).trim(); break; } }
  var r = ROUTES[tag] || DEF;
  var engs = [];
  for (var i = 0; i < r.o.length; i++)
    for (var j = 0; j < CONFIG.engines.length; j++)
      if (CONFIG.engines[j].name === r.o[i]) { engs.push(CONFIG.engines[j]); break; }
  return { engines: engs, query: q, routeTag: tag, minEngines: r.min };
}

// ========== 主搜索 ==========
function search(query, resultSize) {
  if (!resultSize || resultSize <= 0) resultSize = CONFIG.defaultResultSize;
  if (resultSize > CONFIG.maxResultSize) resultSize = CONFIG.maxResultSize;

  var r = resolve(query);
  var engines = r.engines, q = r.query, minE = r.minEngines, tag = r.routeTag;
  if (!q) return { items: [], query: "", routeTag: null };

  var all = [], seenUrl = {}, seenEng = {};
  var perE = Math.max(resultSize, 10);

  for (var e = 0; e < engines.length; e++) {
    var eng = engines[e];
    if (seenEng[eng.name]) continue; seenEng[eng.name] = true;

    var fn = dispatch(eng);
    var r2 = (eng.api && fn === searchMediaWiki)
      ? searchMediaWiki(eng, q, perE, e < 2)
      : fn(eng, q, perE);

    if (r2.items) for (var i = 0; i < r2.items.length; i++)
      if (!seenUrl[r2.items[i].url]) { seenUrl[r2.items[i].url] = true; all.push(r2.items[i]); }

    if (e >= minE - 1 && all.length >= resultSize) break;
  }

  var dedup = [], us = {};
  for (var j = 0; j < all.length; j++)
    if (!us[all[j].url]) { us[all[j].url] = true; dedup.push(all[j]); }

  if (tag !== "@game") dedup = minMatch(dedup, q);

  return { items: dedup.slice(0, resultSize), query: q, routeTag: tag||"default", total: dedup.length };
}
