// ============================================================
// 搜索 v7.7 — B站双搜(专栏+视频)·字典黑名单·自动引号·16引擎
// 新改动：对于能力较差的模型，直接增加了限制搜索三条的硬性规则，并feedback来提醒ai越矩调整
// 专栏其实爬不到正文，不过能爬到标题和评论也还行吧。
// 爬取到的资源均来自网络,版权争议与该脚本无关。
// 所有爬取均遵守robots规则，不是api就是robots允许爬取（截止至2026.6.7）
// © 2026 梅影寒窗。允许个人使用、修改、分发。严禁出售及商业用途。（除非我自己做了集成软件）
// 关注B站梅影寒窗谢谢喵
// ============================================================

var console = typeof console !== 'undefined' ? console : { warn: function(){}, log: function(){}, error: function(){} };

var CONFIG = {
  userAgent: "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36",
  defaultResultSize: 10, maxResultSize: 30,
  engines: [
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
    { name: "bing",       cat: "web",     page: "https://cn.bing.com/search?format=rss&count=10&q=" },
    { name: "bilibili",   cat: "article", page: "https://www.bilibili.com/read/cv" },
    { name: "juejin",     cat: "tech",    page: "https://juejin.cn/post/" },
    { name: "baike",      cat: "heavy",   page: "https://baike.baidu.com/item/" }
  ]
};

// ========== 游戏名→英文 ==========
var GAME_EN = {
  "原神": "Genshin Impact", "星穹铁道": "Honkai Star Rail", "崩坏星穹铁道": "Honkai Star Rail",
  "明日方舟": "Arknights", "绝区零": "Zenless Zone Zero", "崩坏3": "Honkai Impact 3rd",
  "崩坏三": "Honkai Impact 3rd", "王者荣耀": "Honor of Kings", "部落冲突": "Clash of Clans",
  "皇室战争": "Clash Royale", "碧蓝航线": "Azur Lane", "终末地": "Arknights Endfield",
  "第五人格": "Identity V", "和平精英": "PUBG Mobile", "英雄联盟": "League of Legends",
  "无畏契约": "VALORANT", "火影忍者": "Naruto Mobile", "阴阳师": "Onmyoji",
  "幻塔": "Tower of Fantasy", "鸣潮": "Wuthering Waves"
};

// ========== 游戏名 → 对应 bwiki 引擎（@game 路由裁剪用） ==========
// @game 默认串行打 10+ 个游戏 wiki，极慢。检测到具体游戏后只保留该游戏的 wiki，省 5-9 次网络请求。
var GAME_WIKI = {
  "原神": ["bwiki_ys"],
  "星穹铁道": ["bwiki_sr"], "崩坏星穹铁道": ["bwiki_sr"], "星铁": ["bwiki_sr"],
  "明日方舟": ["prts_wiki", "bwiki_ak"], "方舟": ["prts_wiki", "bwiki_ak"],
  "终末地": ["bwiki_zmd"],
  "绝区零": ["bwiki_zzz"],
  "崩坏3": ["bwiki_bh3"], "崩坏三": ["bwiki_bh3"], "崩3": ["bwiki_bh3"],
  "碧蓝航线": ["bwiki_blhx"],
  "鸣潮": ["bwiki_ww"]
};

function detectGameWikis(q) {
  var best = null, bestLen = 0;
  for (var key in GAME_WIKI) {
    if (q.indexOf(key) !== -1 && key.length > bestLen) { best = GAME_WIKI[key]; bestLen = key.length; }
  }
  return best;
}

// ========== 硬性 ≤3 关键词 ==========
// 用户绝对规则："绝不超过 3 个关键词"。AI 会把它当建议忽略，所以脚本层强制执行。
// 按空白切词，超过 3 个只保留前 3 个（贴合 <游戏> <角色> <限定> 模板——重要词在前），
// 其余记入 dropped 字段反馈给 AI。纯 CJK 连写（无空格）无法可靠切分，原样返回。
var MAX_KEYWORDS = 3;
function capKeywords(q) {
  var toks = q.split(/\s+/).filter(Boolean);
  if (toks.length <= MAX_KEYWORDS) return { q: q, dropped: [] };
  return { q: toks.slice(0, MAX_KEYWORDS).join(" "), dropped: toks.slice(MAX_KEYWORDS) };
}

// ========== 垃圾小游戏站（@game 中文搜常被污染） ==========
var JUNK_HOSTS = ["poki.com", "4399.com", "7k7k.com", "3839.com", "9game.cn",
  "yxdown.com", "2345.com", "minigame", "h5game"];
function isJunkHost(url) {
  if (!url) return false;
  for (var i = 0; i < JUNK_HOSTS.length; i++) if (url.indexOf(JUNK_HOSTS[i]) !== -1) return true;
  return false;
}

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

// ========== 字典站黑名单（v7.5） ==========
var DICT_HOSTS = [
  "hanyuguoxue.com",    // 汉语国学
  "chagushici.com",     // 查古诗词
  "gushici.net",        // 古诗词网
  "hancibao.com",       // 汉辞宝
  "hgcha.com",          // 好工具查
  "xh.5156edu.com",      // 新华字典
  "zdic.net",           // 汉典
  "cidianwang.com",     // 词典网
  "ciyuan.com",         // 词源
  "zidian.com",         // 字典
  "cidian.cn",          // 词典
  "ciku.com",           // 词库
  "dict.cn",            // 海词
  "fanyici.com",        // 反义词
  "jinyici.com"         // 近义词
];

function isDictHost(url) {
  if (!url) return false;
  for (var i = 0; i < DICT_HOSTS.length; i++)
    if (url.indexOf(DICT_HOSTS[i]) !== -1) return true;
  return false;
}

function isDictSpam(item) {
  // 字典域名
  if (isDictHost(item.url)) return true;

  // 垃圾小游戏站（poki/4399/7k7k…）—— @game 中文搜的主要污染源
  if (isJunkHost(item.url)) return true;

  // 百度百科单字条目
  if (item.url && item.url.indexOf("baike.baidu.com") !== -1) {
    var t = (item.title||"").replace(/[_\-—|\s].*$/,"").replace(/[（(].*[）)]/,"");
    if (t.length === 1) return true;
  }

  // 标题含字典模式
  var title = (item.title||"").toLowerCase();
  if (/的意思|的拼音|的部首|的笔画|的笔顺|怎么读|怎么念|读什么/.test(title)) return true;
  if (/^.\s*[（(]汉字[）)]/.test(title)) return true;

  // 内容以字典释义开头
  if (/^[^，。]{0,10}[，,]?汉字[的源流演变]/.test(item.text||"")) return true;

  return false;
}

// ========== SPA域名 + 字典域名排除 ==========
var SPA_HOSTS = ["mihoyo.com","hoyoverse.com","hoyolab.com","fandom.com","gamepedia.com",
  "game8.co","prydwen.gg","gamesradar.com","zhihu.com","jianshu.com"];
var SPA_EXCLUDE = "-site:mihoyo.com -site:hoyoverse.com -site:hoyolab.com -site:fandom.com -site:game8.co -site:prydwen.gg -site:zhihu.com";

function isSPAHost(url) {
  for (var i = 0; i < SPA_HOSTS.length; i++)
    if (url.indexOf(SPA_HOSTS[i]) !== -1) return true;
  return false;
}

// ========== 中文自动引号（v7.5） ==========
function quoteForBing(q) {
  // 1. 如果匹配已知游戏名，给该部分加引号
  var bestKey = "", bestLen = 0;
  for (var key in GAME_EN) {
    if (q.indexOf(key) !== -1 && key.length > bestLen) {
      bestKey = key; bestLen = key.length;
    }
  }
  if (bestKey) {
    return q.replace(bestKey, '"' + bestKey + '"');
  }
  // 2. 否则给第一个2字以上中文词加引号
  var m = q.match(/^([一-鿿㐀-䶿]{2,})/);
  if (m && m[1].length >= 2) {
    return '"' + m[1] + '"' + q.substring(m[1].length);
  }
  return q;
}

// ========== Bing英文降级 ==========
function translateForBing(q) {
  var bestKey = "", bestLen = 0;
  for (var key in GAME_EN) {
    if (q.indexOf(key) !== -1 && key.length > bestLen) {
      bestKey = key; bestLen = key.length;
    }
  }
  if (!bestKey) return null;
  var en = GAME_EN[bestKey];
  var rest = q.replace(bestKey, "").replace(/^\s+|\s+$/g, "");
  var candidates = [en + (rest ? " " + rest : "") + " " + SPA_EXCLUDE];
  candidates.push(en + " " + (rest || "") + " site:reddit.com");
  return candidates;
}

// ========== 引擎 ==========
function searchBing(eng, q, limit) {
  function _f(qq, n) {
    // ★ v7.5: 给中文词加引号防止拆字
    var searchQ = qq;
    if (/[一-鿿]/.test(qq)) searchQ = quoteForBing(qq);

    var u = eng.page + encodeURIComponent(searchQ);
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

  function _filter(items) {
    var clean = [], spam = 0;
    for (var i = 0; i < items.length; i++) {
      if (isDictSpam(items[i])) { spam++; continue; }
      clean.push(items[i]);
    }
    return clean;
  }

  function _countDict(items) {
    var n = 0;
    for (var i = 0; i < items.length; i++) if (isDictSpam(items[i])) n++;
    return n;
  }

  try {
    var rawItems = _f(q, limit);
    var rawDict = _countDict(rawItems);  // 过滤前统计
    var items = [];
    for (var i = 0; i < rawItems.length; i++)
      if (!isDictSpam(rawItems[i])) items.push(rawItems[i]);

    var seen = {};
    for (var i = 0; i < items.length; i++) seen[items[i].url] = true;

    // 1. 中文降噪回退
    if (items.length < 3) {
      var cs = simplify(q);
      for (var c = 0; c < cs.length && items.length < limit*2; c++) {
        if (cs[c] === q) continue;
        var ex = _f(cs[c], Math.ceil(limit/2));
        for (var j = 0; j < ex.length; j++) {
          if (isDictSpam(ex[j])) continue;
          if (!seen[ex[j].url]) { seen[ex[j].url] = true; items.push(ex[j]); }
        }
      }
    }

    // 2. 英文降级 + SPA排除
    if (items.length < 3) {
      var enCandidates = translateForBing(q);
      if (enCandidates) {
        for (var ei = 0; ei < enCandidates.length && items.length < limit; ei++) {
          var enQ = enCandidates[ei];
          if (enQ === q) continue;
          var enItems = _f(enQ, limit);
          for (var k = 0; k < enItems.length; k++) {
            if (isDictSpam(enItems[k])) continue;
            if (!seen[enItems[k].url]) {
              seen[enItems[k].url] = true;
              enItems[k].engine = enItems[k].engine + "-en";
              items.push(enItems[k]);
            }
          }
        }
      }
    }

    // 3. 兜底
    if (items.length === 0) {
      var chars = q.replace(/[a-zA-Z0-9\s]/g, "").split("").filter(function(x,i,a){return a.indexOf(x)===i;});
      if (chars.length >= 2) {
        var word = chars.join("").substring(0,4);
        var lastTry = _f(word, limit);
        for (var li = 0; li < lastTry.length; li++)
          if (!isDictSpam(lastTry[li])) items.push(lastTry[li]);
      }
    }

    // 4. 标记SPA结果
    for (var si = 0; si < items.length; si++) {
      if (isSPAHost(items[si].url)) items[si].spa = true;
    }

    return { items: items, _dictFiltered: rawDict };
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
  var headers = { "User-Agent": CONFIG.userAgent, "Referer": "https://www.bilibili.com/", "Accept": "application/json" };
  var items = [];

  // ★ 作者限定：由 resolve() 解析的 "author:名字" / "up:名字" 存入 ACTIVE_AUTHOR（已从关键词剔除）。
  //   用来把结果锁定到官号。匹配大小写不敏感、子串包含，逗号可分隔多个。
  var authorFilter = ACTIVE_AUTHOR;
  function _authorOk(name) {
    if (!authorFilter) return true;
    var n = (name || "").toLowerCase();
    for (var i = 0; i < authorFilter.length; i++) if (n.indexOf(authorFilter[i]) !== -1) return true;
    return false;
  }

  // ★ v7.6: 同时搜视频和专栏
  function _searchType(stype) {
    try {
      var u = "https://api.bilibili.com/x/web-interface/search/type?search_type="+stype+"&keyword="+encodeURIComponent(q)+"&page=1&page_size="+Math.min(limit,20);
      var res = fetch(u, { headers: headers });
      if (!res || !res.ok) return [];
      var data = res.json(); if (data.code !== 0) return [];
      var results = (data.data&&data.data.result)||[], out = [];
      for (var i = 0; i < results.length && i < limit; i++) {
        var r = results[i];
        if (stype === "article") {
          if (!r.id) continue;
          if (!_authorOk(r.author || (r.author_name) || "")) continue;   // 作者限定
          var d = r.summary||r.description||"";
          if (d.length > 300) d = d.substring(0,300)+"...";
          var item = { title: decodeHtmlEntities(stripHtml(r.title||"")), url: "https://www.bilibili.com/read/cv"+r.id, text: decodeHtmlEntities(stripHtml(d)), engine: eng.name+":article" };
          if (!d) item.summaryEmpty = true;
          out.push(item);
        } else {
          // video — 更丰富的数据
          if (!r.aid) continue;
          if (!_authorOk(r.author || "")) continue;                      // 作者限定
          var d2 = r.description||"";
          if (d2.length > 300) d2 = d2.substring(0,300)+"...";
          var tag = r.tag||"";
          var vt = decodeHtmlEntities(stripHtml(r.title||""));
          var item2 = { title: vt, url: "https://www.bilibili.com/video/av"+r.aid, text: decodeHtmlEntities(stripHtml(d2)), engine: eng.name+":video", play: r.play||0, pubdate: r.pubdate||0, author: r.author||"", tag: tag };
          if (!d2) item2.summaryEmpty = true;
          out.push(item2);
        }
      }
      return out;
    } catch(e) { return []; }
  }

  var articles = _searchType("article");
  var videos = _searchType("video");

  // 合并：专栏优先，视频补充
  var seen = {};
  for (var i = 0; i < articles.length; i++) { seen[articles[i].url] = true; items.push(articles[i]); }
  for (var j = 0; j < videos.length; j++) {
    if (!seen[videos[j].url]) { seen[videos[j].url] = true; items.push(videos[j]); }
  }
  return { items: items.slice(0, limit) };
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
// 作者限定（"author:名字"/"up:名字"）由 resolve() 解析后存这里，供 searchBilibili 读取。
var ACTIVE_AUTHOR = null;

var ROUTES = {
  "@game":  { o: ["bwiki_ys","bwiki_sr","bwiki_ak","bwiki_zzz","bwiki_bh3","bwiki_blhx","bwiki_zmd","bwiki_ww","bwiki_gbf","prts_wiki","bilibili","moegirl","bing"], min: 3 },
  "@anime": { o: ["bilibili","moegirl","bing"], min: 2 },
  "@learn": { o: ["bilibili","juejin","bing"], min: 2 },
  "@tech":  { o: ["juejin","bilibili","bing"], min: 2 },
  "@baike": { o: ["baike","moegirl","bilibili","bing"], min: 2 },
  "@wiki":  { o: ["moegirl","bilibili","bing"], min: 2 },
  "@web":   { o: ["bing"], min: 1 },
  "@all":   { o: ["bilibili","moegirl","bing","juejin","bwiki_ys","bwiki_sr","bwiki_ak","bwiki_zzz","bwiki_bh3","bwiki_blhx","bwiki_zmd","bwiki_ww","bwiki_gbf","prts_wiki","baike"], min: 99 }
};
var DEF = { o: ["bing","moegirl","bilibili","juejin"], min: 2 };

function resolve(q) {
  var tag = "";
  for (var k in ROUTES) { if (q.indexOf(k) === 0) { tag = k; q = q.substring(k.length).trim(); break; } }

  // ★ 作者限定：解析 "author:名字" / "up:名字"，存全局并从关键词里剔除（否则 Bing/Wiki 会把它当关键词）。
  ACTIVE_AUTHOR = null;
  var am = q.match(/(?:author|up)\s*:\s*([^\s]+)/i);
  if (am) {
    var names = am[1].split(/[,，]/).map(function(s){ return s.toLowerCase().trim(); }).filter(Boolean);
    if (names.length) ACTIVE_AUTHOR = names;
    q = q.replace(am[0], "").replace(/\s+/g, " ").trim();
  }

  // ★ 关键词硬卡：用户规则"绝不超过 3 个词"。脚本层强制，AI 无法绕过。
  //   在 @game 裁剪之前执行，游戏名（模板里的首词）必然保留，detectGameWikis 仍正常工作。
  var capped = capKeywords(q);
  q = capped.q;
  var droppedKw = capped.dropped;

  var r = ROUTES[tag] || DEF;
  var order = r.o;

  // ★ @game 引擎裁剪：检测到具体游戏 → 只保留该游戏的 wiki，省去串行打其它 9 个 wiki 的时间。
  if (tag === "@game") {
    var gw = detectGameWikis(q);
    if (gw) {
      var pruned = [];
      for (var oi = 0; oi < order.length; oi++) {
        var nm = order[oi];
        if (nm.indexOf("bwiki_") === 0 || nm === "prts_wiki") {
          if (gw.indexOf(nm) !== -1) pruned.push(nm);   // 只留命中的游戏 wiki
        } else {
          pruned.push(nm);                               // moegirl/bilibili/bing 保留
        }
      }
      order = pruned;
    }
  }

  var engs = [];
  for (var i = 0; i < order.length; i++)
    for (var j = 0; j < CONFIG.engines.length; j++)
      if (CONFIG.engines[j].name === order[i]) { engs.push(CONFIG.engines[j]); break; }
  return { engines: engs, query: q, routeTag: tag, minEngines: r.min, droppedKeywords: droppedKw };
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
  var totalDictFiltered = 0;  // ★ v7.5: 累积被过滤的字典条目数

  for (var e = 0; e < engines.length; e++) {
    var eng = engines[e];
    if (seenEng[eng.name]) continue; seenEng[eng.name] = true;

    var fn = dispatch(eng);
    var r2 = (eng.api && fn === searchMediaWiki)
      ? searchMediaWiki(eng, q, perE, e < 2)
      : fn(eng, q, perE);

    if (r2._dictFiltered) totalDictFiltered += r2._dictFiltered;

    if (r2.items) for (var i = 0; i < r2.items.length; i++)
      if (!seenUrl[r2.items[i].url]) { seenUrl[r2.items[i].url] = true; all.push(r2.items[i]); }

    if (e >= minE - 1 && all.length >= resultSize) break;
  }

  var dedup = [], us = {};
  for (var j = 0; j < all.length; j++)
    if (!us[all[j].url]) { us[all[j].url] = true; dedup.push(all[j]); }

  if (tag !== "@game") dedup = minMatch(dedup, q);

  var result = { items: dedup.slice(0, resultSize), query: q, routeTag: tag||"default", total: dedup.length };
  if (totalDictFiltered >= 3) result.dictPolluted = true;  // ★ v7.5: 污染信号
  // ★ 关键词被硬卡时反馈：让 AI 看到自己超了词、哪些被丢，下次自觉收敛。
  if (r.droppedKeywords && r.droppedKeywords.length) result.droppedKeywords = r.droppedKeywords;

  return result;
}
