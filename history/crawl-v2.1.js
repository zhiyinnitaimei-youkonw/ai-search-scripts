// ============================================================
// 爬取脚本 v2.1 — 并行抓取 + 重试 + AI 内容优化版
// ============================================================

// ========== 配置 ==========
var CRAWL_CONFIG = {
  userAgent: "QuickJS-Crawler/2.1",
  maxConcurrent: 3,         // 并行数（手机端保守）
  maxRetries: 2,            // 重试次数
  retryDelayMs: 800,        // 重试间隔
  maxContentLen: 300000,    // 正文截断长度（AI 友好）
  acceptedTypes: ["text/html", "text/plain", "application/xhtml+xml", ""]
};

// ========== 工具 ==========
function stripHtml(s) {
  return s.replace(/<[^>]*>/g, "");
}

function decodeHtmlEntities(s) {
  var entities = {
    "&amp;":"&", "&lt;":"<", "&gt;":">", "&quot;":'"', "&#39;":"'",
    "&nbsp;":" ", "&mdash;":"—", "&ndash;":"–",
    "&ldquo;":"“", "&rdquo;":"”",
    "&lsquo;":"‘", "&rsquo;":"’",
    "&hellip;":"…", "&middot;":"·"
  };
  for (var k in entities) {
    s = s.split(k).join(entities[k]);
  }
  s = s.replace(/&#(\d+);?/g, function(_, c) {
    return String.fromCharCode(parseInt(c, 10));
  });
  s = s.replace(/&#x([0-9a-fA-F]+);?/g, function(_, c) {
    return String.fromCharCode(parseInt(c, 16));
  });
  return s;
}

/** 简单的毫秒级 sleep */
function sleep(ms) {
  var end = Date.now() + ms;
  while (Date.now() < end) { /* busy-wait, QuickJS 兼容 */ }
}

// ========== 标题提取（多策略） ==========
function extractTitle(html, url) {
  // 策略1: <title> 标签
  var m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (m) {
    var t = decodeHtmlEntities(m[1].trim());
    // 去掉站点后缀 " - 萌娘百科" / " | Bilibili" 等
    t = t.replace(/\s*[-–—|]\s*(萌娘百科|Bilibili|百度百科|维基百科.*|Wiki.*|MIHOYO.*)$/i, "");
    if (t) return t;
  }

  // 策略2: og:title / meta title
  var og = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/i);
  if (og) return decodeHtmlEntities(og[1].trim());

  // 策略3: 第一个 <h1>
  var h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) return stripHtml(decodeHtmlEntities(h1[1])).trim();

  // 策略4: URL 最后一段作为标题
  var lastSeg = url.replace(/[#?].*$/, "").replace(/\/$/, "").split("/").pop();
  return decodeURIComponent(lastSeg || "") || url;
}

// ========== 正文提取（改进版） ==========
function extractMainText(html) {
  // 1. 移除不可见元素
  html = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  html = html.replace(/<style[\s\S]*?<\/style>/gi, "");
  html = html.replace(/<noscript[\s\S]*?<\/noscript>/gi, "");
  html = html.replace(/<svg[\s\S]*?<\/svg>/gi, "");
  html = html.replace(/<canvas[\s\S]*?<\/canvas>/gi, "");

  // 2. 移除导航/页脚/侧栏等噪音区
  var noiseTags = ["nav", "footer", "header", "aside", "form",
                    ".sidebar", ".nav", ".footer", ".header", ".menu",
                    "#sidebar", "#nav", "#footer", "#header", "#menu"];
  for (var i = 0; i < noiseTags.length; i++) {
    var tag = noiseTags[i];
    if (tag[0] === "." || tag[0] === "#") {
      // class/id 选择器 - 用属性匹配近似
      var attrVal = tag.substring(1);
      var attrName = tag[0] === "." ? "class" : "id";
      var re = new RegExp("<[^>]+" + attrName + "=[\"'][^\"']*" + attrVal + "[^\"']*[\"'][^>]*>[\\s\\S]*?<\\/[^>]+>", "gi");
      html = html.replace(re, "");
    } else {
      html = html.replace(new RegExp("<" + tag + "[\\s\\S]*?<\\/" + tag + ">", "gi"), "");
    }
  }

  // 3. 尝试定位主内容区
  var content = html;
  var mainMatch = html.match(/<(article|main|div)[^>]*(?:class|id)=["']?(?:content|article|post|entry|main|body|detail)[^>]*>([\s\S]*?)<\/(?:article|main|div)>/i);
  if (mainMatch) {
    content = mainMatch[2];
  } else {
    // 回退到 <body>
    var bodyMatch = html.match(/<body[\s\S]*?>([\s\S]*)<\/body>/i);
    if (bodyMatch) content = bodyMatch[1];
  }

  // 4. 块级元素换行
  content = content.replace(/<\/(div|p|h[1-6]|li|tr|article|section|main|pre|blockquote|table|dl|dt|dd|figure|figcaption)[^>]*>/gi, "\n");
  content = content.replace(/<br\s*\/?>/gi, "\n");
  content = content.replace(/<\/?(hr|tr)[^>]*>/gi, "\n---\n");

  // 5. 去掉标签，解码实体
  var text = stripHtml(content);
  text = decodeHtmlEntities(text);

  // 6. 清理空白
  text = text.replace(/[ \t]+/g, " ");           // 合并水平空白
  text = text.replace(/\n{3,}/g, "\n\n");        // 合并多个换行
  text = text.replace(/^[ \t]+/gm, "");          // 去行首空白
  text = text.trim();

  return text;
}

/** 检查 Content-Type 是否可解析 */
function isAcceptableType(contentType) {
  if (!contentType) return true;  // 无头，尝试解析
  var ct = contentType.toLowerCase();
  for (var i = 0; i < CRAWL_CONFIG.acceptedTypes.length; i++) {
    if (ct.indexOf(CRAWL_CONFIG.acceptedTypes[i]) !== -1) return true;
  }
  return false;
}

// ========== 单页抓取（带重试） ==========
function fetchSinglePage(url, retriesLeft) {
  if (retriesLeft === undefined) retriesLeft = CRAWL_CONFIG.maxRetries;

  for (var attempt = 0; attempt <= retriesLeft; attempt++) {
    try {
      if (attempt > 0) {
        sleep(CRAWL_CONFIG.retryDelayMs * attempt);  // 递增延迟
      }

      var res = fetch(url, {
        headers: {
          "User-Agent": CRAWL_CONFIG.userAgent,
          "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9"
        }
      });

      if (!res || !res.ok) {
        if (attempt < retriesLeft) continue;
        return { url: url, title: "", content: "", error: "HTTP " + res.status };
      }

      // 检查内容类型（防御: headers 可能不存在）
      var contentType = (res.headers && res.headers.get) ? (res.headers.get("Content-Type") || "") : "";
      if (!isAcceptableType(contentType)) {
        return { url: url, title: "", content: "", error: "Unsupported type: " + contentType };
      }

      var html = res.text();
      if (!html || html.length < 50) {
        if (attempt < retriesLeft) continue;
        return { url: url, title: "", content: "", error: "Empty or too short response" };
      }

      var title = extractTitle(html, url);
      var text = extractMainText(html);

      // 截断过长内容（AI token 友好）
      if (text.length > CRAWL_CONFIG.maxContentLen) {
        text = text.substring(0, CRAWL_CONFIG.maxContentLen)
             + "\n\n[... 内容已截断，原文共 " + text.length + " 字符 ...]";
      }

      return { url: url, title: title, content: text, error: null };

    } catch (e) {
      if (attempt < retriesLeft) continue;
      return { url: url, title: "", content: "", error: e.message };
    }
  }

  // 不应到达
  return { url: url, title: "", content: "", error: "Max retries exceeded" };
}

// ========== 批量抓取（分批并行） ==========
function scrape(urls) {
  if (typeof urls === "string") urls = [urls];
  if (!urls || urls.length === 0) return { urls: [] };

  var results = [];
  var batchSize = CRAWL_CONFIG.maxConcurrent;

  for (var start = 0; start < urls.length; start += batchSize) {
    var end = Math.min(start + batchSize, urls.length);
    var batch = urls.slice(start, end);

    // 同批内逐个发起（QuickJS 单线程，fetch 返回后立即 next）
    for (var i = 0; i < batch.length; i++) {
      results.push(fetchSinglePage(batch[i]));
    }
  }

  // 统计
  var success = 0, failed = 0;
  for (var j = 0; j < results.length; j++) {
    if (results[j].error) failed++;
    else success++;
  }

  return {
    urls: results,
    stats: { total: urls.length, success: success, failed: failed }
  };
}

// ========== 单 URL 快捷入口 ==========
function scrapeOne(url) {
  var result = scrape([url]);
  return result.urls ? result.urls[0] : result;
}
