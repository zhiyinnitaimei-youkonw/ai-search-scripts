# Search Script Changelog

## v6.1 (2026-06-06) — 当前版本
- 13 引擎：Bing RSS + 萌娘 + B站 + 掘金 + 6个B站游戏Wiki + 百度百科 + 搜狗 + 维基百科
- 新增 `minEngines` 机制：@game 至少搜3个Wiki，@all 搜全部
- 新增 `minMatchFilter`：@all 路由过滤中文拆词噪音
- 新增 `Bing RSS` 通用网页搜索（5KB 轻量）
- 新增 `掘金` 技术文章搜索（JSON API）
- 修复 `console` 未定义导致脚本崩溃
- 修复十六进制 HTML 实体解码
- 修复 Wikipedia 默认路由导致超时
- 修复 B站空条目生成 `/cvundefined` URL

## v5.1 (原始版本)
- 3 引擎：萌娘百科 + B站Wiki(原神) + B站专栏
- @game/@anime/@wiki/@learn 路由

## v2.0 (原始版本) — 爬取脚本
- 单页 HTML 抓取 + 正文提取

## v2.1 — 爬取脚本修复版
- 移除底部残留搜索代码（CONFIG.engines 崩溃 bug）
- 新增重试机制（最多3次，递增延迟）
- 新增标题提取多策略（og:title → h1 → URL末段）
- 新增 Content-Type 检查
- 新增 console 安全兜底
