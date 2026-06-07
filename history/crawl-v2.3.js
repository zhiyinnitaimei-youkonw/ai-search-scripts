// ============================================================
// 爬取脚本 v2.4 — SPA检测·UA降级
// ============================================================

// ⚠️ 安全 console（必须放最前面）
var console = typeof console !== 'undefined' ? console : {
  warn: function(){}, log: function(){}, error: function(){}
};

// ========== 配置 ==========
var CRAWL_CONFIG = {
  userAgent: "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 QuickJS-Crawler/2.3",
  desktopUA: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  maxRetries: 2,
  retryDelayMs: 800,
  maxContentLen: 200000
};

// ========== 已知SPA站点（爬了也白爬） ==========
var SPA_DOMAINS = [
  "mihoyo.com", "hoyolab.com", "hoyoverse.com",
  "fandom.com", "gamepedia.com",
  "baike.baidu.com",   // 反爬+SPA混合
  "bilibili.com",       // 正文JS渲染
  "zhihu.com",
  "jianshu.com",
  "douyin.com", "tiktok.com"
];

// ========== SPA壳检测 ==========
function isSPAShell(html) {
  if (!html || html.length < 100) return true;
  // React mount point
  if (html.indexOf('<div id="root"></div>') !== -1) return true;
  if (html.indexOf('<div id="__next">') !== -1) return true;
  // Vue mount point
  if (html.indexOf('<div id="app"></div>') !== -1) return true;
  if (/<div[^>]+id="app"[^>]*><\/div>/.test(html)) return true;
  // Angular
  if (/<app-root[\s>]/.test(html)) return true;
  // 正文实质内容检查：去掉所有标签/脚本/样式后几乎没文字
  var body = html.replace(/<script[\s\S]*?<\/script>/gi, "")
                 .replace(/<style[\s\S]*?<\/style>/gi, "")
                 .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
                 .replace(/<svg[\s\S]*?<\/svg>/gi, "")
                 .replace(/<[^>]+>/g, "")
                 .replace(/[\s\n\r\t]+/g, " ")
                 .trim();
  // 大量JavaScript代码但无实际内容
  if (body.length < 150) return true;
  return false;
}

function isKnownSPA(url) {
  for (var i = 0; i < SPA_DOMAINS.length; i++) {
    if (url.indexOf(SPA_DOMAINS[i]) !== -1) return SPA_DOMAINS[i];
  }
  return null;
}

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

// ========== 正文提取 ==========
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

// ========== 单页抓取 ==========
function fetchSinglePage(url, retriesLeft) {
  if (retriesLeft === undefined) retriesLeft = CRAWL_CONFIG.maxRetries;

  // 预检：已知SPA域名直接跳过
  var knownBad = isKnownSPA(url);
  if (knownBad) {
    return { url: url, title: "", content: "",
      error: "SPA(" + knownBad + "): 此站点JS渲染，无法抓取。请找第三方静态站点替代。" };
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
        if (attempt < retriesLeft) {
          if (attempt === 0) useDesktopUA = true;  // 第一次失败就切桌面UA
          continue;
        }
        return { url: url, title: "", content: "", error: "HTTP " + (res ? res.status : "null") };
      }

      var html = res.text();
      if (!html || html.length < 50) {
        if (attempt < retriesLeft) { useDesktopUA = true; continue; }
        return { url: url, title: "", content: "", error: "Empty response" };
      }

      // ★ SPA检测（v2.3新增）
      if (isSPAShell(html)) {
        if (attempt < retriesLeft) {
          useDesktopUA = true;  // 下次用桌面UA重试
          continue;
        }
        // 所有重试用完仍是SPA壳
        return { url: url, title: "", content: "",
          error: "SPA(JS渲染): 页面是React/Vue壳，需要浏览器执行JS才能加载内容。请换第三方静态站点。" };
      }

      var title = extractTitle(html, url);
      var text = extractMainText(html);

      if (text.length > CRAWL_CONFIG.maxContentLen) {
        text = text.substring(0, CRAWL_CONFIG.maxContentLen) + "\n\n[... 截断 ...]";
      }

      // 正文太短（可能漏检的SPA）
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

// ========== 批量抓取 ==========
function scrape(urls) {
  if (typeof urls === "string") urls = [urls];
  if (!urls || urls.length === 0) return { urls: [] };

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
  return r.urls ? r.urls[0] : null;
}
