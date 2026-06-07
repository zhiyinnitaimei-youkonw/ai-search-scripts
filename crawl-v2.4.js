// ============================================================
// 爬取脚本 v2.4 — SPA检测·UA降级·精简
// ============================================================

var console = typeof console !== 'undefined' ? console : {
  warn: function(){}, log: function(){}, error: function(){}
};

var CRAWL_CONFIG = {
  userAgent: "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 QuickJS-Crawler/2.4",
  desktopUA: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  maxRetries: 2,
  retryDelayMs: 800,
  maxContentLen: 200000
};

// 已知SPA — 直接拒绝，省一次网络请求
var SPA_DOMAINS = [
  "mihoyo.com", "hoyolab.com", "hoyoverse.com",
  "fandom.com", "gamepedia.com",
  "baike.baidu.com",
  "bilibili.com",       // 正文JS渲染（搜索API的摘要可用）
  "zhihu.com", "jianshu.com",
  "douyin.com", "tiktok.com",
  "game8.co",            // v2.4新增
  "prydwen.gg",          // v2.4新增
  "gamesradar.com"       // v2.4新增
];

function isSPAShell(html) {
  if (!html || html.length < 100) return true;
  if (html.indexOf('<div id="root"></div>') !== -1) return true;
  if (html.indexOf('<div id="__next">') !== -1) return true;
  if (html.indexOf('<div id="app"></div>') !== -1) return true;
  if (/<div[^>]+id="app"[^>]*><\/div>/.test(html)) return true;
  if (/<app-root[\s>]/.test(html)) return true;
  var body = html.replace(/<script[\s\S]*?<\/script>/gi, "")
                 .replace(/<style[\s\S]*?<\/style>/gi, "")
                 .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
                 .replace(/<svg[\s\S]*?<\/svg>/gi, "")
                 .replace(/<[^>]+>/g, "")
                 .replace(/[\s\n\r\t]+/g, " ")
                 .trim();
  if (body.length < 150) return true;
  return false;
}

function isKnownSPA(url) {
  for (var i = 0; i < SPA_DOMAINS.length; i++) {
    if (url.indexOf(SPA_DOMAINS[i]) !== -1) return SPA_DOMAINS[i];
  }
  return null;
}

function stripHtml(s) { return s.replace(/<[^>]*>/g, ""); }

function decodeHtmlEntities(s) {
  var e = { "&amp;":"&","&lt;":"<","&gt;":">","&quot;":'"',"&#39;":"'",
            "&nbsp;":" ","&mdash;":"—","&ndash;":"–",
            "&ldquo;":"“","&rdquo;":"”" };
  for (var k in e) s = s.split(k).join(e[k]);
  s = s.replace(/&#(\d+);?/g, function(_,c){ return String.fromCharCode(parseInt(c,10)); });
  s = s.replace(/&#x([0-9a-fA-F]+);?/g, function(_,c){ return String.fromCharCode(parseInt(c,16)); });
  return s;
}

function sleep(ms) {
  var end = Date.now() + ms;
  while (Date.now() < end) { /* busy-wait */ }
}

function extractTitle(html, url) {
  var m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (m) {
    var t = decodeHtmlEntities(m[1].trim());
    t = t.replace(/\s*[-–—|]\s*(萌娘百科|Bilibili|百度百科|维基百科|Wiki|BILIGAME|Fandom).*$/i, "");
    if (t) return t;
  }
  var og = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/i);
  if (og) return decodeHtmlEntities(og[1].trim());
  var h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) return stripHtml(decodeHtmlEntities(h1[1])).trim();
  var seg = url.replace(/[#?].*$/, "").replace(/\/$/, "").split("/").pop();
  return decodeURIComponent(seg || "") || url;
}

function extractMainText(html) {
  html = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  html = html.replace(/<style[\s\S]*?<\/style>/gi, "");
  html = html.replace(/<noscript[\s\S]*?<\/noscript>/gi, "");
  html = html.replace(/<svg[\s\S]*?<\/svg>/gi, "");

  var noise = ["nav","footer","header","aside","form"];
  for (var i = 0; i < noise.length; i++) {
    html = html.replace(new RegExp("<"+noise[i]+"[\\s\\S]*?<\\/"+noise[i]+">","gi"), "");
  }

  var content = html;
  var main = html.match(/<(article|main|div)[^>]*(?:class|id)=["']?(?:content|article|post|entry|main|body|detail|text|lemma)[^>]*>([\s\S]*?)<\/(?:article|main|div)>/i);
  if (main) {
    content = main[2];
  } else {
    var bodyM = html.match(/<body[\s\S]*?>([\s\S]*)<\/body>/i);
    if (bodyM) content = bodyM[1];
  }

  content = content.replace(/<\/(div|p|h[1-6]|li|tr|article|section|main|pre|blockquote)[^>]*>/gi, "\n");
  content = content.replace(/<br\s*\/?>/gi, "\n");

  var text = stripHtml(content);
  text = decodeHtmlEntities(text);
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.replace(/^[ \t]+/gm, "");
  return text.trim();
}

function fetchSinglePage(url, retriesLeft) {
  if (retriesLeft === undefined) retriesLeft = CRAWL_CONFIG.maxRetries;

  var knownBad = isKnownSPA(url);
  if (knownBad) {
    return { url: url, title: "", content: "",
      error: "SPA(" + knownBad + "): JS渲染站点，无法抓取。换第三方源。" };
  }

  var useDesktopUA = false;

  for (var attempt = 0; attempt <= retriesLeft; attempt++) {
    try {
      if (attempt > 0) sleep(CRAWL_CONFIG.retryDelayMs * attempt);

      var ua = useDesktopUA ? CRAWL_CONFIG.desktopUA : CRAWL_CONFIG.userAgent;
      var res = fetch(url, {
        headers: {
          "User-Agent": ua,
          "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
        }
      });

      if (!res || !res.ok) {
        if (attempt < retriesLeft) { useDesktopUA = true; continue; }
        return { url: url, title: "", content: "", error: "HTTP " + (res ? res.status : "null") };
      }

      var html = res.text();
      if (!html || html.length < 50) {
        if (attempt < retriesLeft) { useDesktopUA = true; continue; }
        return { url: url, title: "", content: "", error: "Empty response" };
      }

      if (isSPAShell(html)) {
        if (attempt < retriesLeft) { useDesktopUA = true; continue; }
        return { url: url, title: "", content: "",
          error: "SPA(JS渲染): 页面是React/Vue壳，需浏览器执行JS。换静态站点。" };
      }

      var title = extractTitle(html, url);
      var text = extractMainText(html);

      if (text.length > CRAWL_CONFIG.maxContentLen) {
        text = text.substring(0, CRAWL_CONFIG.maxContentLen) + "\n\n[... 截断 ...]";
      }

      if (text.length < 50 && attempt < retriesLeft) {
        useDesktopUA = true;
        continue;
      }

      return { url: url, title: title, content: text, error: null };

    } catch (e) {
      if (attempt < retriesLeft) { useDesktopUA = true; continue; }
      return { url: url, title: "", content: "", error: e.message || "unknown" };
    }
  }
  return { url: url, title: "", content: "", error: "Max retries" };
}

function scrape(urls) {
  if (typeof urls === "string") urls = [urls];
  if (!urls || urls.length === 0) return { urls: [] };

  // ★ B站深度抓取：bilibili-test://BV号
  if (urls.length === 1 && urls[0].indexOf("bilibili-test://") === 0) {
    var bvid = urls[0].replace("bilibili-test://", "");
    var deep = bilibiliDeep(bvid, { comments: 60, danmaku: true });
    // 包装成 scrape 兼容格式
    return {
      urls: [{ url: urls[0], title: deep.title || "", content: JSON.stringify(deep), error: null }],
      stats: { total: 1, ok: 1, spa: 0 },
      bilibiliDeep: deep
    };
  }

  var results = [];
  for (var i = 0; i < urls.length; i++) {
    results.push(fetchSinglePage(urls[i]));
  }

  var ok = 0, spa = 0;
  for (var j = 0; j < results.length; j++) {
    if (!results[j].error) ok++;
    else if (results[j].error.indexOf("SPA") === 0) spa++;
  }

  return { urls: results, stats: { total: urls.length, ok: ok, spa: spa } };
}

function scrapeOne(url) {
  var r = scrape([url]);
  if (r.bvid) return r;  // bilibiliDeep 结果直接返回
  return r.urls ? r.urls[0] : null;
}

// ========== B站深度抓取 ==========
function bilibiliDeep(bvid, options) {
  var opts = options || {};
  var commentCount = opts.comments || 5;
  var wantDanmaku = opts.danmaku !== false;

  var UA2 = CRAWL_CONFIG.userAgent;
  var REF = "https://www.bilibili.com/";

  function sf(url) {
    try { return fetch(url, { headers: { "User-Agent": UA2, "Referer": REF } }); }
    catch(e) { return null; }
  }

  // 1. 视频信息
  var viewRes = sf("https://api.bilibili.com/x/web-interface/view?bvid=" + bvid);
  if (!viewRes || !viewRes.ok) return { error: "view API failed", status: viewRes ? viewRes.status : "null" };
  var view = viewRes.json();
  if (view.code !== 0) return { error: "view code=" + view.code };

  var data = view.data;
  var aid = data.aid, cid = data.cid;
  var result = {
    bvid: bvid, aid: aid, cid: cid,
    title: stripHtml(decodeHtmlEntities(data.title || "")),
    desc: stripHtml(decodeHtmlEntities(data.desc || "")),
    stats: {
      play: (data.stat||{}).view || 0,
      like: (data.stat||{}).like || 0,
      reply: (data.stat||{}).reply || 0,
      danmaku: (data.stat||{}).danmaku || 0
    }
  };

  // 2. 评论（多页 + 关键词 + 时效性加权）
  var KEYWORDS = [
    // 省流总结
    "省流", "总结", "结论", "省流总结", "一言蔽之",
    // 建议抽取
    "建议", "推荐", "抽取建议", "值得抽", "不推荐", "必抽", "跳过", "别抽",
    // 实测体验
    "感觉", "觉得", "个人认为", "实测", "实际", "实战", "体验", "体感", "用下来",
    // 勘误补充
    "知识", "科普", "补充", "纠正", "勘误", "但是", "不过", "注意", "提醒",
    // 数值伤害
    "伤害", "强度", "数值", "机制", "倍率", "面板", "阈值", "计算", "乘算",
    // 配队阵容
    "配队", "阵容", "队友", "搭配", "绑定", "替代", "下位",
    // 装备
    "专武", "光锥", "遗器", "圣遗物", "命座", "星魂", "武器", "装备",
    // 对比评价
    "对比", "差距", "不如", "更强", "拉满", "值得", "性价比",
    // 版本环境
    "深渊", "混沌", "虚构", "末日", "环境", "版本", "改动", "加强", "削弱", "调整",
    "牢", "寄了", "拉了", "起飞", "膨胀", "退环境",
    // 抽卡相关
    "抽", "保底", "歪", "出货", "沉没成本",
    // 角色名 (按视频内容动态匹配 — 这里放常见词)
    "昔涟", "遐蝶", "白厄", "风堇", "刻律", "缇宝", "大黑塔", "阿格莱雅"
  ];

  function keywordScore(text) {
    var s = 0;
    for (var ki = 0; ki < KEYWORDS.length; ki++) {
      if (text.indexOf(KEYWORDS[ki]) !== -1) s++;
    }
    return s;
  }

  // 时效性评分：越新越高
  function timeScore(ctime) {
    var now = Date.now ? Math.floor(Date.now() / 1000) : 1800000000;
    var ageDays = (now - ctime) / 86400;
    if (ageDays <= 7) return 5;        // 一周内
    if (ageDays <= 30) return 3;       // 一月内
    if (ageDays <= 90) return 1;       // 一季内
    if (ageDays <= 180) return 0;      // 半年内
    return -2;                          // 半年以上
  }

  try {
    // 置顶评论
    var topRes = sf("https://api.bilibili.com/x/v2/reply?type=1&oid=" + aid + "&pn=1&ps=5&sort=2");
    if (topRes && topRes.ok) {
      var td = topRes.json();
      if (td.code === 0) {
        var topReplies = (td.data && td.data.top_replies) || [];
        if (topReplies.length > 0) {
          var ptr = topReplies[0];
          var ptc = ptr.content || {};
          result.pinnedComment = {
            like: ptr.like || 0,
            text: stripHtml(decodeHtmlEntities(ptc.message || "")),
            author: (ptr.member || {}).uname || "",
            isPinned: true
          };
        }
      }
    }

    // 多页热评采集
    var allComments = [];
    var seenRpids = {};
    var totalCount = 0;
    var pageSize = Math.min(commentCount, 20);
    var maxPages = Math.ceil(commentCount / pageSize);

    for (var pg = 1; pg <= maxPages; pg++) {
      var replyRes = sf("https://api.bilibili.com/x/v2/reply?type=1&oid=" + aid + "&pn=" + pg + "&ps=" + pageSize + "&sort=1");
      if (!replyRes || !replyRes.ok) break;
      var rd = replyRes.json();
      if (rd.code !== 0) break;

      if (pg === 1) totalCount = (rd.data && rd.data.page && rd.data.page.count) || 0;
      var replies = (rd.data && rd.data.replies) || [];

      for (var i = 0; i < replies.length; i++) {
        var r = replies[i];
        if (seenRpids[r.rpid]) continue;
        seenRpids[r.rpid] = true;

        var msg = stripHtml(decodeHtmlEntities((r.content && r.content.message) || ""));
        var ks = keywordScore(msg);
        var ts = timeScore(r.ctime || 0);
        var item = { like: r.like || 0, ctime: r.ctime || 0, text: msg, kScore: ks, tScore: ts, score: ks + ts };

        // 子回复
        if (r.replies && r.replies.length > 0) {
          item.subReplies = [];
          for (var j = 0; j < r.replies.length && j < 2; j++) {
            var srm = stripHtml(decodeHtmlEntities((r.replies[j].content && r.replies[j].content.message) || ""));
            item.subReplies.push({ like: r.replies[j].like || 0, text: srm });
          }
        }
        allComments.push(item);
      }

      if (replies.length < pageSize) break;  // 没更多了
    }

    result.totalComments = totalCount;
    result.commentsCollected = allComments.length;

    // 四维分类，各自保留原始排序：

    // 1. 热评：纯按赞数 (经典高质量评论，不论新旧)
    var byLikes = allComments.slice().sort(function(a, b) { return b.like - a.like; });
    result.hotComments = byLikes.slice(0, 15);

    // 2. 最新：按时间倒序 (社区当前讨论焦点)
    var byTime = allComments.slice().sort(function(a, b) { return b.ctime - a.ctime; });
    result.recentComments = byTime.slice(0, 15);

    // 3. 干货：关键词≥1，按 kScore + 赞数 排序
    var insightful = [];
    for (var ci = 0; ci < allComments.length; ci++) {
      if (allComments[ci].kScore >= 1) insightful.push(allComments[ci]);
    }
    insightful.sort(function(a, b) {
      return (b.kScore * 100000 + b.tScore * 10000 + b.like) -
             (a.kScore * 100000 + a.tScore * 10000 + a.like);
    });
    result.insightfulComments = insightful.slice(0, 25);

    // 4. 全部 (按赞排序，给AI全量)
    result.comments = byLikes;

  } catch(e) { result.commentError = e.message; }

  // 3. 弹幕
  if (wantDanmaku && cid) {
    try {
      var dmRes = sf("https://api.bilibili.com/x/v2/dm/web/seg.so?type=1&oid=" + cid + "&segment_index=1");
      if (dmRes && dmRes.ok) {
        var rawText = dmRes.text();
        if (rawText && rawText.length > 0) {
          result._danmakuRawLen = rawText.length;
          // 扫描CJK文本
          var texts = [], buf = "";
          for (var k = 0; k < rawText.length; k++) {
            var code = rawText.charCodeAt(k);
            if ((code >= 0x4E00 && code <= 0x9FFF) ||
                (code >= 0x3400 && code <= 0x4DBF) ||
                (code >= 0x3000 && code <= 0x303F) ||
                (code >= 0xFF00 && code <= 0xFFEF) ||
                (code >= 0x0020 && code <= 0x007E)) {
              buf += rawText.charAt(k);
            } else {
              if (buf.length >= 3 && /[一-鿿]/.test(buf)) texts.push(buf.trim());
              buf = "";
            }
          }
          if (buf.length >= 3 && /[一-鿿]/.test(buf)) texts.push(buf.trim());
          // 去重
          var seen = {}, clean = [];
          for (var t = 0; t < texts.length; t++) {
            if (!seen[texts[t]]) { seen[texts[t]] = true; clean.push(texts[t]); }
          }
          result.danmakuTexts = clean.slice(0, 100);
          result.danmakuTotal = clean.length;
        } else {
          result.danmakuError = "text() returned empty";
        }
      } else {
        result.danmakuError = "HTTP " + (dmRes ? dmRes.status : "null");
      }
    } catch(e) {
      result.danmakuError = "exception: " + e.message;
    }
  }

  return result;
}
