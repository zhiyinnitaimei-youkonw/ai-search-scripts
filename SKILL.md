---
name: web-search-toolkit
description: Free aggregated web search and page scraping on a mobile QuickJS runtime via search_web() and scrape_web(). Use whenever the user needs to look something up online — facts, news, study or coding topics, game/anime/character info. Defines route tags, the @game slot syntax, the game playbook, author filtering, game databases, scraping rules, and return fields.
---

# Web Search Toolkit — Usage Guide

Two free tools on a mobile (Android / QuickJS) runtime. Requests are **synchronous and serial** — speed comes from **fewer, sharper** calls.

- `search_web(query)` — multi-engine search, routed by a leading `@` tag.
- `scrape_web(url)` — fetch + extract a page (up to 5).

Judgment rules (no fabrication, anchor-first, budget) live in the **AI Behavior Spec**. This file is mechanics.

## Route tags — every query starts with exactly one

| Tag | Use for | Routes to |
|---|---|---|
| `@game` | game guides / characters | game Wiki(s) + bilibili + moegirl + bing |
| `@anime` | anime / manga / novel | bilibili + moegirl + bing |
| `@learn` | learning a topic (+video) | bilibili + juejin + bing |
| `@tech` | pure programming | juejin + bilibili + bing |
| `@baike` | encyclopedic facts | baike + moegirl + bilibili + bing |
| `@wiki` | general reference | moegirl + bilibili + bing |
| `@web` | news / weather / daily | bing |
| `@all` | exhaustive / rare word | bilibili first, then all engines |

Never send a tagless query — infer the category (see Behavior Spec Rule 4) and tag it. Bilibili sits early in every tag, so its high-signal video `tag` field + comments help even on study/tech queries.

## ⛔ Keyword rules (enforced in-script)

**The query is the single biggest lever on call-count.** One sharp anchor — `<游戏> <版本号> 前瞻` — sweeps ~20 results across every engine and returns the whole roster/汇总 in **one** search; read its `tagCloud` and you rarely need a second. Vague phrasing or per-character searches (`<角色> 星级`, `<角色> 元素`, repeated for each name) are exactly what turns a 5-call task into a 30-call one. Fix the keywords, not the count.

- **≤3 keywords, proper nouns only.** The engine hard-caps to the first 3 and returns the rest in `droppedKeywords` — if you see that field, your query ran truncated; re-issue with 3 deliberate words.
- **Filler is auto-stripped:** `版本` / `上线` / `新角色` / `新人物` / `汇总` / `一览` / `最新` are removed in-script (`@game 原神 版本 新角色 汇总` runs as just `原神`) and listed back in `strippedFiller`. Every game article contains these words — they eat a keyword slot and dilute scoring without narrowing anything. The version slot wants a **number** (6.5), never the word 版本; anchor with a proper noun + a number. You should also drop 怎么 / 如何 / 打法 / 最强 yourself.

## 🎰 `@game` slot syntax (recommended) — structured, single-character

Write `@game` keywords as named slots; the engine reorders them to `game → character → patch` and appends any free words:

```
@game game_name=原神 character_name=流萤 patch_name=3.4   → runs as: 原神 流萤 3.4
@game game_name=原神 patch_name=6.5 前瞻                  → runs as: 原神 6.5 前瞻
```

- `character_name` is a **single slot** → one character per search (the value stops at the first space). This is how you avoid batching guessed names.
- Slots keep the game name first, so the 3-keyword cap never drops it.
- Free-form still works (`@game 原神 6.5 前瞻`) — slots are optional, use them when you know the pieces.

## 🎮 Game playbook

```
1. Roster first → @game game_name=<游戏> patch_name=<版本号> 前瞻   (1 search: which version + new names)
   If it fails → add author:<official-account>
2. Know the game → @game game_name=<游戏> character_name=<角色>   (one Wiki, no clash)
   Don't know it  → @game character_name=<角色>  (broadcast; read which Wiki answered)
       one Wiki answered → that's the home game
       two+ answered     → name clash → add game_name=<游戏>
3. Stats → game HAS a database? scrape the DB page (1 scrape > 3 searches). No DB? @game character_name=<角色> 培养攻略
4. Lore / story → @game character_name=<角色>  → game Wikis
```

**`@game` routing depends on whether you name a game.** Name one (`game_name=星铁 character_name=流萤`) → router prunes to that one Wiki: fast, collision-proof. Bare name (`character_name=流萤`) → router queries **all** game Wikis and keeps every hit, so a shared name shows hits from **both** games — that overlap is your clash signal. The router never auto-picks a game for a shared name. **Anchor the roster from the official 前瞻 before searching any character's stats** — read `tagCloud` to lock the names/version in one search; `statHint` / `multiNameWarning` flag when you jumped ahead.

## 🎯 Author filter

Append `author:<name>` (or `up:<name>`) → Bilibili results kept **only** if the uploader name contains that string (comma-separate several; case-insensitive substring). Stripped from keywords automatically. Use for official previews/announcements:
`@game game_name=原神 patch_name=6.6 前瞻 author:原神` → only official-account videos.

## 🗄️ Game databases — scrape directly (structured, fast)

| Game | Layer | URL | Returns |
|---|---|---|---|
| **Star Rail** | roster | `starrailstation.com/cn/characters` | all chars as `name(★rarity·element·path)` |
| | character | `starrailstation.com/cn/character/{pageId}` | stats, skills, eidolons, traces, relics |
| **Genshin** | list | `meropide.cn/chs/characters/` | ~120 character detail URLs |
| | skills | `meropide.cn/chs/characters/{中文名}/` | NA/Skill/Burst multipliers + talent costs |

- Get `{pageId}` / `{中文名}` from the list page first. Trust DB numbers over Bilibili titles.
- Genshin's meropide gives **multipliers**, not star/element — for those use `bwiki_ys` or the official preview, and mark if unconfirmed.
- **Auto-routing:** a stat-word `@game` query for these two games injects the DB URL as the top result (`engine:"datasite"`) and sets `dbUrl`. Other games have no DB; `statHint` still says confirm via 前瞻/Wiki.

## Reading results without scraping (often enough)

- `bilibili:video` — title + **`tag`** (version/character names — highest-signal) + desc + `play` + `pubdate` + `author`.
- `bilibili:article` — title + summary (`summaryEmpty:true` = none).
- `moegirl` / `bwiki_*` / `prts_wiki` / `juejin` — API title + snippet.

Read snippets before scraping — you're frequently already done.

## Scraping — when, and what never

**Worth scraping:** `bing` hits (stub only), full `moegirl` / `bwiki_*` pages, the game DB pages. Pick the **1–2 most relevant** — on breadth queries the engine already pre-selects scrapeable ones as `topSources`, so scrape from that list.

**Bilibili (special):**
- Video URL (`…/video/av…` or `BV…`) → `bilibiliDeep`: title/desc/stats, `pinnedComment`, hot/recent/insightful `comments`, `danmakuTexts`.
- Column URL (`…/read/cv…`) → hot comments only (body is JS-rendered).
- On failure you get an **explicit error reason** (cid missing / -412 / deleted / login). Don't retry — fall back to the snippet.

**Never scrape (always empty/blocked):** `mihoyo/hoyoverse/hoyolab` · `fandom/gamepedia` · `game8/prydwen/gamesradar/genshin.gg` · `baike.baidu/zhihu/jianshu` · `meropide.cn/.../stats/` and its homepage. If a `scrape_web` `error` starts with `SPA(...)`, abandon that URL.

## Return fields

`search_web` → `{ items:[{title,url,text,engine,spa?,summaryEmpty?,tag?,play?,pubdate?,author?,db?}], query, routeTag, total, tagCloud?, topSources?, scrapeHint?, dictPolluted?, droppedKeywords?, strippedFiller?, statHint?, dbUrl?, multiNameWarning?, routeCorrected?, budgetWarning? }`
- Results are **scored, sorted best-first, then trimmed**. Two return shapes by route:
  - **Breadth (`@game` / `@anime` / `@all`) → digest.** These **sweep every engine** (gathering ~20, see `total`) but **return only the top 3 snippets** plus `tagCloud` + `topSources`. The digest *is* the answer surface — read `tagCloud` for "who/which version", then scrape a `topSources` URL only if you need specifics. You will **not** get 20 snippets here; that's intentional.
  - **Lean / mid (`@web`=6, others=10) → snippets.** Full snippet list as before (news/study/tech need the prose), ≤3 per engine, ≤140 chars. No `topSources`.
  - `total` = how many were gathered before trimming; `items` = the returned slice. Read top-down and stop when answered.
- **`tagCloud`** = the names/versions digest, e.g. `["流萤×7","6.6×5"]`. Aggregated from Bilibili `tag` fields + title terms across results, then **filtered**: official/SPA sites (mihoyo/fandom/zhihu…) contribute nothing, and a term must appear across **≥2 distinct sources** to make the list (the `×N` is that cross-source count, not raw frequency). **Read this first** — for "which characters / which version" the cloud alone usually answers it, no snippet-reading or scraping needed. A name seen in only one source is *not* here — that's the anti-fluff design, not a bug.
- **`topSources`** (breadth only) = up to 5 slim `{url, title, engine}` — the best **scrapeable** pages (official/SPA URLs are already excluded). This is your detail path: the cloud says *what*, `topSources` says *where to scrape* for exact stats/dates. Pick `topSources[0]` or the game Wiki; don't scrape blindly.
- **`scrapeHint`** (breadth only) = a reminder that the cloud/titles are not a source for specifics — scrape a `topSources` URL or the Wiki for any exact number, never infer it.
- `query` = what the engine actually ran (capped + slots resolved) — compare to what you sent.
- `droppedKeywords` = query exceeded 3 words; only the first 3 ran. Re-issue with 3 chosen words.
- `strippedFiller` = filler words blocked before the query ran (`版本` / `新角色` / `汇总`…). They match every game article, so they narrow nothing — if your word is here, it did no work. Replace it with a proper noun or a version number, don't just resend.
- `dictPolluted:true` = junk-polluted round; switch to English. · `spa:true` = uncrawlable. · `tag` = Bilibili video tags (best version signal).
- **`statHint`** = `@game` stat-word query: confirm the roster first, pull exact numbers from a scraped DB/Wiki — never from a title. (Anti-fabrication backstop.)
- **`dbUrl`** + injected `engine:"datasite"` top item = scrape that DB for accurate numbers.
- **`multiNameWarning`** = you named 2+ characters in one stat query — query one confirmed character at a time.
- **`routeCorrected`** = the engine detected game intent and **rerouted your tag to `@game`** (e.g. `"@web → @game"`). You mis-tagged a game query; it was fixed for you this time — tag it `@game` yourself next time so you get the game Wikis and the all-engine breadth digest (`tagCloud` + `topSources`).
- **`budgetWarning`** = you've already searched this **same topic** many times. Soft (~8 searches): you very likely have the answer — synthesize and stop re-searching the same names. Hard (~14): **STOP** — write the answer from what you already have and mark anything unconfirmed. Re-searching the same names/attributes is the #1 token sink; this field is the engine telling you the well is dry.

`scrape_web` → `{ urls:[{url,title,content,error}], stats:{total,ok,spa} }`. A single Bilibili video URL also returns `bilibiliDeep`. `error` starting with `SPA(...)` → abandon; a non-empty Bilibili `error` tells you why.
