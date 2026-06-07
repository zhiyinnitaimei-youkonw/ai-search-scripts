// ============================================================
// 爬取脚本 v2.5 — SPA检测·UA降级·精简
//本站提供的资源,均来自网络,版权争议与本站无关。所有内容及软件仅供学习和研究目的使用,不得用于商业或非法用途。
//若因下载或使用本站资源引发任何问题,一切后果由用户自行承担。我们不保证内容的长久可用性,且通过使用本站内容所导致的风险与本站无关。
//您必须在下载后的24小时内,从电脑/手机中彻底删除上述内容。
//因使用本资源导致的任何法律纠纷或损失, ** 由使用者自行承担 ** 。
//如版权方认为分享行为侵权,请通过站内信联系,本人将立即下架资源。
//关注B站梅影寒窗谢谢喵
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
  // ★ 数据内嵌在脚本/属性里的页面不是空壳：
  //   starrailstation 的 window.PAGE_CONFIG；meropide 的 data-rows / data-costs（SSR 倍率/材料）。
  if (html.indexOf('window.PAGE_CONFIG') !== -1) return false;
  if (html.indexOf('data-rows') !== -1 || html.indexOf('data-costs') !== -1) return false;
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

// 从 html 中 startIdx 处的 <div ...> 起，按 <div>/</div> 深度配对切出完整块（处理嵌套）。
function sliceDiv(html, startIdx) {
  var tagRe = /<\/?div\b[^>]*>/gi;
  tagRe.lastIndex = startIdx;
  var depth = 0, m;
  while ((m = tagRe.exec(html)) !== null) {
    if (m[0].charAt(1) === "/") { depth--; if (depth === 0) return html.substring(startIdx, m.index); }
    else depth++;
  }
  return html.substring(startIdx);   // 没配平就取到结尾
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

  var content = null;

  // ★ MediaWiki（萌娘 / bwiki_* / prts）：正文在 mw-parser-output / mw-content-text，div 多层嵌套，
  //   非贪婪 </div> 会在第一个闭合处截断（之前 bwiki scrape 只返回页头页脚的根因）。用深度配对取整块。
  var mwM = html.match(/<div[^>]*class=["'][^"']*\bmw-parser-output\b[^"']*["'][^>]*>/i)
         || html.match(/<div[^>]*id=["']mw-content-text["'][^>]*>/i);
  if (mwM) {
    content = sliceDiv(html, mwM.index);
    // 去掉 MediaWiki 常见噪声块（编辑节、目录、导航模板表格留着也无妨，这里只删目录/编辑）
    content = content.replace(/<div[^>]*id=["']toc["'][\s\S]*?<\/div>/i, "");
  }

  if (content === null) {
    var main = html.match(/<(article|main|div)[^>]*(?:class|id)=["']?(?:content|article|post|entry|main|body|detail|text|lemma)[^>]*>/i);
    if (main) {
      content = main[1].toLowerCase() === "div" ? sliceDiv(html, main.index) : html.substring(main.index);
    } else {
      var bodyM = html.match(/<body[\s\S]*?>([\s\S]*)<\/body>/i);
      content = bodyM ? bodyM[1] : html;
    }
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

// 从 s[open]（'{' 或 '['）起按括号配对切出完整 JSON（跳过字符串内的括号）。
// window.PAGE_CONFIG 含嵌套对象，非贪婪正则 \{.+?\} 会在第一个 '}' 截断，必须配对。
function sliceBalanced(s, open) {
  var openCh = s.charAt(open);
  var closeCh = openCh === "{" ? "}" : "]";
  var depth = 0, inStr = false, esc = false;
  for (var i = open; i < s.length; i++) {
    var c = s.charAt(i);
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === openCh) depth++;
    else if (c === closeCh) { depth--; if (depth === 0) return s.substring(open, i + 1); }
  }
  return null;
}

function srStripHtml(s) {
  return decodeHtmlEntities(stripHtml(String(s || ""))).replace(/\s+/g, " ").trim();
}

// starrailstation 角色详情页 (/cn/character/{pageId}) → window.PAGE_CONFIG 顶层对象 d。
// 渲染高价值字段为干净文本，故事/语音截断防膨胀。标签用英文（数据值本身是中文）。
function renderStarRailCharacter(d) {
  var out = [];

  var head = "[Character: " + (d.name || "?") + "]";
  if (d.spRequirement) head += "  SP/Speed req ≈ " + d.spRequirement;
  out.push(head);

  // 满级基础面板（levelData 最后一档突破）
  if (d.levelData && d.levelData.length) {
    var lv = d.levelData[d.levelData.length - 1], st = [];
    if (lv.hpBase != null)      st.push("HP " + Math.round(lv.hpBase));
    if (lv.attackBase != null)  st.push("ATK " + Math.round(lv.attackBase));
    if (lv.defenseBase != null) st.push("DEF " + Math.round(lv.defenseBase));
    if (lv.speedBase != null)   st.push("SPD " + lv.speedBase);
    if (lv.crate != null)       st.push("CRIT " + lv.crate);
    if (lv.cdmg != null)        st.push("CDMG " + lv.cdmg);
    if (lv.aggro != null)       st.push("Aggro " + lv.aggro);
    if (st.length) out.push("[Max-level base stats] " + st.join(" / "));
  }

  // 技能
  if (d.skills && d.skills.length) {
    var sk = [];
    for (var i = 0; i < d.skills.length; i++) {
      var s = d.skills[i]; if (!s || !s.name) continue;
      var line = "· " + (s.typeDescHash ? "[" + s.typeDescHash + "] " : "") + s.name;
      var meta = [];
      if (s.tagHash) meta.push(s.tagHash);
      if (s.energy != null) meta.push("energy+" + s.energy);
      if (s.ultimateCost != null) meta.push("ult cost " + s.ultimateCost);
      if (s.break != null) meta.push("break " + s.break);
      if (meta.length) line += "（" + meta.join("·") + "）";
      sk.push(line);
    }
    if (sk.length) out.push("[Skills]\n" + sk.join("\n"));
  }

  // 星魂 / 命座
  if (d.ranks && d.ranks.length) {
    var rk = [];
    for (var j = 0; j < d.ranks.length; j++) {
      var r = d.ranks[j]; if (!r || !r.name) continue;
      var desc = srStripHtml(r.descHash);
      if (desc.length > 220) desc = desc.substring(0, 220) + "…";
      rk.push("E" + (j + 1) + " 「" + r.name + "」" + (desc ? "：" + desc : ""));
    }
    if (rk.length) out.push("[Eidolons]\n" + rk.join("\n"));
  }

  // 行迹树额外能力
  if (d.skillTreePoints && d.skillTreePoints.length) {
    var tp = [];
    for (var k = 0; k < d.skillTreePoints.length; k++) {
      var p = d.skillTreePoints[k];
      if (p && p.embedBonusSkill && p.embedBonusSkill.name) tp.push("· " + p.embedBonusSkill.name);
    }
    if (tp.length) out.push("[Trace bonus abilities]\n" + tp.join("\n"));
  }

  // 遗器推荐（结构未定 → 截断转储）
  if (d.relicRecommend) {
    var rr = "";
    try { rr = JSON.stringify(d.relicRecommend); } catch (e) {}
    if (rr && rr !== "{}") {
      if (rr.length > 1500) rr = rr.substring(0, 1500) + "…";
      out.push("[Relic recommendation (raw JSON)] " + rr);
    }
  }

  // 角色故事（截断，整体上限 ~4000 字）
  if (d.storyItems && d.storyItems.length) {
    var sto = [], sused = 0;
    for (var a = 0; a < d.storyItems.length; a++) {
      var it = d.storyItems[a]; if (!it || !it.text) continue;
      var tx = srStripHtml(it.text);
      if (tx.length > 600) tx = tx.substring(0, 600) + "…";
      sto.push("◆ " + (it.title || "story") + "\n" + tx);
      sused += tx.length; if (sused > 4000) break;
    }
    if (sto.length) out.push("[Character stories]\n" + sto.join("\n\n"));
  }

  // 语音（低价值：标题 + 短文本，整体硬上限 ~2500 字）
  if (d.voiceItems && d.voiceItems.length) {
    var vc = [], vused = 0;
    for (var b = 0; b < d.voiceItems.length; b++) {
      var vi = d.voiceItems[b]; if (!vi || !vi.title) continue;
      var vt = srStripHtml(vi.text);
      if (vt.length > 120) vt = vt.substring(0, 120) + "…";
      vc.push("· " + vi.title + (vt ? "：" + vt : ""));
      vused += vt.length;
      if (vused > 2500) { vc.push("…(voice lines truncated)"); break; }
    }
    if (vc.length) out.push("[Voice lines]\n" + vc.join("\n"));
  }

  return out.length ? out.join("\n\n") : null;
}

// 抽取页面内嵌 window.PAGE_CONFIG（starrailstation）。
//   /cn/character/{pageId} → 角色详情（skills/ranks/storyItems/...）
//   /cn/characters         → 角色名单（entries:[{name,rarity,damageType,baseType}]）
function extractStarRail(html) {
  var pcIdx = html.indexOf("window.PAGE_CONFIG");
  if (pcIdx === -1) return null;
  var eq = html.indexOf("=", pcIdx);
  if (eq === -1) return null;
  var brace = html.indexOf("{", eq);
  if (brace === -1) return null;
  var cfgStr = sliceBalanced(html, brace);
  if (!cfgStr) return null;

  var cfg;
  try { cfg = JSON.parse(cfgStr); }
  catch (e) {
    return "[window.PAGE_CONFIG raw JSON (parse failed, handle manually)]\n" + cfgStr.substring(0, 8000);
  }

  // PAGE_CONFIG 偶尔把数据包在 .data 下，归一化
  var d = cfg;
  if (cfg.data && (cfg.data.skills || cfg.data.entries || cfg.data.name || cfg.data.levelData)) d = cfg.data;

  // 角色详情页优先
  if (d.skills || d.ranks || d.levelData || d.storyItems) {
    var charText = renderStarRailCharacter(d);
    if (charText) {
      if (charText.length > 80000) charText = charText.substring(0, 80000) + "\n[... embedded data truncated ...]";
      return charText;
    }
  }

  // 角色名单页
  var entries = d.entries || null;
  if (entries && entries.length) {
    var lines = [];
    for (var e = 0; e < entries.length; e++) {
      var en = entries[e]; if (!en || !en.name) continue;
      var parts = [];
      if (en.rarity) parts.push("★" + en.rarity);
      if (en.damageType && en.damageType.name) parts.push(en.damageType.name);
      if (en.baseType && en.baseType.name) parts.push(en.baseType.name);
      lines.push(en.name + (parts.length ? "（" + parts.join("·") + "）" : ""));
    }
    if (lines.length)
      return "[Character roster (" + lines.length + ", format: name(★rarity·element·path))]\n" + lines.join("\n");
  }

  return null;
}

// 解析一个 HTML 属性值（可能用 ' 或 " 包裹，且内部实体被转义），返回解码后的字符串。
function readAttr(html, attrName, fromIdx) {
  var re = new RegExp(attrName + "\\s*=\\s*(\"([^\"]*)\"|'([^']*)')", "i");
  var sub = fromIdx ? html.substring(fromIdx) : html;
  var m = sub.match(re);
  if (!m) return null;
  return decodeHtmlEntities(m[2] != null ? m[2] : (m[3] || ""));
}

// 抽取 meropide.cn（原神）页面：
//   /chs/characters/        → 列表页：正则收集角色详情 URL
//   /chs/characters/{name}/ → 技能页：data-rows（普攻/战技/爆发 15级倍率）+ data-costs（天赋材料）
function extractMeropide(html) {
  // 列表页：收集 /chs/characters/<name>/ 链接
  if (html.indexOf('data-rows') === -1 && html.indexOf('data-costs') === -1) {
    var urls = [], seen = {};
    var re = /href="(\/chs\/characters\/[^"\/]+\/)"/g, m;
    while ((m = re.exec(html)) !== null) {
      var name = decodeURIComponent(m[1].split("/").filter(Boolean).pop());
      if (!seen[m[1]]) { seen[m[1]] = true; urls.push(name + "  → https://meropide.cn" + m[1]); }
    }
    if (urls.length >= 5)
      return "[Genshin character list — meropide (" + urls.length + ")]\n" + urls.join("\n");
    return null;
  }

  var out = [];

  // 技能倍率：每个 data-rows 是一段（普攻/战技/爆发），值是 JSON 数组（15级）。
  var rowRe = /data-rows\s*=\s*("([^"]*)"|'([^']*)')/g, rm, rowIdx = 0;
  var labels = ["普通攻击", "元素战技", "元素爆发"];
  while ((rm = rowRe.exec(html)) !== null) {
    var raw = decodeHtmlEntities(rm[2] != null ? rm[2] : (rm[3] || ""));
    var rows;
    try { rows = JSON.parse(raw); } catch (e) { rows = null; }
    var label = labels[rowIdx] || ("技能组" + (rowIdx + 1));
    if (rows && rows.length) {
      var seg = [];
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        // row 可能是 {name, levels:[...]} 或 [name, v1..v15] 或纯数组
        var nm = (row && row.name) ? row.name : (Array.isArray(row) ? row[0] : ("段" + (i + 1)));
        var lv = (row && row.levels) ? row.levels : (Array.isArray(row) ? row.slice(1) : []);
        if (lv && lv.length) {
          var lv1 = lv[0], lvm = lv[lv.length - 1];
          seg.push("  " + nm + ": Lv1 " + lv1 + " → Lv" + lv.length + " " + lvm);
        } else if (nm) {
          seg.push("  " + nm);
        }
      }
      out.push("【" + label + "】\n" + seg.join("\n"));
    }
    rowIdx++;
  }

  // 天赋材料
  var costRaw = readAttr(html, "data-costs");
  if (costRaw) {
    var costs;
    try { costs = JSON.parse(costRaw); } catch (e) { costs = null; }
    if (costs) {
      var cs = "";
      try { cs = JSON.stringify(costs); } catch (e) {}
      if (cs && cs.length > 1200) cs = cs.substring(0, 1200) + "…";
      if (cs) out.push("【天赋升级材料 (raw)】 " + cs);
    }
  }

  if (out.length) {
    var titleM = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    var head = titleM ? ("[Genshin skill multipliers — " + decodeHtmlEntities(titleM[1]).replace(/\s*[-|].*$/, "").trim() + " (meropide)]") : "[Genshin skill multipliers — meropide]";
    return head + "\n" + out.join("\n\n");
  }
  return null;
}

// 内嵌结构化数据抽取的统一入口：先试 starrailstation，再试 meropide。
function extractEmbeddedData(html) {
  var sr = extractStarRail(html);
  if (sr) return sr;
  var mero = extractMeropide(html);
  if (mero) return mero;
  return null;
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
      // ★ 优先抽取内嵌结构化数据（starrailstation PAGE_CONFIG：名单页 / 角色详情页），否则走通用正文
      var embedded = extractEmbeddedData(html);
      var text = embedded || extractMainText(html);

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

// 从 URL 解析 B站视频 id（BV/av）；非视频返回 null。
function biliVideoId(u) {
  if (u.indexOf("bilibili-test://") === 0) return u.replace("bilibili-test://", "");
  var mBv = u.match(/bilibili\.com\/video\/(BV[0-9A-Za-z]+)/);
  if (mBv) return mBv[1];
  var mAv = u.match(/bilibili\.com\/video\/av(\d+)/i);
  if (mAv) return "av" + mAv[1];
  return null;
}

// 处理单个 B站 URL：视频→深爬(评论/弹幕)，专栏(read/cv)→评论。非 B站返回 null（让调用方走通用抓取）。
function biliHandle(u) {
  var vid = biliVideoId(u);
  if (vid) {
    var deep = bilibiliDeep(vid, { comments: 60, danmaku: true });
    if (deep && !deep.error) {
      return { url: u, title: deep.title || "", content: JSON.stringify(deep), error: null, _deep: deep };
    }
    // 深爬失败 → 给出明确原因，不再静默空返回（之前 ~7/8 视频空返回的根因）
    return { url: u, title: "", content: "",
      error: "bilibili-video: deep crawl failed — " + ((deep && deep.error) || "unknown") +
             "（可能：cid缺失/风控-412/视频已删/需登录）。用搜索返回的标题+tag+简介即可。" };
  }
  // 专栏 read/cv → 正文 JS 渲染抓不到，改取热评（之前 100% 空返回的根因）
  var mcv = u.match(/bilibili\.com\/read\/(?:cv|mobile\/)?(\d+)/i) || u.match(/\/read\/cv(\d+)/i);
  if (mcv) {
    var cv = mcv[1];
    var cmt = biliArticleComments(cv);
    if (cmt && cmt.content) return { url: u, title: cmt.title || "", content: cmt.content, error: null };
    return { url: u, title: "", content: "",
      error: "bilibili-article(cv" + cv + "): 正文JS渲染不可爬，热评也未取到 — " +
             ((cmt && cmt.error) || "无评论/风控") + "。改用搜索返回的专栏摘要。" };
  }
  return null;
}

// 专栏(read/cv)评论：type=12, oid=cvid。正文爬不到，热评常含省流/数据/纠错。
function biliArticleComments(cvid) {
  var UA2 = CRAWL_CONFIG.userAgent, REF = "https://www.bilibili.com/";
  function sf(url) { try { return fetch(url, { headers: { "User-Agent": UA2, "Referer": REF } }); } catch(e) { return null; } }
  var endpoints = [
    "https://api.bilibili.com/x/v2/reply/main?type=12&oid=" + cvid + "&mode=3&next=0",
    "https://api.bilibili.com/x/v2/reply?type=12&oid=" + cvid + "&sort=2&pn=1&ps=20"
  ];
  var lastCode = "?";
  for (var ep = 0; ep < endpoints.length; ep++) {
    var res = sf(endpoints[ep]);
    if (!res || !res.ok) { lastCode = "HTTP" + (res ? res.status : "null"); continue; }
    var data; try { data = res.json(); } catch(e) { lastCode = "badjson"; continue; }
    if (data.code !== 0) { lastCode = data.code; continue; }
    var d = data.data || {}, list = [], seen = {}, out = [];
    if (d.top && d.top.upper && d.top.upper.content) list.push(d.top.upper);
    var reps = d.replies || [];
    for (var i = 0; i < reps.length; i++) list.push(reps[i]);
    for (var j = 0; j < list.length && out.length < 20; j++) {
      var r = list[j]; if (!r || !r.content) continue;
      var msg = stripHtml(decodeHtmlEntities((r.content.message || "")).replace(/\s+/g, " ")).trim();
      if (!msg || seen[msg]) continue; seen[msg] = true;
      out.push("[" + (r.like || 0) + "赞] " + msg);
    }
    if (out.length) return { title: "", content: "【专栏热评 TOP" + out.length + "（正文不可爬，以下为评论区）】\n" + out.join("\n") };
    lastCode = "0(空评论)";
  }
  return { error: "评论API code=" + lastCode };
}

function scrape(urls) {
  if (typeof urls === "string") urls = [urls];
  if (!urls || urls.length === 0) return { urls: [] };

  // ★ 单个 B站视频 URL：返回完整 bilibiliDeep（保持向后兼容的顶层字段）。
  if (urls.length === 1) {
    var h = biliHandle(urls[0]);
    if (h) {
      var r1 = { url: h.url, title: h.title, content: h.content, error: h.error };
      var ret = { urls: [r1], stats: { total: 1, ok: h.error ? 0 : 1, spa: 0 } };
      if (h._deep) ret.bilibiliDeep = h._deep;
      return ret;
    }
  }

  var results = [];
  for (var i = 0; i < urls.length; i++) {
    // ★ 多 URL 数组里的 B站链接也逐个深爬/取评论（之前直接走 SPA 路径全部空返回）。
    var bh = biliHandle(urls[i]);
    if (bh) { results.push({ url: bh.url, title: bh.title, content: bh.content, error: bh.error }); continue; }
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
  if (r.bilibiliDeep) return r;  // B站深度结果：返回完整结构（含评论/弹幕）
  return r.urls ? r.urls[0] : null;
}

// ========== B站深度抓取 ==========
function bilibiliDeep(idOrBv, options) {
  var opts = options || {};
  var commentCount = opts.comments || 5;
  var wantDanmaku = opts.danmaku !== false;

  var UA2 = CRAWL_CONFIG.userAgent;
  var REF = "https://www.bilibili.com/";

  function sf(url) {
    try { return fetch(url, { headers: { "User-Agent": UA2, "Referer": REF } }); }
    catch(e) { return null; }
  }

  // ★ 兼容 BV 号 / av 号 / 纯 aid 数字 —— search 返回的是 av 链接，view API 需用 aid= 查询。
  var idStr = String(idOrBv);
  var viewQuery;
  if (/^BV[0-9A-Za-z]+$/.test(idStr)) {
    viewQuery = "bvid=" + idStr;
  } else {
    var avNum = idStr.replace(/^av/i, "");
    viewQuery = /^\d+$/.test(avNum) ? ("aid=" + avNum) : ("bvid=" + idStr);
  }

  // 1. 视频信息
  var viewRes = sf("https://api.bilibili.com/x/web-interface/view?" + viewQuery);
  if (!viewRes || !viewRes.ok) return { error: "view API failed", status: viewRes ? viewRes.status : "null" };
  var view = viewRes.json();
  if (view.code !== 0) return { error: "view code=" + view.code };

  var data = view.data;
  var aid = data.aid, cid = data.cid;
  var result = {
    bvid: data.bvid || (/^BV/.test(idStr) ? idStr : ""), aid: aid, cid: cid,
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
    "省流", "总结", "结论", "省流总结", "一句话",
    // 建议抽取
    "建议", "推荐", "抽取建议", "值得抽", "不推荐", "必抽", "跳过", "别抽","抽爆",
    // 实测体验
    "感觉", "觉得", "个人认为", "实测", "实际", "实战", "体验", "体感", "用起来","中杯","大杯","超大杯","你是啥杯",
    // 勘误补充
    "知识", "科普", "补充", "纠正", "勘误", "但是", "不过", "注意", "提醒",
    // 数值伤害
    "伤害", "强度", "数值", "机制", "倍率", "面板", "阈值", "计算", "乘算",
    // 配队阵容
    "配队", "阵容", "队友", "搭配", "绑定", "替代", "下位","战舰",
    // 装备
    "专武", "光锥", "遗器", "圣遗物", "命座", "星魂", "武器", "装备",
    // 对比评价
    "对比", "差距", "不如", "更强", "拉满", "值得", "性价比","路边",
    // 版本环境
    "深渊", "混沌", "虚构", "末日", "环境", "版本", "改动", "加强", "削弱", "调整",
    "牢", "寄了", "拉了", "起飞", "膨胀", "退环境",
    // 抽卡相关
    "抽", "保底", "歪", "出货", "沉没成本","零氪","微氪","月卡党","富哥","v我50",
    // 正妻宣言
    "昔涟", "爱莉", "我女朋友", "缇宝", "小格蕾修", "我的最爱", "铃兰", "忍冬","我老婆"
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

  // ★ 若评论与弹幕都没拿到，视为失败并给出原因（让上层报明确错误，而不是返回近乎空对象）。
  var gotComments = (result.comments && result.comments.length) || (result.pinnedComment ? 1 : 0);
  var gotDanmaku = (result.danmakuTexts && result.danmakuTexts.length);
  if (!gotComments && !gotDanmaku) {
    var why = [];
    if (result.commentError) why.push("comments: " + result.commentError);
    else why.push("comments: 空/风控");
    if (result.danmakuError) why.push("danmaku: " + result.danmakuError);
    result.error = "no comments/danmaku — " + why.join("; ");
  }

  return result;
}