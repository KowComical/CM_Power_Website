# 更新日志

每次代码、数据处理、文档或自动化相关更新都必须记录在这里，方便后续维护者追踪更新时间、更新内容和受影响路径。记录统一使用中文。

日期写在 `## YYYY-MM-DD` 标题中；同一天内有多条更新时，必须在日期标题下用 `### HH:MM - 更新标题` 分隔。条目正文不再重复日期和时间。

## 2026-07-17

### 13:31 - 新增哥伦比亚小时级发电数据链并修复国家目录

- 更新内容：新增哥伦比亚 XM、SIMEM 与 Sinergox 数据采集及处理链，下载小时级资源发电量、系统发电量、燃料消耗、可用容量、有效容量、电厂属性和历史装机数据；历史月份复用本地缓存，最近三个自然月固定重新下载以接收 XM 回修，并取消下载或解析失败时静默退回本地日期的行为。依据资源属性、机组类型、燃料及历史装机将全部实际发电资源映射为煤、气、油、核、水、风、光和其他八类，生成 2000 年以来的小时、日、月标准化数据，并增加资源加总与系统总量完整性校验。新增与 Ember、IEA、BP 的月度和年度对比表及折线图。将新加坡数据统一迁回亚洲目录并清除根目录重复副本；清理本次处理遗留的 `/tmp` 探测文件和缓存；在网站国家数据说明表中新增哥伦比亚记录。
- 影响路径：`/data/xuanrenSong/CM_Power_Database/code/by_country/south_america/colombia/`、`/data/xuanrenSong/CM_Power_Database/code/global_code/global_function.py`、`/data/xuanrenSong/CM_Power_Database/code/global_code/global_all.py`、`/data/xuanrenSong/CM_Power_Database/code/global_code/all_process.py`、`/data/xuanrenSong/CM_Power_Database/data/by_country/south_america/colombia/`、`/data/xuanrenSong/CM_Power_Database/data/by_country/asia/singapore/`、已删除的 `/data/xuanrenSong/CM_Power_Database/data/by_country/singapore/`、`/tmp/` 中本任务临时文件、`data/data_description.csv`、`UPDATE_LOG.md`

## 2026-06-28

### 10:19 - 整理 AGENTS 说明文档

- 更新内容：将 `AGENTS.md` 改写为中文版本，优化章节排版，合并本地开发、验证、生成、部署和编辑指导中的重复说明，同时保留项目关键路径、数据依赖和更新日志规则。
- 影响路径：`AGENTS.md`、`UPDATE_LOG.md`

## 2026-06-22

### 03:57 - 新增更新日志规则

- 更新内容：为网站项目新增中文更新日志规则，要求后续所有代码、数据处理、文档或自动化相关更新都必须写入根目录 `UPDATE_LOG.md`；同时创建项目更新日志文件并记录本次规则补充。
- 影响路径：`AGENTS.md`、`UPDATE_LOG.md`
