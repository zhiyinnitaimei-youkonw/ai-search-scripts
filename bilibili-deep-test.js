// ============================================================
// B站深度抓取 — 评论+弹幕+简介 测试脚本
// 用法: bilibiliDeep("BV1C7y1BCEGt", {comments:5, danmaku:true})
// ============================================================
var console = typeof console !== 'undefined' ? console : { warn: function(){}, log: function(){}, error: function(){} };

var UA = "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36";
var REFERER = "https://www.bilibili.com/";

function safeFetch(url) {
  try {
    return fetch(url, { headers: { "User-Agent": UA, "Referer": REFERER, "Accept": "application/json" } });
  } catch(e) { console.warn("fetch error:", url, e.message); return null; }
}

// ========== 工具 ==========
function stripHtml(s) { return s.replace(/<[^>]*>/g, ""); }
function decodeHtmlEntities(s) {
  var e = { "&amp;":"&","&lt;":"<","&gt;":">","&quot;":'"',"&#39;":"'","&nbsp;":" " };
  for (var k in e) s = s.split(k).join(e[k]);
  return s;
}

// ========== 弹幕 protobuf → 文本扫描 ==========
function extractDanmakuText(rawStr) {
  // rawStr 是 text() 的结果 — 二进制被当成 Latin-1 或 lossy UTF-8
  // 策略：遍历字符串，找连续的中文字符序列
  var texts = [];
  var buf = "";
  for (var i = 0; i < rawStr.length; i++) {
    var c = rawStr.charAt(i);
    var code = rawStr.charCodeAt(i);
    // CJK Unified Ideographs: U+4E00 ~ U+9FFF
    // 也收 CJK Extension A/B 和标点
    if ((code >= 0x4E00 && code <= 0x9FFF) ||
        (code >= 0x3400 && code <= 0x4DBF) ||
        (code >= 0x3000 && code <= 0x303F) ||  // CJK 标点
        (code >= 0xFF00 && code <= 0xFFEF) ||  // 全角标点
        (code >= 0x2000 && code <= 0x206F) ||  // 通用标点
        (code >= 0x0020 && code <= 0x007E) ||  // ASCII 可打印
        (code >= 0x0080 && code <= 0x00FF)) {  // Latin-1 补充（可能含被误解码的字节）
      buf += c;
    } else {
      // 遇到不可打印字符 → 保存当前 buf 并重置
      if (buf.length >= 4 && /[一-鿿]/.test(buf)) {
        texts.push(buf.trim());
      }
      buf = "";
    }
  }
  if (buf.length >= 4 && /[一-鿿]/.test(buf)) {
    texts.push(buf.trim());
  }
  // 去重
  var seen = {}, clean = [];
  for (var i = 0; i < texts.length; i++) {
    if (!seen[texts[i]]) { seen[texts[i]] = true; clean.push(texts[i]); }
  }
  return clean;
}

// ========== 主函数 ==========
function bilibiliDeep(bvid, options) {
  var opts = options || {};
  var commentCount = opts.comments || 5;
  var wantDanmaku = opts.danmaku !== false;

  // 1. 获取视频信息
  var viewRes = safeFetch("https://api.bilibili.com/x/web-interface/view?bvid=" + bvid);
  if (!viewRes || !viewRes.ok) return { error: "view API failed", status: viewRes ? viewRes.status : "null" };

  var view = viewRes.json();
  if (view.code !== 0) return { error: "view API code=" + view.code };

  var data = view.data;
  var aid = data.aid;
  var cid = data.cid;
  var title = stripHtml(decodeHtmlEntities(data.title || ""));
  var desc = stripHtml(decodeHtmlEntities(data.desc || ""));
  var stat = data.stat || {};

  var result = {
    bvid: bvid,
    aid: aid,
    cid: cid,
    title: title,
    desc: desc,
    stats: {
      play: stat.view || 0,
      like: stat.like || 0,
      reply: stat.reply || 0,
      danmaku: stat.danmaku || 0
    }
  };

  // 2. 获取评论
  try {
    var replyRes = safeFetch("https://api.bilibili.com/x/v2/reply?type=1&oid=" + aid + "&pn=1&ps=" + commentCount + "&sort=1");
    if (replyRes && replyRes.ok) {
      var replyData = replyRes.json();
      if (replyData.code === 0) {
        var replies = (replyData.data && replyData.data.replies) || [];
        result.totalComments = (replyData.data && replyData.data.page && replyData.data.page.count) || 0;
        result.comments = [];
        for (var i = 0; i < replies.length; i++) {
          var r = replies[i];
          var msg = stripHtml(decodeHtmlEntities((r.content && r.content.message) || ""));
          var item = { like: r.like || 0, ctime: r.ctime || 0, text: msg };
          // 子回复
          if (r.replies && r.replies.length > 0) {
            item.subReplies = [];
            for (var j = 0; j < r.replies.length && j < 2; j++) {
              var sr = r.replies[j];
              item.subReplies.push({
                like: sr.like || 0,
                text: stripHtml(decodeHtmlEntities((sr.content && sr.content.message) || ""))
              });
            }
          }
          result.comments.push(item);
        }
      }
    }
  } catch(e) { result.commentError = e.message; }

  // 3. 获取弹幕
  if (wantDanmaku && cid) {
    try {
      // ★ 关键测试点：fetch protobuf 二进制 → text()
      var dmUrl = "https://api.bilibili.com/x/v2/dm/web/seg.so?type=1&oid=" + cid + "&segment_index=1";
      var dmRes = safeFetch(dmUrl);
      if (dmRes && dmRes.ok) {
        var rawText = dmRes.text();
        if (rawText && rawText.length > 0) {
          var dms = extractDanmakuText(rawText);
          result.danmakuTexts = dms.slice(0, 100);       // 最多100条
          result.danmakuTotal = dms.length;
          result._danmakuRawLen = rawText.length;         // 调试用
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

// ========== 测试入口 ==========
function test() {
  console.log("=== B站深度抓取测试 ===");
  console.log("目标: BV1C7y1BCEGt (崩铁昔涟测评)");

  var r = bilibiliDeep("BV1C7y1BCEGt", { comments: 3, danmaku: true });

  console.log("\n--- 基本信息 ---");
  console.log("title:", r.title);
  console.log("desc:", r.desc ? r.desc.substring(0, 100) : "(空)");
  console.log("stats: play=" + r.stats.play + " like=" + r.stats.like + " reply=" + r.stats.reply + " danmaku=" + r.stats.danmaku);

  console.log("\n--- 评论 (前" + (r.comments ? r.comments.length : 0) + "/" + (r.totalComments || 0) + ") ---");
  if (r.comments) {
    for (var i = 0; i < r.comments.length; i++) {
      var c = r.comments[i];
      console.log("  [" + c.like + "赞] " + c.text.substring(0, 120));
      if (c.subReplies) {
        for (var j = 0; j < c.subReplies.length; j++) {
          console.log("    └ [" + c.subReplies[j].like + "赞] " + c.subReplies[j].text.substring(0, 100));
        }
      }
    }
  }
  if (r.commentError) console.log("  ERROR: " + r.commentError);

  console.log("\n--- 弹幕 ---");
  if (r.danmakuError) {
    console.log("  ★ 弹幕获取失败: " + r.danmakuError);
  } else if (r.danmakuTexts && r.danmakuTexts.length > 0) {
    console.log("  ★ 弹幕获取成功! 共 " + r.danmakuTotal + " 条 (rawLen=" + r._danmakuRawLen + ")");
    console.log("  前15条:");
    for (var k = 0; k < r.danmakuTexts.length && k < 15; k++) {
      console.log("    " + (k+1) + ". " + r.danmakuTexts[k].substring(0, 100));
    }
  } else {
    console.log("  ★ 弹幕返回空 — text() 可能丢弃了二进制数据");
    console.log("  rawLen=" + (r._danmakuRawLen || 0));
  }

  console.log("\n=== 测试完成 ===");
  return r;
}

// ★ 文件加载后自动执行
test();
