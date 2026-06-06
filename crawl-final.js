// ============================================================
// 爬取脚本 v2.2 — 精简稳定版
// ============================================================

// ⚠️ 安全 console（必须放最前面）
var console = typeof console !== 'undefined' ? console : {
  warn: function(){}, log: function(){}, error: function(){}
};

// ========== 配置 ==========
var CRAWL_CONFIG = {
  userAgent: "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 QuickJS-Crawler/2.2",
  maxRetries: 2,
  retryDelayMs: 800,
  maxContentLen: 200000
};

// ========== 工具 ==========
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

// ========== 标题提取 ==========
function extractTitle(html, url) {
  var m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (m) {
    var t = decodeHtmlEntities(m[1].trim());
    t = t.replace(/\s*[-–—|]\s*(萌娘百科|Bilibili|百度百科|维基百科|Wiki|BILIGAME).*$/i, "");
    if (t) return t;
  }
  var og = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/i);
  if (og) return decodeHtmlEntities(og[1].trim());
  var h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) return stripHtml(decodeHtmlEntities(h1[1])).trim();
  var seg = url.replace(/[#?].*$/, "").replace(/\/$/, "").split("/").pop();
  return decodeURIComponent(seg || "") || url;
}

// ========== 正文提取 ==========
function extractMainText(html) {
  // 移除脚本/样式/不可见元素
  html = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  html = html.replace(/<style[\s\S]*?<\/style>/gi, "");
  html = html.replace(/<noscript[\s\S]*?<\/noscript>/gi, "");
  html = html.replace(/<svg[\s\S]*?<\/svg>/gi, "");

  // 移除导航/页脚等噪音
  var noise = ["nav","footer","header","aside","form"];
  for (var i = 0; i < noise.length; i++) {
    html = html.replace(new RegExp("<"+noise[i]+"[\\s\\S]*?<\\/"+noise[i]+">","gi"), "");
  }

  // 定位主内容
  var content = html;
  var main = html.match(/<(article|main|div)[^>]*(?:class|id)=["']?(?:content|article|post|entry|main|body|detail)[^>]*>([\s\S]*?)<\/(?:article|main|div)>/i);
  if (main) {
    content = main[2];
  } else {
    var bodyM = html.match(/<body[\s\S]*?>([\s\S]*)<\/body>/i);
    if (bodyM) content = bodyM[1];
  }

  // 块级元素换行
  content = content.replace(/<\/(div|p|h[1-6]|li|tr|article|section|main|pre|blockquote)[^>]*>/gi, "\n");
  content = content.replace(/<br\s*\/?>/gi, "\n");

  var text = stripHtml(content);
  text = decodeHtmlEntities(text);
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.replace(/^[ \t]+/gm, "");
  return text.trim();
}

// ========== 单页抓取 ==========
function fetchSinglePage(url, retriesLeft) {
  if (retriesLeft === undefined) retriesLeft = CRAWL_CONFIG.maxRetries;

  for (var attempt = 0; attempt <= retriesLeft; attempt++) {
    try {
      if (attempt > 0) sleep(CRAWL_CONFIG.retryDelayMs * attempt);

      var res = fetch(url, {
        headers: {
          "User-Agent": CRAWL_CONFIG.userAgent,
          "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9"
        }
      });

      if (!res || !res.ok) {
        if (attempt < retriesLeft) continue;
        return { url: url, title: "", content: "", error: "HTTP " + (res ? res.status : "null") };
      }

      var html = res.text();
      if (!html || html.length < 50) {
        if (attempt < retriesLeft) continue;
        return { url: url, title: "", content: "", error: "Empty response" };
      }

      var title = extractTitle(html, url);
      var text = extractMainText(html);

      if (text.length > CRAWL_CONFIG.maxContentLen) {
        text = text.substring(0, CRAWL_CONFIG.maxContentLen)
             + "\n\n[... 截断 ...]";
      }

      return { url: url, title: title, content: text, error: null };

    } catch (e) {
      if (attempt < retriesLeft) continue;
      return { url: url, title: "", content: "", error: e.message || "unknown" };
    }
  }
  return { url: url, title: "", content: "", error: "Max retries" };
}

// ========== 批量抓取 ==========
function scrape(urls) {
  if (typeof urls === "string") urls = [urls];
  if (!urls || urls.length === 0) return { urls: [] };

  var results = [];
  for (var i = 0; i < urls.length; i++) {
    results.push(fetchSinglePage(urls[i]));
  }

  var ok = 0;
  for (var j = 0; j < results.length; j++) {
    if (!results[j].error) ok++;
  }

  return { urls: results, stats: { total: urls.length, ok: ok } };
}

function scrapeOne(url) {
  var r = scrape([url]);
  return r.urls ? r.urls[0] : null;
}
