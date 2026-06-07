// ============================================================
// 搜索脚本 v7.1 — 16引擎 · 精简版
// ============================================================
var console = typeof console !== 'undefined' ? console : { warn: function(){}, log: function(){}, error: function(){} };

var CONFIG = {
  userAgent: "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36",
  defaultResultSize: 10, maxResultSize: 30,
  engines: [
    { name: "bing",       cat: "web",  page: "https://cn.bing.com/search?format=rss&count=10&q=" },
    { name: "moegirl",    cat: "wiki", api: "https://zh.moegirl.org.cn/api.php", page: "https://zh.moegirl.org.cn/" },
    { name: "bilibili",   cat: "article", page: "https://www.bilibili.com/read/cv" },
    { name: "juejin",     cat: "tech", page: "https://juejin.cn/post/" },
    // B站游戏Wiki
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
    { name: "baike",      cat: "heavy",page: "https://baike.baidu.com/item/" }
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

// 中文bigram提取
function bigrams(q) {
  var c = q.replace(/[a-zA-Z0-9\s]/g, ""), r = [];
  for (var i = 0; i < c.length - 1; i++) r.push(c.substring(i, i + 2));
  return r;
}

// 最小匹配过滤（防拆词噪音）
function minMatchFilter(items, q) {
  var bg = bigrams(q);
  if (bg.length === 0) return items;
  return items.filter(function(x) {
    var h = ((x.title||"") + " " + (x.text||"")).toLowerCase();
    for (var i = 0; i < bg.length; i++) { if (h.indexOf(bg[i]) !== -1) return true; }
    return false;
  });
}

// 查询降噪（去语气词，留核心2词）
var NOISE = ["攻略","推荐","搭配","怎么","如何","什么","最强","哪个","厉害","值得","可以","应该","需要","怎么样","好不好","最新","教程","入门","详解"];
function simplify(q) {
  var parts = q.split(/[\s,，、。！？]+/), clean = [];
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i].trim(), isN = false;
    if (!p) continue;
    for (var j = 0; j < NOISE.length; j++) { if (p === NOISE[j]) { isN = true; break; } }
    if (!isN) clean.push(p);
  }
  if (clean.length === 0) return [q];
  var candidates = [];
  if (clean.length >= 2) candidates.push(clean.slice(0,2).join(""));
  var longest = clean[0];
  for (var i = 1; i < clean.length; i++) { if (clean[i].length > longest.length) longest = clean[i]; }
  if (longest !== (candidates[0]||"")) candidates.push(longest);
  candidates.push(clean.join(""));
  return candidates;
}

// ========== 搜索函数 ==========

function searchBing(eng, q, limit) {
  function _f(qq, n) {
    var url = eng.page + encodeURIComponent(qq);
    var res = fetch(url, { headers: { "User-Agent": CONFIG.userAgent } });
    if (!res || !res.ok) return [];
    var xml = res.text(), re = /<item>([\s\S]*?)<\/item>/gi, out = [], m;
    while ((m = re.exec(xml)) !== null && out.length < (n||limit)) {
      var b = m[1];
      var t = ((b.match(/<title>([\s\S]*?)<\/title>/i)||[])[1]||""); t = decodeXmlEntities(stripHtml(t)).trim();
      var l = ((b.match(/<link>([\s\S]*?)<\/link>/i)||[])[1]||"").trim();
      var d = ((b.match(/<description>([\s\S]*?)<\/description>/i)||[])[1]||""); d = decodeXmlEntities(stripHtml(d)).trim();
      if (d.length > 300) d = d.substring(0, 300) + "...";
      if (t && l) out.push({ title: t, url: l, text: d, engine: eng.name });
    }
    return out;
  }
  try {
    var items = _f(q, limit);
    if (items.length < 3) {
      var cands = simplify(q), seen = {};
      for (var i = 0; i < items.length; i++) seen[items[i].url] = true;
      for (var c = 0; c < cands.length && items.length < limit * 2; c++) {
        if (cands[c] === q) continue;
        var ex = _f(cands[c], Math.ceil(limit/2));
        for (var j = 0; j < ex.length; j++) { if (!seen[ex[j].url]) { seen[ex[j].url] = true; items.push(ex[j]); } }
      }
    }
    return { items: items };
  } catch(e) { return { items: [] }; }
}

function searchMediaWiki(eng, q, limit, fallback) {
  function _f(qq, n, what) {
    var url = eng.api + "?action=query&list=search&srsearch=" + encodeURIComponent(qq)
            + "&srlimit=" + Math.min(n||limit,30) + "&srprop=snippet|titlesnippet&format=json&origin=*&srwhat="+(what||"title");
    var res = fetch(url, { headers: { "User-Agent": CONFIG.userAgent } });
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
      for (var j = 0; j < txt.length; j++) { if (!seen[txt[j].url]) { seen[txt[j].url] = true; items.push(txt[j]); } }
    }
    if (items.length < 2 && fallback !== false) {
      var parts = q.split(/[\s,，、。！？]+/).filter(function(x){return x.length>=2}).sort(function(a,b){return b.length-a.length}).slice(0,3);
      var seen = {};
      for (var i = 0; i < items.length; i++) seen[items[i].url] = true;
      for (var t = 0; t < parts.length; t++) {
        if (parts[t] === q) continue;
        var ex = _f(parts[t], Math.ceil(limit/2), "title");
        for (var j = 0; j < ex.length; j++) { if (!seen[ex[j].url]) { seen[ex[j].url] = true; items.push(ex[j]); } }
      }
    }
    return { items: items };
  } catch(e) { return { items: [] }; }
}

function searchBilibili(eng, q, limit) {
  try {
    var url = "https://api.bilibili.com/x/web-interface/search/type?search_type=article&keyword="+encodeURIComponent(q)+"&page=1&page_size="+Math.min(limit,20);
    var res = fetch(url, { headers: { "User-Agent": CONFIG.userAgent, "Referer": "https://www.bilibili.com/", "Accept": "application/json" } });
    if (!res || !res.ok) return { items: [] };
    var data = res.json();
    if (data.code !== 0) return { items: [] };
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
    var data = res.json();
    if (data.err_no !== 0) return { items: [] };
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
    var url = eng.page + encodeURIComponent(q);
    var res = fetch(url, { headers: { "User-Agent": CONFIG.userAgent } });
    if (!res || !res.ok) return { items: [] };
    var html = res.text();
    var para = html.match(/class="lemma-summary"[^>]*>([\s\S]*?)<\/div>/i);
    if (!para) para = html.match(/<p[^>]*>([\s\S]{30,500}?)<\/p>/i);
    var s = para ? stripHtml(para[1]).trim() : "";
    if (s.length > 300) s = s.substring(0,300)+"...";
    if (!s) return { items: [] };
    return { items: [{ title: q+" - 百度百科", url: url, text: s, engine: eng.name }] };
  } catch(e) { return { items: [] }; }
}

// ========== 调度 & 路由 ==========
function dispatch(eng) {
  switch (eng.name) {
    case "bing": return searchBing;
    case "bilibili": return searchBilibili;
    case "juejin": return searchJuejin;
    case "baike": return searchBaiduBaike;
    default: return searchMediaWiki;
  }
}

var ROUTES = {
  "@game":  { order: ["bwiki_ys","bwiki_sr","bwiki_ak","bwiki_zzz","bwiki_bh3","bwiki_blhx","bwiki_zmd","bwiki_ww","bwiki_gbf","prts_wiki","moegirl"], min: 3 },
  "@anime": { order: ["bing","moegirl","bilibili"], min: 2 },
  "@learn": { order: ["juejin","bing","bilibili"], min: 2 },
  "@tech":  { order: ["juejin","bing"], min: 2 },
  "@baike": { order: ["baike","bing","moegirl"], min: 2 },
  "@wiki":  { order: ["moegirl","bing"], min: 2 },
  "@web":   { order: ["bing"], min: 1 },
  "@all":   { order: ["bing","moegirl","bilibili","juejin","bwiki_ys","bwiki_sr","bwiki_ak","bwiki_zzz","bwiki_bh3","bwiki_blhx","bwiki_zmd","bwiki_ww","bwiki_gbf","prts_wiki","baike"], min: 99 }
};
var DEFAULT_ROUTE = { order: ["bing","moegirl","bilibili","juejin"], min: 2 };

function resolveEngines(rawQ) {
  var q = rawQ, tag = "";
  for (var k in ROUTES) {
    if (q.indexOf(k) === 0) { tag = k; q = q.substring(k.length).trim(); break; }
  }
  var route = ROUTES[tag] || DEFAULT_ROUTE;
  var engines = [];
  for (var i = 0; i < route.order.length; i++)
    for (var j = 0; j < CONFIG.engines.length; j++)
      if (CONFIG.engines[j].name === route.order[i]) { engines.push(CONFIG.engines[j]); break; }
  return { engines: engines, query: q, routeTag: tag, minEngines: route.min };
}

// ========== 主搜索 ==========
function search(query, resultSize) {
  if (!resultSize || resultSize <= 0) resultSize = CONFIG.defaultResultSize;
  if (resultSize > CONFIG.maxResultSize) resultSize = CONFIG.maxResultSize;

  var res = resolveEngines(query);
  var engines = res.engines, q = res.query, minE = res.minEngines, tag = res.routeTag;
  if (!q) return { items: [], query: "", routeTag: null };

  var all = [], seenU = {}, seenE = {}, perE = Math.max(resultSize, 10);

  for (var e = 0; e < engines.length; e++) {
    var eng = engines[e];
    if (seenE[eng.name]) continue; seenE[eng.name] = true;

    var fn = dispatch(eng);
    var fallback = e < 2;
    var r = (eng.api && fn === searchMediaWiki) ? searchMediaWiki(eng, q, perE, fallback) : fn(eng, q, perE);

    if (r.items) for (var i = 0; i < r.items.length; i++)
      if (!seenU[r.items[i].url]) { seenU[r.items[i].url] = true; all.push(r.items[i]); }

    if (e >= minE - 1 && all.length >= resultSize) break;
  }

  var dedup = [], us = {};
  for (var j = 0; j < all.length; j++)
    if (!us[all[j].url]) { us[all[j].url] = true; dedup.push(all[j]); }

  if (tag !== "@game") dedup = minMatchFilter(dedup, q);

  return { items: dedup.slice(0, resultSize), query: q, routeTag: tag || "default", total: dedup.length };
}

// ========== 深度搜索 ==========
function deepSearch(query, resultSize) {
  var sr = search(query, resultSize);
  if (!sr.items || !sr.items.length) return { search: sr, deep: null };

  var urls = [];
  for (var i = 0; i < sr.items.length && urls.length < 2; i++) {
    var u = sr.items[i].url;
    if (/moegirl|wiki\.biligame|baike\.baidu|prts\.wiki/.test(u)) urls.push(u);
  }

  var pages = [];
  for (var i = 0; i < urls.length; i++) {
    try {
      var res = fetch(urls[i], { headers: { "User-Agent": CONFIG.userAgent } });
      if (!res || !res.ok) { pages.push({ url: urls[i], error: "HTTP "+(res?res.status:"null") }); continue; }
      var html = res.text();
      var title = ""; var tm = html.match(/<title[^>]*>([^<]*)<\/title>/i); if (tm) title = decodeHtmlEntities(tm[1].trim());
      html = html.replace(/<script[\s\S]*?<\/script>/gi,"").replace(/<style[\s\S]*?<\/style>/gi,"").replace(/<nav[\s\S]*?<\/nav>/gi,"").replace(/<footer[\s\S]*?<\/footer>/gi,"");
      html = html.replace(/<\/(div|p|h[1-6]|li|tr|article|section)[^>]*>/gi,"\n").replace(/<br\s*\/?>/gi,"\n");
      var text = stripHtml(html); text = decodeHtmlEntities(text);
      text = text.replace(/[ \t]+/g," ").replace(/\n{3,}/g,"\n\n").trim();
      if (text.length > 50000) text = text.substring(0,50000) + "\n\n[... truncated ...]";
      pages.push({ url: urls[i], title: title, content: text });
    } catch(e) { pages.push({ url: urls[i], error: e.message||"unknown" }); }
  }
  return { search: sr, deep: { pages: pages } };
}

// ========== 自检 ==========
function test() {
  var tests = [
    ["bing","Python",searchBing],["moegirl","test",searchMediaWiki],["bilibili","test",searchBilibili],
    ["juejin","Python",searchJuejin],["bwiki_ys","原神",searchMediaWiki],["bwiki_sr","星穹",searchMediaWiki],
    ["bwiki_ak","test",searchMediaWiki],["bwiki_zzz","test",searchMediaWiki],["bwiki_bh3","test",searchMediaWiki],
    ["bwiki_blhx","test",searchMediaWiki],["bwiki_zmd","终末地",searchMediaWiki],["bwiki_ww","test",searchMediaWiki],
    ["bwiki_gbf","test",searchMediaWiki],["prts_wiki","test",searchMediaWiki],["baike","中国",searchBaiduBaike]
  ];
  var out = [];
  for (var i = 0; i < tests.length; i++) {
    var t = tests[i], eng = null;
    for (var j = 0; j < CONFIG.engines.length; j++) { if (CONFIG.engines[j].name === t[0]) { eng = CONFIG.engines[j]; break; } }
    if (!eng) continue;
    var start = Date.now(), r = t[2](eng, t[1], 2);
    out.push({ engine: t[0], ok: r.items&&r.items.length>0, count: r.items?r.items.length:0, ms: Date.now()-start });
  }
  return { diagnostics: out };
}
