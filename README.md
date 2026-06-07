# AI Search Scripts

AI 搜索脚本集 — 运行于 Android QuickJS 环境，通过 Java 注入的 `fetch()` 进行网络请求。

## 免责声明

**本站提供的资源均来自网络，版权争议与本站无关。所有内容及软件仅供学习和研究目的使用，不得用于商业或非法用途。**

若因下载或使用本站资源引发任何问题，一切后果由用户自行承担。我们不保证内容的长久可用性，且通过使用本站内容所导致的风险与本站无关。您必须在下载后的 24 小时内，从电脑/手机中彻底删除上述内容。因使用本资源导致的任何法律纠纷或损失，由使用者自行承担。

如版权方认为分享行为侵权，请通过站内信联系，本人将立即下架资源。

---

## 文件说明

| 文件 | 用途 |
|------|------|
| `search-v7.6.js` | 16引擎中文聚合搜索，含游戏名感知路由剪枝 |
| `crawl-v2.5.js` | 网页正文抓取 + B站深度采集（视频/专栏直链自动触发） |
| `prompt.md` | AI 行为规范（Behavior Spec）：标记/溯源/预算/分类规则 |
| `SKILL.md` | Web Search Toolkit：路由标签、游戏策略、数据库、抓取规则 |
| `bilibili-deep-test.js` | B站独立测试脚本 |
| `AI-PROMPT.md` | 旧版提示词（已被 prompt.md + SKILL.md 取代） |

## 快速开始

将 `search-v7.6.js` 和 `crawl-v2.5.js` 部署到手机 QuickJS 环境，`prompt.md` 和 `SKILL.md` 粘贴到 AI 的系统提示词。

### 搜索

```js
search("@game 星铁 流萤")           // 已知游戏 → 剪枝到该游戏Wiki，快且无碰撞
search("@game 流萤")                // 不知游戏 → 全Wiki广播，看哪个回应
search("@anime 进击的巨人 结局")     // 动漫番剧
search("@tech rust borrow checker") // 技术编程
search("@baike 量子纠缠")            // 百科名词
search("@web 北京 气温")             // 网页新闻
search("@all 冷门关键词")            // 穷举搜索

// 作者过滤（B站专用）
search("@game 原神 6.6 前瞻 author:原神")
```

### 爬取

```js
scrape("https://example.com")                // 单页抓取
scrape(["url1", "url2"])                     // 批量抓取
scrape("bilibili-test://BV1C7y1BCEGt")      // B站深度抓取（测试入口）
// v2.5: 直接传B站视频/专栏URL，自动触发深度抓取
scrape("https://www.bilibili.com/video/BV1...")   // → bilibiliDeep
scrape("https://www.bilibili.com/read/cv123456")  // → 热门评论
```

### B站抓取返回结构

```json
{
  "bvid": "BV1C7y1BCEGt",
  "title": "【崩铁】昔涟综合测评...",
  "stats": { "play": 2388544, "like": 140953, "reply": 21153, "danmaku": 44638 },
  "pinnedComment": { "text": "置顶评论", "author": "卡特亚", "isPinned": true },
  "hotComments": [ /* 15条按赞排序 */ ],
  "recentComments": [ /* 15条按时间排序 */ ],
  "insightfulComments": [ /* 25条关键词干货(省流/实测/机制/抽取建议等65词) */ ],
  "comments": [ /* 全部(最多60条) */ ],
  "danmakuTexts": [ "弹幕1", ... ]
}
```

失败时返回明确错误原因：`-412 风控` / `已删除` / `需登录` / `cid缺失`

---

## 搜索引擎架构

### 16引擎

| 类别 | 引擎 | 方式 |
|------|------|------|
| Wiki (快) | 萌娘百科、9个B站游戏Wiki、PRTS | MediaWiki API |
| Web (中) | Bing RSS | XML→JSON |
| 文章/视频 (中) | B站专栏 + 视频搜索、掘金 | REST API |
| 慢速 | 百度百科 | HTML抓取 |

### 路由策略 (v7.6)

| 路由 | 引擎顺序 | 说明 |
|------|----------|------|
| `@game` | 游戏Wiki(s) + B站 + 萌娘 + Bing | **感知游戏名**：含游戏名则剪枝到该Wiki，否则全广播 |
| `@anime` | B站 + 萌娘 + Bing | |
| `@learn` | B站 + 掘金 + Bing | |
| `@tech` | 掘金 + B站 + Bing | 纯技术编程 |
| `@baike` | 百度百科 + 萌娘 + B站 + Bing | |
| `@wiki` | 萌娘 + B站 + Bing | |
| `@web` | Bing | 新闻/日常 |
| `@all` | B站 + 掘金 + 萌娘 + Bing + 全部Wiki | 穷举 |

### 字典污染防御

Bing RSS 对中文多字词做单字拆分（"原神"→"原+神"）导致百度字典条目刷屏。多层防御：

1. **引号精确匹配** — 自动给中文词加 `"原神"` 引号
2. **isDictSpam** — 过滤15个字典域名 + 单字释义条目
3. **英文降级** — 中文不足3条时自动切换英文 + `-site:` 排除SPA
4. **dictPolluted 信号** — 返回标记告知 AI 本轮被污染

### 作者过滤

`author:<name>` 语法 — 追加到搜索词，B站结果仅保留上传者名包含该字符串的条目。多个用逗号分隔：
```
@game 原神 前瞻 author:原神
@game 崩铁 流萤 author:崩坏星穹铁道,星铁
```

---

## 已验证数据库

| 数据库 | 游戏 | 提取方式 |
|--------|------|----------|
| starrailstation.com | 星铁 | `/cn/characters` → `window.PAGE_CONFIG` 92角色；`/cn/character/{id}` → 技能/星魂/故事/语音(50KB JSON) |
| meropide.cn | 原神 | `/chs/characters/` → 120角色URL；`/chs/characters/{name}/` → `data-rows` 技能倍率 + `data-costs` 材料 |
| genshinlab.com | 原神 | WordPress 45KB配队攻略 |
| honeyhunterworld.com | 原神 | WordPress 27KB角色数据 |

**注意**：meropide 只有技能倍率和材料，没有星级/元素/命座。原神的星级/元素/命座需通过游戏 Wiki (`bwiki_ys`) 或官方前瞻获取。

---

## SPA 黑名单

以下站点 `scrape` 必定空返：

`mihoyo.com` `hoyoverse.com` `hoyolab.com` `fandom.com` `gamepedia.com` `game8.co` `prydwen.gg` `gamesradar.com` `baike.baidu.com` `zhihu.com` `jianshu.com` `bilibili.com`(正文) `genshin.gg`

`error` 以 `SPA(...)` 开头 → 立即放弃该URL。

---

## 开发历程

### v7.6 (2026-06-07) — search
- **游戏名感知路由**：查询含已知游戏名（原神/星铁/方舟/...）→ 剪枝到该游戏Wiki + B站 + 萌娘 → 快且无碰撞；裸角色名 → 全Wiki广播
- @game 路由 GAME_EN_MAP 匹配
- `author:<name>` 过滤：B站结果按上传者筛选
- B站引擎被提升到 `@learn`/`@wiki`/`@baike`/`@all` 前列
- `@tech` 独立标签（纯技术，掘金优先）

### v7.5 (2026-06-07)
- 字典域名黑名单 15 站 + 标题字典模式检测
- 中文专有名词自动引号（`quoteForBing`）
- 污染信号 `dictPolluted`、B站空摘要标记 `summaryEmpty`

### v7.4 (2026-06-07)
- SPA 域名 `-site:` 排除
- Reddit 论坛降级
- `isSPAHost()` 标记

### v7.3 (2026-06-07)
- GAME_EN_MAP 20个游戏中英映射
- 英文 Bing 自动降级（`translateForBing`）
- 字典垃圾检测 `isDictSpam()`

### v7.2 (2026-06-06)
- 16引擎定型：萌娘 + 9 B站 Wiki + PRTS + Bing + B站专栏 + 掘金 + 百度百科
- 路由系统：@game/@anime/@learn/@web/@baike/@all
- 渐进式搜索：title→text→keyword 降级
- `minMatchFilter` 中文 bigram 匹配

### Crawl v2.5 (2026-06-07)
- B站视频URL直接传 → 自动触发 `bilibiliDeep`
- B站专栏URL → 自动返回热门评论
- B站失败返回**明确错误原因**（cid缺失/-412风控/已删除/需登录），不再静默空字符串
- 重构数据类型检测：av号/BV号/专栏cv号自动识别

### Crawl v2.4 (2026-06-07)
- B站深度抓取：评论(多页60条 + 65关键词筛选 + 时效性评分) + 弹幕(protobuf UTF-8扫描) + 置顶(`top_replies`)
- 四维分类：hotComments / recentComments / insightfulComments / comments

### AI Prompt 迭代

**v2 (prompt.md + SKILL.md 分离)**
- prompt.md：行为规范（Rule 1-4）— 标记/溯源/预算/分类
- SKILL.md：工具机制 — 路由标签/游戏策略/作者过滤/数据库/抓取规则
- 硬停止条件从轮次改为时间（≤2min 目标，4min 硬顶）
- 作者过滤 `author:<name>` 语法
- 标签分类依据从"识别"改为"语气+历史推断"
- 溯源规则从"每句标注"改为"行文中自然提及来源"

**v1 (AI-PROMPT.md)**
- 搜索预算硬约束（3-6轮封顶）+ 4个硬停止条件
- 字典污染硬规则：连续2次被污染 → 英文锁定
- SPA 黑名单 + 已验证数据库白名单

### 搜索引擎调研 (2026-06-07)

测试了 17 个搜索引擎，仅 Bing RSS (cn.bing.com) 可从中国裸 fetch 访问：

| 引擎 | 死因 |
|------|------|
| Google / DDG / Startpage / Qwant / Brave / Yandex / Mojeek / Marginalia | GFW 阻断 |
| 百度 / 360 / 搜狗 / 神马 / 夸克 / 头条 / 秘迹 / 中国搜索 | SPA (JS渲染) |
| SearXNG ×5 | Anubis反爬 / GFW |
| Ecosia | 302 跳转 cn.bing.com |
| **Bing RSS (cn)** | **唯一可用** |

## License

MIT
