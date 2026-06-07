\---

name: web-search-toolkit

description: Free aggregated web search and page scraping on a mobile QuickJS runtime via search\_web() and scrape\_web(). Use whenever the user needs to look something up online — facts, news, study or coding topics, game/anime/character info. Defines route tags, the game playbook, author filtering, game databases (Star Rail / Genshin), scraping rules, and return fields.

\---



\# Web Search Toolkit — Usage Guide



Two tools, free sources only, on a mobile (Android / QuickJS) runtime:



\- `search\_web(query)` — multi-engine aggregated search, routed by a leading `@` tag.

\- `scrape\_web(url)` — fetch + extract a page (or up to 5).



Requests are \*\*synchronous and serial\*\* — one fetch finishes before the next. Speed comes from \*\*fewer, sharper\*\* calls. Behavior rules (always `@`, no fabrication, budget) live in the AI Behavior Spec; this file is mechanics.



\## Route tags — every query starts with exactly one



| Intent | Tag | Routes to (in order) | Example |

|---|---|---|---|

| Game guides / characters | `@game` | game Wiki(s) + `bilibili` + `moegirl` + `bing` | `@game 铃兰` |

| Anime / manga / novel lore | `@anime` | `bilibili` + `moegirl` + `bing` | `@anime 进击的巨人 结局` |

| Learning a topic (+ video) | `@learn` | `bilibili` + `juejin` + `bing` | `@learn React hooks` |

| Pure technical / programming | `@tech` | `juejin` + `bilibili` + `bing` | `@tech rust borrow checker` |

| Encyclopedic facts | `@baike` | `baike` + `moegirl` + `bilibili` + `bing` | `@baike 量子纠缠` |

| General reference | `@wiki` | `moegirl` + `bilibili` + `bing` | `@wiki 光合作用` |

| News / weather / daily life | `@web` | `bing` | `@web 北京 天气` |

| Exhaustive / rare keyword | `@all` | `bilibili` first, then all engines | `@all <冷门词>` |



Default when unsure: infer the category (see Behavior Spec Rule 4) and tag it — `@web` (general) or `@baike` (a concept) only as a last resort. Never send a tagless query.



> \*\*Bilibili now sits early in every tag\*\* (incl. `@tech`/`@wiki`/`@baike`/`@all`) so its high-signal video tags + comments contribute even on study/tech/encyclopedia queries — not just games.



\## ⛔ HARD keyword rule (the #1 cause of slow, bad searches)



\*\*At most 3 keywords per query. Proper nouns only.\*\* Mixing many words wrecks both Bing and Bilibili and forces extra rounds.



\- ✅ `@game 娜维娅`  ·  ✅ `@game 原神 前瞻`  ·  ✅ `@game 娜维娅 培养攻略`

\- ❌ `@game 原神 6.5 月之六 新角色 技能 元素` (6 words → junk results, Wiki misses)

\- Drop filler: 怎么 / 如何 / 最新 / 打法 / 最强 / 推荐 (the engine also strips these, don't rely on it).

\- \*\*`@game` routing depends on whether you name a game.\*\* Name a game (`@game 星铁 流萤`) → router prunes to that one Wiki + Bilibili/moegirl/Bing: fast and \*\*collision-proof\*\*. Bare name (`@game 流萤`) → router queries \*\*all\*\* game Wikis and keeps every hit, so a shared name shows hits from \*\*both\*\* games — that overlap is your clash signal. \*\*Know the game → lead with it. Don't know it → search the bare name, then read which Wiki answered.\*\* The router never auto-picks one game for a shared name.



\## 🎮 Game playbook — follow this order



```

1\. @game <游戏名> <版本号> 前瞻      → which version + new character names (1 search)

&#x20;  (skip if you already know the character name)

&#x20;  If it fails → @game <游戏名> <official-account> author:<official-account>



2\. Know the game? → @game <游戏名> <角色名>   ← lead with it: one Wiki, no clash risk

&#x20;  Don't know the game? → @game <角色名>       ← broadcast; read which Wiki answered

&#x20;      one Wiki answered → that's the home game

&#x20;      two+ answered → name clash → @game <游戏名> <角色名>



3\. Detailed stats:

&#x20;  - Game HAS a database (below) → scrape the DB page FIRST. One DB scrape > 3 Bilibili searches.

&#x20;  - No database → @game <角色名> 培养攻略  (or 抽取建议)



4\. Lore / story / relationships → @game <角色名>  → game Wikis.

```



\## 🎯 Author filter — lock to official / trusted accounts



Append `author:<name>` (or `up:<name>`) to a query → Bilibili results are kept \*\*only\*\* if the uploader name contains that string. Comma-separate several. The token is stripped from the keywords automatically (Bing/Wiki never see it).



\- `@game 原神 6.6 前瞻 author:原神` → only 米哈游/原神 official-account videos \& columns.

\- `@game 崩坏星穹铁道 流萤 author:崩坏星穹铁道,星铁` → either official handle.



Use it for version previews/announcements where you want the source of truth, not fan edits.



\## 🗄️ Game databases — scrape these directly (structured, accurate, fast)



| Game | Layer | URL | Scrape returns |

|---|---|---|---|

| \*\*Honkai: Star Rail\*\* | roster | `starrailstation.com/cn/characters` | all 92 chars as `name(★rarity·element·path)` |

| | character | `starrailstation.com/cn/character/{pageId}` | stats, skills, eidolons, traces, relic rec, stories, voice (from `window.PAGE\_CONFIG`) |

| \*\*Genshin Impact\*\* | list | `meropide.cn/chs/characters/` | \~120 character detail URLs |

| | skills | `meropide.cn/chs/characters/{中文名}/` | NA/Skill/Burst multipliers (Lv1→Lv15) + talent costs |



\- Genshin has \*\*no\*\* roster-with-rarity page like Star Rail; meropide gives skill \*\*multipliers\*\*, not star/element/constellations. For Genshin star/element, use the game Wiki (`bwiki\_ys`) or the official preview — and per Rule 2, mark it if you can't confirm.

\- Get `{pageId}` (Star Rail) / `{中文名}` (Genshin) from the list page first.

\- For brand-new characters, trust DB numbers over Bilibili titles.



\## Using results WITHOUT scraping (often enough)



\- `bilibili:video` — title + \*\*`tag`\*\* (version/character names — highest-signal field) + desc + `play` + `pubdate` + `author`.

\- `bilibili:article` — column title + summary (`summaryEmpty: true` = no summary).

\- `moegirl` / `bwiki\_\*` / `prts\_wiki` — Wiki API title + snippet.

\- `juejin` — dev-article title + snippet.



Read snippets before scraping — frequently you're already done.



\## Scraping — when, and what never



\*\*Worth scraping:\*\* `bing` / `bing-en` hits (stub only), full `moegirl` / `bwiki\_\*` pages (now extracted correctly via MediaWiki content block), the game DB pages above. Pick the \*\*1–2 most relevant\*\* URLs.



\*\*Bilibili (handled specially — works for single AND multi-URL now):\*\*

\- Video URL (`…/video/av…` or `BV…`) → returns `bilibiliDeep`: title/desc/stats, `pinnedComment`, `hotComments` / `recentComments` / `insightfulComments` (省流/build/stats/纠错) / `comments`, and `danmakuTexts`.

\- Column URL (`…/read/cv…`) → returns hot comments (the article body itself is JS-rendered and uncrawlable; comments often hold the TL;DR).

\- On failure you now get an \*\*explicit error reason\*\* (cid missing / -412 risk-control / deleted / login needed), not a silent empty string. If you see that, fall back to the search snippet instead of retrying.



\*\*Never scrape\*\* (always empty / blocked):

\- `mihoyo.com` / `hoyoverse.com` / `hoyolab.com` / `fandom.com` / `gamepedia.com`

\- `game8.co` / `prydwen.gg` / `gamesradar.com` / `genshin.gg`

\- `baike.baidu.com` / `zhihu.com` / `jianshu.com`

\- `meropide.cn/.../stats/` (JS-rendered) and meropide \*\*homepage\*\* (only `/chs/characters/...` pages work)



If a `scrape\_web` `error` starts with `SPA(...)`, abandon that URL.



\## Return fields



`search\_web` → `{ items: \[{title, url, text, engine, spa?, summaryEmpty?, tag?, play?, pubdate?, author?}], query, routeTag, total, dictPolluted? }`

\- `dictPolluted: true` = dictionary/junk-polluted round; switch to English next round.

\- `spa: true` = uncrawlable URL.

\- `tag` = Bilibili video tags (version/character names) — best version-attribution signal.



`scrape\_web` → `{ urls: \[{url, title, content, error}], stats: {total, ok, spa} }`

\- A single Bilibili video URL additionally returns `bilibiliDeep`; `content` is its JSON string.

\- `error` starting with `SPA(...)` → abandon. A non-empty Bilibili `error` tells you \*why\* it failed — read it.

