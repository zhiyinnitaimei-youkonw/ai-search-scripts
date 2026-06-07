# search_web(query) — 16引擎聚合搜索

## ⚠️ 搜索预算·硬约束（最先看）

**你不是在写论文，是在回答用户问题。用最少的搜索轮次拿到答案。**

| 问题类型 | 最多搜索轮次 | 说明 |
|----------|-------------|------|
| 事实查询（"xx是什么"） | 3轮 | 拿到核心答案就停 |
| 版本/活动信息 | 4轮 | 确认版本号+主要内容即可 |
| 角色详情（技能/数值） | 4轮 | 搜不到就认，不要反复换关键词 |
| 穷举类（"全部xx"） | 6轮 | 可以多搜几轮但别超过 |

**硬停止条件（满足任一立即停止搜索，输出已有结果）：**

1. ✅ **核心问题已回答** → 停。不需要搜用户没问的细节。
2. 🚫 **同一子问题搜了3次都没新信息** → 停。直接说"这部分目前搜不到结构化数据"。
3. 🕐 **搜索轮次达到上限** → 停。输出已有结果，标注不确定的部分。
4. ⚠️ **搜索结果出现 `dictPolluted: true` 或 `spa: true`** → 这轮中文已废，下一轮必须换英文或换思路。

**新内容认知**：刚上线的角色/版本，网上不会有元素/武器/技能的百科条目。B站只有讨论帖（无摘要），Wiki 没更新，官方站是SPA爬不了。搜2轮没拿到细节 → 认怂，告诉用户能确认什么、哪些需要去B站看攻略。

---

## 路由标记

**加路由标记，永远。**

| 意图 | 标记 | 示例 |
|------|------|------|
| 游戏攻略 | `@game` | `@game 钟离 圣遗物` |
| 动漫番剧 | `@anime` | `@anime 进击的巨人 结局` |
| 编程技术 | `@learn` | `@learn React Hooks` |
| 百科名词 | `@baike` | `@baike 量子纠缠` |
| 网页新闻 | `@web` | `@web 北京 气温` |
| 穷举 | `@all` | `@all 某冷门关键词` |

## 搜索词规则

- **2-3个关键词，不写句子**
- **角色搜单名**，不加游戏名修饰
- **Wiki搜索用最短词**：`5.6` 而非 `5.6版本 新角色 技能`
- **赛事用英文**：`KPL champion 2026` 而非 `历届KPL冠军`

## ⚠️ 字典污染·硬规则

```
连续2次中文被字典污染 → 之后全部用英文，禁止切回中文
英文已返回有效结果 → 沿英文路线深挖，禁止缩回中文
dictPolluted: true → 本轮中文搜索作废，下轮必须换策略
```

## 结果使用指南

**可直接用的（不需要 scrape）：**
- `bilibili:video` 引擎：B站视频标题+标签+描述+播放量。**标签含版本名/角色名，信息密度极高**
- `bilibili:article` 引擎：B站专栏标题+摘要
- `moegirl` / `bwiki_*` 引擎：Wiki API 标题+摘要
- `juejin` 引擎：掘金标题+摘要

**需要 scrape 的：**
- `bing` / `bing-en` 结果（只有标题+200字摘要）
- 萌娘/bwiki 的完整页面正文

**不要 scrape 的（必然空返）：**
- mihoyo.com / hoyoverse.com / fandom.com / game8.co / prydwen.gg / gamesradar.com
- baike.baidu.com / zhihu.com / bilibili.com 正文页

**已验证可抓取的第三方数据库（原神）：**
- **meropide.cn/characters/角色名** — 52KB服务端渲染，内嵌JSON（`data-rows`=技能倍率, `data-keywords`=天赋, `data-costs`=材料）
- **genshinlab.com/characters/角色名** — WordPress，45KB正文含配队指南
- **genshin-builds.com** — 静态HTML角色列表
- **honeyhunterworld.com** — WordPress，27KB正文
- **Fandom** — HTTP 403已封禁
- **genshin.gg / game8.co / prydwen.gg / meropide.cn首页** — SPA/JSR，不可用

## 返回关键字段

`{ items: [{title, url, text, engine, spa?, summaryEmpty?}], total, routeTag, dictPolluted? }`
- `dictPolluted: true` = 本轮被字典污染，结果不可靠
- `spa: true` = 此URL爬不了别爬
- `summaryEmpty: true` = B站文章无摘要文字

---

# scrape_web(url) — 网页正文抓取

- 参数：单个URL或URL数组（≤5个）
- 返回：`{ urls: [{url, title, content, error}], stats: {total, ok, spa} }`
- `error` 以 `SPA(...)` 开头 → 立即放弃
- 挑1-2个URL抓取，不要全爬
