# AI Search Scripts

AI 搜索脚本集 — 运行于 Android QuickJS 环境，通过 Java 注入的 `fetch()` 进行网络请求。

## 文件说明

| 文件 | 用途 | 入口函数 |
|------|------|----------|
| `search-v7.5.js` | 16引擎中文聚合搜索 | `search(query, resultSize?)` |
| `crawl-v2.4.js` | 网页正文抓取 + B站深度采集 | `scrape(urls)` / `scrapeOne(url)` |
| `bilibili-deep-test.js` | B站评论/弹幕/置顶 独立测试 | `test()` |
| `AI-PROMPT.md` | AI 系统提示词（粘贴给 AI） | — |

## 快速开始

### 部署

将 `search-v7.5.js` 和 `crawl-v2.4.js` 部署到手机 QuickJS 环境，`AI-PROMPT.md` 粘贴到 AI 的系统提示词。

### 搜索

```js
search("@game 钟离 圣遗物")        // 游戏攻略
search("@anime 进击的巨人 结局")    // 动漫番剧
search("@learn React Hooks")        // 编程技术
search("@baike 量子纠缠")           // 百科名词
search("@web 北京 气温")            // 网页新闻
search("@all 冷门关键词")           // 穷举搜索
```

### 爬取

```js
scrape("https://example.com")                    // 单页抓取
scrape(["url1", "url2"])                         // 批量抓取
scrape("bilibili-test://BV1C7y1BCEGt")          // B站深度抓取
```

### B站深度抓取返回结构

```json
{
  "bvid": "BV1C7y1BCEGt",
  "title": "【崩铁】昔涟综合测评...",
  "desc": "...",
  "stats": { "play": 2388544, "like": 140953, "reply": 21153, "danmaku": 44638 },
  "pinnedComment": { "text": "UP主置顶评论", "author": "卡特亚", "isPinned": true },
  "hotComments": [ /* 前15条按赞排序 */ ],
  "recentComments": [ /* 前15条按时间排序 */ ],
  "insightfulComments": [ /* 关键词匹配的干货评论，前25条 */ ],
  "comments": [ /* 全部采集评论(最多60条)，按赞排序 */ ],
  "danmakuTexts": [ "弹幕1", "弹幕2", ... ]
}
```

## 搜索引擎架构

### 16引擎

| 类别 | 引擎 | 方式 |
|------|------|------|
| Wiki (快) | 萌娘百科、9个B站游戏Wiki、PRTS | MediaWiki API |
| Web (中) | Bing RSS | XML→JSON |
| 文章 (中) | B站专栏/视频、掘金 | REST API |
| 慢速 | 百度百科 | HTML抓取 |

### 路由策略

| 路由 | 引擎顺序 | 最低引擎数 |
|------|----------|-----------|
| `@game` | B站(视频+专栏) → 萌娘 → 9个Wiki → Bing | 2 |
| `@anime` | B站 → 萌娘 → Bing | 2 |
| `@learn` | 掘金 → Bing → B站 | 2 |
| `@web` | Bing → B站 | 1 |
| `@all` | 全部15引擎 | 99 |

### 字典污染防御

Bing RSS 对中文多字词做单字拆分（"原神"→"原+神"）导致百度字典条目刷屏。多层防御：

1. **引号精确匹配** — 自动给中文词加 `"原神"` 引号
2. **isDictSpam** — 过滤15个字典域名 + 单字释义条目
3. **英文降级** — 中文不足3条时自动切换英文 + `-site:` 排除SPA
4. **dictPolluted 信号** — 返回标记告知 AI 本轮被污染

## 已验证数据库

| 数据库 | 游戏 | 提取方式 |
|--------|------|----------|
| starrailstation.com | 星铁 | `/cn/characters` → `window.PAGE_CONFIG` 92角色；`/cn/character/{id}` → 技能/星魂/故事/语音 |
| meropide.cn | 原神 | `/chs/characters/` → 120角色URL；`/chs/characters/{name}/` → `data-rows` 技能倍率 + `data-costs` 材料 |
| genshinlab.com | 原神 | WordPress 服务端渲染，45KB配队攻略 |
| honeyhunterworld.com | 原神 | WordPress 服务端渲染，27KB角色数据 |

## SPA 黑名单

以下站点 `scrape` 必定空返（纯客户端渲染或反爬拦截）：

`mihoyo.com` `hoyoverse.com` `fandom.com` `game8.co` `prydwen.gg` `gamesradar.com` `baike.baidu.com` `zhihu.com` `bilibili.com`(正文) `genshin.gg`

---

## 开发历程

### v7.6 (2026-06-07)
- B站双搜：视频(`search_type=video`) + 专栏合并，标签/描述/播放量全覆盖
- `@game`/`@anime` 路由 B站首发，Bing 降为兜底
- `@web`/`@all` 保持 Bing 优先（新闻搜索以搜索引擎为准）

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

### Crawl v2.4 (2026-06-07)
- B站深度抓取：评论(多页60条 + 65关键词筛选 + 时效性评分) + 弹幕(protobuf UTF-8扫描) + 置顶(`top_replies`)
- 四维分类：hotComments / recentComments / insightfulComments / comments
- SPA 域名直接拒绝（省网络请求）

### Crawl v2.3 (2026-06-07)
- SPA 壳检测（React/Vue/Angular 空 mount point）
- 桌面 UA 降级重试
- SPA 域名预检 → 直接返回明确错误

### AI Prompt 迭代
- 搜索预算硬约束（3-6轮封顶）+ 4个硬停止条件
- 字典污染硬规则：连续2次被污染 → 英文锁定
- SPA 黑名单 + 已验证数据库白名单
- 正反示例工作流

## License

MIT
