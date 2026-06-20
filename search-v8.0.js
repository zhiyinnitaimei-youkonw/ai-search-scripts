// ============================================================
// 搜索 v8.0 — B站双搜(专栏+视频)·字典黑名单·自动引号·16引擎
// 新改动：对于能力较差的模型，直接增加了限制搜索三条的硬性规则，并feedback来提醒ai越矩调整
// 专栏其实爬不到正文，不过能爬到标题和评论也还行吧。
// 爬取到的资源均来自网络,版权争议与该脚本无关。
// 所有爬取均遵守robots规则，不是api就是robots允许爬取（截止至2026.6）
// © 2026 梅影寒窗。允许个人使用、修改、分发。严禁出售及商业用途。（除非我自己做了集成软件）
// 关注B站梅影寒窗谢谢喵
// ============================================================


var console = typeof console !== 'undefined' ? console : { warn: function(){}, log: function(){}, error: function(){} };

var CONFIG = {
  userAgent: "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36",
  // 搜索导向：宽度型查询(找名单/汇总)一次多拿 → 少轮次；单点型(天气/新闻)保持精简。
  defaultResultSize: 10, breadthResultSize: 20, leanResultSize: 6, maxResultSize: 30,
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

// ========== 游戏意图探测 → 强制 @game 路由（机械纠偏） ==========
// 用户实测痛点："让他搜游戏，他却用 @web / @baike / @all"。选错 tag 既白跑又慢，且 AI 不会自己改。
// 脚本层兜底：查询里有游戏名 + (游戏信号词 OR 版本号) → 不管 AI 标了什么，强制改路由到 @game。
// 只在信号明确时触发，避免劫持正常的 @web 新闻/@baike 概念查询；结果回 routeCorrected 让 AI 看见。
var GAME_SIGNAL = ["前瞻","卡池","池子","抽卡","抽取","角色","光锥","圣遗物","遗器","命座","命之座","星魂","武器","复刻","五星","四星","限定","配队","养成","祈愿","调频","up池","强度","出装"];
function hasGameName(q) {
  for (var k in GAME_WIKI) if (q.indexOf(k) !== -1) return true;
  for (var k2 in GAME_EN) if (q.indexOf(k2) !== -1) return true;
  return false;
}
function detectGameIntent(q) {
  if (!hasGameName(q)) return false;
  if (/\d+\.\d+/.test(q)) return true;                                        // 游戏名 + 版本号
  for (var i = 0; i < GAME_SIGNAL.length; i++) if (q.indexOf(GAME_SIGNAL[i]) !== -1) return true;  // 游戏名 + 信号词
  return false;
}

// ========== 数值/详情词 + 数据库改道（机械防捏造） ==========
// 教训："Skill 管住手，Prompt 管不住脑"——AI 会在名单还没确认时就追 "<角色> 星级"，
// 既白搜又容易从标题猜出假数据（捏造）。脚本层用机械信号兜底：
//   1) 看到数值词 → 返回 statHint（先确认名单，数值去爬权威源，别从标题猜）。
//   2) 该游戏有数据库 → 把数据库 URL 注入结果首位（datasite item），引导去爬结构化数据。
//   3) 一条查询里塞了多个角色名 → 返回 multiNameWarning（一次只查一个已确认的角色）。
var STAT_WORDS = ["星级","几星","星数","属性","元素","命途","光锥","圣遗物","遗器","命座","命之座","星魂","技能","天赋","数值","倍率","面板"];
function hasStatWord(q) {
  for (var i = 0; i < STAT_WORDS.length; i++) if (q.indexOf(STAT_WORDS[i]) !== -1) return true;
  return false;
}

// 仅原神 / 星铁有可爬数据库（见 SKILL「游戏数据库」表）。其余游戏无 DB，statHint 仍会提醒爬前瞻/wiki。
var GAME_DB = {
  "原神": "https://meropide.cn/chs/characters/",
  "星穹铁道": "https://starrailstation.com/cn/characters", "崩坏星穹铁道": "https://starrailstation.com/cn/characters", "星铁": "https://starrailstation.com/cn/characters"
};
function detectGameDB(q) {
  var best = null, bestLen = 0;
  for (var key in GAME_DB) {
    if (q.indexOf(key) !== -1 && key.length > bestLen) { best = GAME_DB[key]; bestLen = key.length; }
  }
  return best;
}

// 非角色名的合法限定词：从"名字计数"里排除，避免把 "前瞻"/"培养攻略" 误判成角色名。
var NAME_EXCLUDE = { "前瞻":1, "攻略":1, "培养":1, "培养攻略":1, "抽取建议":1, "配队":1, "出装":1, "评测":1, "强度":1, "角色":1, "新角色":1, "队伍":1 };
// 统计查询里"疑似角色名"的 token 数：剔除游戏名子串、版本号(含数字)、数值词、限定词后剩下的。
function countNameTokens(q) {
  var s = q;
  for (var key in GAME_WIKI) { if (s.indexOf(key) !== -1) s = s.split(key).join(" "); }
  var toks = s.split(/\s+/).filter(Boolean), n = 0;
  for (var i = 0; i < toks.length; i++) {
    var t = toks[i];
    if (/\d/.test(t)) continue;        // 版本号
    if (hasStatWord(t)) continue;      // 数值词
    if (NAME_EXCLUDE[t]) continue;     // 合法限定词
    n++;
  }
  return n;
}

// ========== 硬性 ≤3 关键词 ==========
// 用户绝对规则："绝不超过 3 个关键词"。AI 会把它当建议忽略，所以脚本层强制执行。
// 按空白切词，超过 3 个只保留前 3 个（贴合 <游戏> <角色> <限定> 模板——重要词在前），
// 其余记入 dropped 字段反馈给 AI。纯 CJK 连写（无空格）无法可靠切分，原样返回。
var MAX_KEYWORDS = 3;

// 纯占位词：挤占关键词槽位却毫无检索信息。AI 常写出 "@game 原神 版本 新角色 汇总" 这种
// 第一发模糊查询——这些词每篇游戏文都有，既占满 ≤3 槽位又把打分/词云稀释成噪声。
// 实测高频 offender：新角色(×8)/汇总/上线/版本。剥掉后塌成 "@game 原神"，再配版本号才有信号。
// 只匹配独立 token，"新版本内容" 这类复合词不受影响；剥掉的词回 strippedFiller 让 AI 看见白写；
// 全被剥掉则保留原串（避免空查询）。注意：前瞻/卡池 是真锚点词，绝不列入。
var FILLER = { "版本":1, "上线":1, "新角色":1, "新人物":1, "汇总":1, "一览":1, "最新":1 };
function stripFiller(q) {
  var toks = q.split(/\s+/).filter(Boolean);
  var kept = [], stripped = [], seen = {};
  for (var i = 0; i < toks.length; i++) {
    if (FILLER[toks[i]]) { if (!seen[toks[i]]) { seen[toks[i]] = true; stripped.push(toks[i]); } }
    else kept.push(toks[i]);
  }
  if (!kept.length) return { q: q, stripped: [] };   // 全是占位词 → 保留原串，不算剥离
  return { q: kept.join(" "), stripped: stripped };
}

function capKeywords(q) {
  var toks = q.split(/\s+/).filter(Boolean);
  if (toks.length <= MAX_KEYWORDS) return { q: q, dropped: [] };
  return { q: toks.slice(0, MAX_KEYWORDS).join(" "), dropped: toks.slice(MAX_KEYWORDS) };
}

// ========== @game 槽位注入：结构化关键词 ==========
// AI 可写 "@game game_name=原神 character_name=流萤 patch_name=3.4"，引擎把槽位值按
// 固定顺序(游戏→角色→版本)重组成查询，其余自由词延后拼接。好处：
//   1) character_name 单槽 → 天然只接一个角色名(值取到空格为止)，角色名唯一。
//   2) 顺序固定 → 游戏名永远在首位，3 词硬卡不会先砍掉它。
// 无 key=value 时原样返回（向后兼容自由式查询）。
var SLOT_RE = /(game_name|character_name|patch_name)\s*=\s*([^\s]+)/gi;
function parseGameSlots(q) {
  if (!/[a-z_]+\s*=/i.test(q)) return q;            // 没有 key= 直接跳过
  var slots = { game_name: "", character_name: "", patch_name: "" }, found = false, m;
  SLOT_RE.lastIndex = 0;
  while ((m = SLOT_RE.exec(q)) !== null) {
    var key = m[1].toLowerCase();
    if (!slots[key]) slots[key] = m[2];             // 同名槽取首个
    found = true;
  }
  if (!found) return q;
  var rest = q.replace(SLOT_RE, "").replace(/\s+/g, " ").trim();   // 剥掉槽位 token，留自由词
  var ordered = [];
  if (slots.game_name)      ordered.push(slots.game_name);
  if (slots.character_name) ordered.push(slots.character_name);
  if (slots.patch_name)     ordered.push(slots.patch_name);
  if (rest)                 ordered.push(rest);
  return ordered.join(" ");
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

// ========== 省 token：加权重 + 词云 + 截断 ==========
// 顺序（按用户要求）：先给全量结果打分排序 → 聚词云（信号最全）→ 才按多样性截断 + 缩短 snippet。
var SNIPPET_MAX = 140;     // 每条 text 最长字符数
var PER_ENGINE_CAP = 3;    // 单引擎最多入选条数，保多样性（避免全是 B站）
var DIGEST_SNIPPETS = 3;   // digest 模式（宽度型）返回的完整 snippet 条数
var TOP_SOURCES = 5;       // topSources：最值得爬取的网址数
// 词云停用词：泛词 + 官网/营销废话（防"劣质词云"，与跨源共识一起过滤）。
var TAG_STOP = { "游戏":1,"攻略":1,"资讯":1,"热门":1,"实况":1,"娱乐":1,"搞笑":1,"日常":1,"二次元":1,"手机游戏":1,"单机游戏":1,"网络游戏":1,"游戏解说":1,"网游":1,"单机":1,
  "官网":1,"官方":1,"下载":1,"首页":1,"客服":1,"登录":1,"注册":1,"版权":1,"备案":1,"活动":1,"公告":1,"福利":1,"礼包":1,"视频":1,"合集":1,"在线":1,"免费":1,"最新":1,"大全":1,"专区":1,"入口":1,"网站":1 };

// 查询词项：CJK bigram + 原始 token（含版本号 6.5/英文），去重。打分用。
function buildTerms(q) {
  var t = bigrams(q), toks = q.toLowerCase().split(/\s+/).filter(Boolean);
  for (var i = 0; i < toks.length; i++) t.push(toks[i]);
  var seen = {}, out = []; for (var j = 0; j < t.length; j++) if (!seen[t[j]]) { seen[t[j]] = true; out.push(t[j]); }
  return out;
}

// 单条打分：查询词覆盖(标题权重高) + 引擎可信度 + B站播放/tag/author + SPA/空摘要惩罚。
function scoreItem(it, terms) {
  var s = 0, title = (it.title||"").toLowerCase(), text = (it.text||"").toLowerCase();
  for (var i = 0; i < terms.length; i++) {
    if (terms[i].length < 1) continue;
    if (title.indexOf(terms[i]) !== -1) s += 3;
    else if (text.indexOf(terms[i]) !== -1) s += 1;
  }
  var eng = it.engine || "";
  if (eng === "datasite") s += 100;
  else if (eng.indexOf("bwiki_") === 0 || eng === "prts_wiki" || eng === "moegirl") s += 5;
  else if (eng.indexOf("bilibili") === 0) s += 3;
  else if (eng === "juejin") s += 2;
  if (eng === "bilibili:video") {
    if (it.tag) s += 2;
    var play = it.play || 0; if (play > 0) s += Math.min(3, Math.log(play + 1) / Math.LN10);  // log10(play)，封顶 3
  }
  if (it.author) s += 1;
  if (it.spa) s -= 4;
  if (it.summaryEmpty) s -= 1;
  return s;
}

// 词云（跨源共识版）：聚合各源高信号词，按"出现在多少个不同结果项"排序。
// 三层过滤防劣质词：① 官网/SPA 源不计入 ② 跨源共识(≥2 个不同结果项才入选，非同页重复) ③ 停用词。
// 取词：B站 tag(已策展) + 标题版本号(6.6) + 标题按分隔符切出的 2-8 字中文段(角色/专有名词)。
function buildTagCloud(items) {
  var seenIn = {};   // term -> { itemIndex:true }，统计跨"源"数
  function bump(t, idx) {
    t = (t||"").trim();
    if (!t || /^\d+$/.test(t)) return;          // 纯整数(6/42)噪声丢弃，版本号 6.6 含点保留
    if (t.length < 2 || TAG_STOP[t]) return;
    if (!seenIn[t]) seenIn[t] = {};
    seenIn[t][idx] = true;
  }
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (it.spa || isSPAHost(it.url||"")) continue;   // ① 官网/SPA 废话不进词云
    if (it.tag) { var ts = String(it.tag).split(/[,，]/); for (var j = 0; j < ts.length; j++) bump(ts[j], i); }
    var title = it.title || "";
    var vm = title.match(/\d+\.\d+/g); if (vm) for (var k = 0; k < vm.length; k++) bump(vm[k], i);
    var segs = title.split(/[\s,，、。·\.\-—_:：;；!！?？“”"'’（）()【】\[\]「」<>《》|/\\]+/);
    for (var s = 0; s < segs.length; s++) {
      var seg = segs[s].trim();
      if (seg.length >= 2 && seg.length <= 8 && /[一-鿿]/.test(seg)) bump(seg, i);
    }
  }
  var arr = [];
  for (var key in seenIn) { var n = 0; for (var x in seenIn[key]) n++; if (n >= 2) arr.push([key, n]); }  // ② 跨≥2源
  arr.sort(function(a, b) { return b[1] - a[1]; });
  var out = []; for (var m = 0; m < arr.length && m < 15; m++) out.push(arr[m][0] + "×" + arr[m][1]);
  return out;
}

// 多样性截断：已按分排序的列表里，单引擎最多取 perCap 条，凑够 n 条；不够再无视上限补齐。
function pickDiverse(items, n, perCap) {
  var out = [], cnt = {};
  for (var i = 0; i < items.length && out.length < n; i++) {
    var e = items[i].engine || "?";
    var base = e.indexOf("bilibili") === 0 ? "bilibili" : e;   // 视频+专栏合并计数
    if ((cnt[base] || 0) >= perCap) continue;
    cnt[base] = (cnt[base] || 0) + 1; out.push(items[i]);
  }
  if (out.length < n) {
    var have = {}; for (var k = 0; k < out.length; k++) have[out[k].url] = true;
    for (var j = 0; j < items.length && out.length < n; j++) if (!have[items[j].url]) out.push(items[j]);
  }
  return out;
}

// topSources：从已打分排序的全量里挑最值得爬取的 n 个网址（精简字段，弥补"词云拿不到具体信息"）。
// 排除官网/SPA(爬了也空)，去重，单源≤2 保多样。这是 digest 模式下 AI 的爬取入口。
function buildTopSources(items, n) {
  var out = [], cnt = {}, seen = {};
  for (var i = 0; i < items.length && out.length < n; i++) {
    var it = items[i], url = it.url || "";
    if (!url || seen[url]) continue;
    if (it.spa || isSPAHost(url)) continue;            // 爬不动的不给
    var eng = it.engine || "?";
    var base = eng.indexOf("bilibili") === 0 ? "bilibili" : eng;
    if ((cnt[base] || 0) >= 2) continue;               // 单源≤2
    cnt[base] = (cnt[base] || 0) + 1; seen[url] = true;
    var title = (it.title || "").trim(); if (title.length > 40) title = title.substring(0, 40) + "...";
    out.push({ url: url, title: title, engine: eng });
  }
  return out;
}

// ========== 防 thrash：跨调用搜索计数（机械"该停就停"） ==========
// 成功案例 5-6 次搞定；失败案例 20-50 次——换词/换引擎/换 tag 反复搜同一主题。
// 若 RikkaHub 整个对话共用一个 JS 运行时(globalThis 跨调用保留)，这里就累计搜索次数，
// 同主题搜到阈值就回 budgetWarning 逼 AI 收手。新主题(与历史无共词)自动清零，避免误伤。
// 不保留也无害：每次清零 = 永远不触发(空操作)。全程 try/catch，绝不让计数器拖垮搜索。
var THRASH_SOFT = 8, THRASH_HARD = 14, THRASH_GAP_MS = 600000;
function _srchStore() {
  try { if (typeof globalThis !== "undefined") { if (!globalThis.__SRCH) globalThis.__SRCH = { calls: [] }; return globalThis.__SRCH; } } catch (e) {}
  return null;
}
function _srchNow() { try { return Date.now(); } catch (e) { return 0; } }   // 设备上 Date 可用；沙盒抛错则退化为 0
function _srchSigTokens(q) {
  var toks = (q || "").toLowerCase().split(/\s+/).filter(Boolean), out = [];
  for (var i = 0; i < toks.length; i++) if (toks[i].length >= 2 && !FILLER[toks[i]]) out.push(toks[i]);
  return out;
}
function _srchShare(a, b) {
  var ta = _srchSigTokens(a); for (var i = 0; i < ta.length; i++) if (b.indexOf(ta[i]) !== -1) return true; return false;
}
// 主题锚点：优先用"游戏"归一(星铁/星穹铁道→同一 id)。游戏任务始终围绕一个游戏，
// 角色名 follow-up(不含游戏名)算作延续；换游戏才是真正换主题。非游戏查询退回共词判断。
function _srchGameOf(q) {
  var gw = detectGameWikis(q); if (gw) return gw.join(",");
  var best = "", bl = 0; for (var k in GAME_EN) if (q.indexOf(k) !== -1 && k.length > bl) { best = GAME_EN[k]; bl = k.length; }
  return best;
}
function trackSearch(q) {
  var st = _srchStore(); if (!st) return null;                  // 不持久 → 空操作
  try {
    if (!st.game) st.game = "";
    var now = _srchNow();
    if (st.calls.length && now && (now - st.calls[st.calls.length - 1].ts) > THRASH_GAP_MS) { st.calls = []; st.game = ""; }  // 间隔过久 → 新会话清零

    var g = _srchGameOf(q), sameTopic;
    if (g) sameTopic = (!st.game || st.game === g);             // 同游戏 / 首个游戏 → 延续；换游戏 → 否
    else if (st.game) sameTopic = true;                         // 游戏任务里的角色名 follow-up → 延续
    else {                                                       // 非游戏会话：共词判断
      sameTopic = (st.calls.length === 0);
      for (var i = 0; i < st.calls.length; i++) if (_srchShare(st.calls[i].q, q)) { sameTopic = true; break; }
    }
    if (st.calls.length && !sameTopic) st.calls = [];           // 换主题 → 清零
    if (g) st.game = g;                                          // 粘性游戏锚点

    st.calls.push({ q: q, ts: now });
    if (st.calls.length > 40) st.calls.shift();
    var n = st.calls.length;
    if (n >= THRASH_HARD) return "🛑 STOP: " + n + " searches on this topic. You are thrashing — switching keywords/engines/tags on the same names. Write the answer from what you ALREADY have and explicitly mark anything unconfirmed. More searching is redundant.";
    if (n >= THRASH_SOFT) return "⚠ " + n + " searches on this topic already (good runs finish in ~5). You very likely have the answer now — synthesize and stop re-searching the same names/attributes. If one fact is genuinely missing, say so once instead of hunting it.";
    return null;
  } catch (e) { return null; }
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

function searchMediaWiki(eng, q, limit, fallback, deepFallback) {
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
    if (items.length < 2 && fallback !== false && deepFallback !== false) {   // 宽度型跳过"拆词"深挖，召回靠广度
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

  // ★ 游戏意图纠偏：AI 常给游戏查询标错 tag(@web/@baike/@all)。有游戏名+信号词/版本号 → 强制 @game。
  var routeCorrected = null;
  if (tag !== "@game" && detectGameIntent(q)) {
    routeCorrected = (tag || "(none)") + " → @game";
    tag = "@game";
  }
  // ★ 作者限定：解析 "author:名字" / "up:名字"，存全局并从关键词里剔除（否则 Bing/Wiki 会把它当关键词）。
  ACTIVE_AUTHOR = null;
  var am = q.match(/(?:author|up)\s*:\s*([^\s]+)/i);
  if (am) {
    var names = am[1].split(/[,，]/).map(function(s){ return s.toLowerCase().trim(); }).filter(Boolean);
    if (names.length) ACTIVE_AUTHOR = names;
    q = q.replace(am[0], "").replace(/\s+/g, " ").trim();
  }

  // ★ @game 槽位注入：game_name/character_name/patch_name=值 → 按序重组(见 parseGameSlots)。
  //   在去占位词/卡词之前，这样重组后的查询照常走 stripFiller/capKeywords/游戏裁剪。
  if (tag === "@game") q = parseGameSlots(q);

  // ★ 去占位词 + 关键词硬卡：用户规则"绝不超过 3 个词"+"第一发别模糊"。脚本层强制，AI 无法绕过。
  //   先剥占位词（"@game 原神 版本 新角色 汇总" → "原神"），再卡 ≤3；被剥的词回 strippedFiller，
  //   让 AI 看见这些词白写（旧版静默 strip，AI 学不到）。都在 @game 裁剪之前执行，游戏名必然保留。
  var sf = stripFiller(q);
  q = sf.q;
  var strippedFiller = sf.stripped;
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

  // ★ 数值词机械兜底（仅 @game）：见上方 STAT_WORDS 注释。
  var statQuery = false, gameDbUrl = null, multiName = false;
  if (tag === "@game") {
    statQuery = hasStatWord(q);
    if (statQuery) {
      gameDbUrl = detectGameDB(q);
      multiName = countNameTokens(q) >= 2;
    }
  }

  var engs = [];
  for (var i = 0; i < order.length; i++)
    for (var j = 0; j < CONFIG.engines.length; j++)
      if (CONFIG.engines[j].name === order[i]) { engs.push(CONFIG.engines[j]); break; }
  return { engines: engs, query: q, routeTag: tag, minEngines: r.min, droppedKeywords: droppedKw,
           statQuery: statQuery, gameDbUrl: gameDbUrl, multiName: multiName, routeCorrected: routeCorrected,
           strippedFiller: strippedFiller };
}

// ========== 主搜索 ==========
function search(query, resultSize) {
  var r = resolve(query);
  var engines = r.engines, q = r.query, minE = r.minEngines, tag = r.routeTag;
  if (!q) return { items: [], query: "", routeTag: null };

  // ★ 搜索导向：宽度型 tag(@game/@all/@anime 找名单/汇总贴)一次多拿、扫全引擎，少回合；
  //   单点型 @web(天气/新闻)精简。调用方显式传 resultSize 时优先。
  var breadth = (tag === "@game" || tag === "@all" || tag === "@anime");
  if (!resultSize || resultSize <= 0)
    resultSize = breadth ? CONFIG.breadthResultSize : (tag === "@web" ? CONFIG.leanResultSize : CONFIG.defaultResultSize);
  if (resultSize > CONFIG.maxResultSize) resultSize = CONFIG.maxResultSize;

  var budgetWarning = trackSearch(q);   // ★ 跨调用 thrash 计数（持久才生效，否则空操作）

  var all = [], seenUrl = {}, seenEng = {};
  // 每引擎抓取量：摊到各引擎，下限 8。宽度型靠"扫全引擎"覆盖汇总源，不靠单引擎堆量。
  var perE = Math.max(Math.ceil(resultSize / Math.max(engines.length, 1)) + 4, 8);
  var totalDictFiltered = 0;  // ★ v7.5: 累积被过滤的字典条目数

  for (var e = 0; e < engines.length; e++) {
    var eng = engines[e];
    if (seenEng[eng.name]) continue; seenEng[eng.name] = true;

    var fn = dispatch(eng);
    var r2 = (eng.api && fn === searchMediaWiki)
      ? searchMediaWiki(eng, q, perE, e < 2, !breadth)
      : fn(eng, q, perE);

    if (r2._dictFiltered) totalDictFiltered += r2._dictFiltered;

    if (r2.items) for (var i = 0; i < r2.items.length; i++)
      if (!seenUrl[r2.items[i].url]) { seenUrl[r2.items[i].url] = true; all.push(r2.items[i]); }

    // 宽度型不提前 break：路由内所有引擎都查一遍，汇总/名单源(常在 bing/B站、排在末位)才不会被漏。
    if (!breadth && e >= minE - 1 && all.length >= resultSize) break;
  }

  var dedup = [], us = {};
  for (var j = 0; j < all.length; j++)
    if (!us[all[j].url]) { us[all[j].url] = true; dedup.push(all[j]); }

  if (tag === "@web") dedup = minMatch(dedup, q);   // 只有新闻类硬过滤话题相关；其余交给打分排序

  // ★ B 加权重：先给全量结果打分并排序（先权重再截断）。
  var terms = buildTerms(q);
  for (var s = 0; s < dedup.length; s++) dedup[s]._score = scoreItem(dedup[s], terms);
  dedup.sort(function(a, b) { return b._score - a._score; });

  // ★ C 词云：用排序后、截断前的全量结果聚合，信号最全。
  var cloud = buildTagCloud(dedup);

  // ★ A 截断：宽度型走 digest（只 DIGEST_SNIPPETS 条 snippet，其余靠 topSources/词云）；其余照常。
  var snippetN = breadth ? DIGEST_SNIPPETS : resultSize;
  var picked = pickDiverse(dedup, snippetN, PER_ENGINE_CAP);
  for (var p = 0; p < picked.length; p++) {
    delete picked[p]._score;
    if (picked[p].text && picked[p].text.length > SNIPPET_MAX) picked[p].text = picked[p].text.substring(0, SNIPPET_MAX) + "...";
  }

  var result = { items: picked, query: q, routeTag: tag||"default", total: dedup.length };
  if (r.routeCorrected) result.routeCorrected = r.routeCorrected;   // ★ 路由被强制改到 @game 的提示
  if (budgetWarning) result.budgetWarning = budgetWarning;          // ★ 搜太多次的硬性收手信号
  if (cloud.length) result.tagCloud = cloud;          // ★ 词云：一行看全名字/版本，省去逐条读 snippet
  if (totalDictFiltered >= 3) result.dictPolluted = true;  // ★ 字典污染信号
  if (r.droppedKeywords && r.droppedKeywords.length) result.droppedKeywords = r.droppedKeywords;
  if (r.strippedFiller && r.strippedFiller.length) result.strippedFiller = r.strippedFiller;   // ★ 被屏蔽的占位词反馈

  // ★ digest：宽度型附 topSources(爬取入口) + scrapeHint，弥补"词云拿不到具体信息"。
  if (breadth) {
    var topSources = buildTopSources(dedup, TOP_SOURCES);
    if (topSources.length) result.topSources = topSources;
    result.scrapeHint = "Digest mode: tagCloud lists names/versions aggregated across sources; items carry only the top " + DIGEST_SNIPPETS + " snippets. For exact details (stats, dates, prices) scrape topSources[0] or the game Wiki — never infer specifics from the cloud or a title.";
  }

  // ★ 数值词机械兜底：附 statHint，有数据库则注入 datasite 首位，多角色则警告。
  if (r.statQuery) {
    result.statHint = "Stat/numeric query. (1) Confirm this character is on the official 前瞻 roster BEFORE trusting any stat. (2) Exact numbers (star/element/path/skill multipliers) must come from a scraped database or game Wiki — never inferred from search titles.";
    if (r.gameDbUrl) {
      result.dbUrl = r.gameDbUrl;
      var dbDup = false;
      for (var di = 0; di < result.items.length; di++) if (result.items[di].url === r.gameDbUrl) { dbDup = true; break; }
      if (!dbDup) result.items.unshift({
        title: "[DB] scrape this for accurate stats — " + r.gameDbUrl,
        url: r.gameDbUrl, engine: "datasite", db: true,
        text: "Authoritative game database. Scrape this page for star/element/path/skill numbers instead of inferring from search snippets."
      });
    }
    if (r.multiName) result.multiNameWarning = "Multiple character names in one stat query. Query ONE confirmed character at a time — batching guessed names wastes rounds and risks asserting characters that aren't on the roster.";
  }

  return result;
}
