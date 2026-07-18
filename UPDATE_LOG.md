# 更新日志

每次代码、数据处理、文档或自动化相关更新都必须记录在这里，方便后续维护者追踪更新时间、更新内容和受影响路径。记录统一使用中文。

日期写在 `## YYYY-MM-DD` 标题中；同一天内有多条更新时，必须在日期标题下用 `### HH:MM - 更新标题` 分隔。条目正文不再重复日期和时间。

## 2026-07-19

### 00:17 - 优化图表切换与升级 ECharts

- 更新内容：修复 IEA Compare 初始化时重复调用 `setOption()`、页面切换重复销毁图表、隐藏图表参与 resize、图例更新重复传输完整数据，以及地图能源切换沿用旧日期下标等问题；为 Daily Trends、IEA Compare、Generation Mix 和 Global Map 增加按状态复用，IEA 依赖改为并行加载并恢复浏览器缓存，洲别筛选更新改为合并延后执行，地图能源切换后按该能源最新完整覆盖日期重新定位；将 vendored ECharts 从 5.6.0 升级至 6.1.0，并更新静态资源 cache buster。完整保留现有图表、国家、能源类型、数据点、图例、Tooltip 和筛选功能。
- 影响路径：`static_site/app.js`、`static_site/vendor/echarts.min.js`、`index.html`、`UPDATE_LOG.md`

## 2026-07-18

### 21:39 - 新增尼加拉瓜国家数据说明

- 更新内容：在网站国家数据说明表中新增尼加拉瓜记录，标注官方来源为 CNDC / MEM、洲别为 North America、网站数据时间分辨率为 Hourly、更新频率为 Daily、具有代理/GGD 机组级源数据，起始日期为 2012-01-01。
- 影响路径：`data/data_description.csv`、`UPDATE_LOG.md`

## 2026-07-17

### 13:31 - 新增哥伦比亚国家数据说明

- 更新内容：在网站国家数据说明表中新增哥伦比亚记录，标注数据源为 XM、洲别为 South America、时间分辨率为 Hourly、更新频率为 Daily、起始日期为 2000-01-01。哥伦比亚采集、处理和数据产出的详细更新记录保存在 CM_Power_Database 项目的 `UPDATE_LOG.md` 中。
- 影响路径：`data/data_description.csv`、`UPDATE_LOG.md`

## 2026-06-28

### 10:19 - 整理 AGENTS 说明文档

- 更新内容：将 `AGENTS.md` 改写为中文版本，优化章节排版，合并本地开发、验证、生成、部署和编辑指导中的重复说明，同时保留项目关键路径、数据依赖和更新日志规则。
- 影响路径：`AGENTS.md`、`UPDATE_LOG.md`

## 2026-06-22

### 03:57 - 新增更新日志规则

- 更新内容：为网站项目新增中文更新日志规则，要求后续所有代码、数据处理、文档或自动化相关更新都必须写入根目录 `UPDATE_LOG.md`；同时创建项目更新日志文件并记录本次规则补充。
- 影响路径：`AGENTS.md`、`UPDATE_LOG.md`
