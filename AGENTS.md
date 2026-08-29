# AGENTS.md

## 项目概览

CM_Power_Website 是 Carbon Monitor 电力数据库的静态仪表盘，发布在 GitHub Pages：

https://kowcomical.github.io/CM_Power_Website/

本项目没有前端构建步骤。`index.html` 直接加载仓库内的 CSS、JS、数据文件和 vendored 依赖：

- `static_site/app.js`：驱动仪表盘交互与 ECharts 渲染。
- `static_site/styles.css`：主要布局和响应式样式。
- `tools/style.css`：生成的 overview HTML 使用的旧版 Semantic UI card/KPI 样式。
- `static_site/vendor/semantic.min.css`、`static_site/vendor/echarts.min.js`：浏览器端 vendored 依赖。

## 关键路径

- `README.md`：项目和部署的简短说明。
- `index.html`：静态页面壳，包含 Overview、Daily Trends、IEA Compare、Global Map 等面板和侧边栏控件。
- `upload.py`：只提供网站渲染、Git 提交、推送和部署函数；不得自行读取数据库。
- `auto.sh`：旧独立更新入口的阻断脚本；执行时必须明确失败并提示从权威 Power Database 发布。
- `requirements.txt`：固定 `pandas==2.1.1`，并以 `numpy<2` 避免旧版 pandas 与 NumPy 2.x 的二进制 ABI 不兼容。
- `data/data_description.csv`：overview 卡片使用的国家元数据。
- `data/data_for_scatter_plot.csv`：IEA Compare 面板消费的生成数据。
- `data/data_for_download.csv.gz`：压缩后的长表下载数据。
- `tools/data_description/*.html`：按能源类型、洲和详情显示状态生成的 overview 卡片片段。
- `tools/line_chart/*.json`：Daily Trends 使用的 ECharts option。
- `tools/stacked_area_chart/*.json`：Source Share 使用的 ECharts option。
- `tools/eu_countries.txt`：准备 IEA 对比数据时使用的欧盟国家列表。

`index.html` 中的 `Generation Mix` / Source Share 面板可能被有意隐藏，但仍保留在生成链路中。除非用户明确要求删除，不要把它当作死代码处理。

## 数据与生成模型

网站数据的唯一权威来源是 `/data3/kow/CM_Power_Database` 的正式 `publish` 制品。Power Website
不得搜索、猜测、配置或直接读取任何 Power Database 根目录，也不得提供独立数据生成入口。
`upload.py` 只接收当前 Power Database 发布器传入的 DataFrame/制品并生成静态页面资产。

主要能源类型：

`total`, `coal`, `gas`, `oil`, `nuclear`, `hydro`, `wind`, `solar`, `other`, `fossil`, `renewables`

UI 暴露的洲和区域：

`World`, `Africa`, `Asia`, `Europe`, `North America`, `Oceania`, `South America`

Source Share 堆叠类别：

- `Fossil`：`coal`, `gas`, `oil`
- `Nuclear`：`nuclear`
- `Renewables`：`solar`, `wind`, `other`, `hydro`

国家名称规范化和全部数据质量检查在权威 Power Database 生成发布制品时完成。网站不得从上一版
`data_for_download.csv.gz`、`data_for_scatter_plot.csv` 或元数据回填当前制品缺失的国家、日期、能源类型
或月份；每次发布必须以本次收到的制品完整替换网站数据，保证线上国家集合和数值只来自当前项目。

## 本地开发与验证

由于 `static_site/app.js` 使用 `fetch()`，本地查看网站时应通过 HTTP 服务访问，而不是直接打开 `index.html`：

```bash
python -m http.server 8000
```

访问：

```text
http://localhost:8000/
```

仅修改静态前端时不需要安装依赖或构建。修改 `index.html`、`static_site/app.js` 或 CSS 后刷新浏览器即可；部署静态资源变更时，可能需要同步更新 `index.html` 中的 query-string cache buster。

常用检查：

```bash
python -m py_compile upload.py
python -m http.server 8000
```

手动验证重点：

- Overview 能加载 `tools/data_description/{energy}_{continent}_{none|visible}.html`。
- Daily Trends 能加载 `tools/line_chart/{energy}.json` 并按 continent 过滤。
- Source Share 能加载 `tools/stacked_area_chart/{Fossil|Nuclear|Renewables}.json`。
- IEA Compare 能加载 `data/data_for_scatter_plot.csv`。

如果面板出现 fetch 错误，先确认页面通过 HTTP 服务打开，并检查被请求的生成文件是否存在。

## 生成与部署注意事项

唯一允许的数据发布入口：

```bash
cd /data3/kow/CM_Power_Database
.envs/power_env/bin/python main.py publish
```

直接运行 `python upload.py` 或 `auto.sh` 必须返回非零状态，不能生成、提交或部署数据。
Power Database 发布器会动态加载网站渲染函数，并由 `git_push()` 提交 source branch、推送并通过
`/tmp/cm_power_website_gh_pages_auto` 临时 worktree 部署到 `gh-pages`。

生成和部署产物在 `upload.py` 的 `GENERATED_OUTPUTS` 和 `REMOVED_OUTPUTS` 中维护。新增、删除或迁移生成资产时，必须同步更新这些列表。

## 修改原则

- 保持无构建步骤的静态架构，除非用户明确要求进行更大的前端迁移。
- 前端修改优先集中在 `static_site/app.js` 和 `static_site/styles.css`，尽量小而直接。
- 将 `tools/data_description`、`tools/line_chart`、`tools/stacked_area_chart`、`data/data_for_scatter_plot.csv`、`data/data_for_download.csv.gz` 视为生成产物。
- 不要手动修改生成的 chart JSON 或 overview HTML 来做长期修复；应修改 `upload.py` 后重新生成。
- 不要改动 `static_site/vendor` 中的 vendored 文件，除非明确是在升级依赖。
- 仓库会忽略运行日志和缓存，例如 `log/`、`.cache/`、`.config/`、`wandb/`、未压缩的 `data/data_for_download.csv`。
- 避免破坏性 git 操作。自动部署流程已经会操作 `/tmp` 下的临时 worktree。

## GitHub 上传偏好

对于用户要求的仓库变更，完成验证后默认上传到 GitHub：

- 只 stage、commit、push 本次请求实际修改的文件。
- 不要纳入无关的既有工作区改动，除非用户明确要求。
- 推送 source branch 后，也要部署网站资产到 `gh-pages`，确保公开 GitHub Pages 站点同步更新。

## 更新日志规则

每次代码、数据处理、文档或自动化相关更新都必须记录在根目录 `UPDATE_LOG.md`，方便后续维护者追踪更新时间、更新内容和受影响路径。记录统一使用中文。

日期写在 `## YYYY-MM-DD` 标题中；同一天内有多条更新时，必须在日期标题下用 `### HH:MM - 更新标题` 分隔。条目正文不再重复日期和时间。

每条记录至少包含：

- `更新内容`：说明本次修复、数据处理、文档或自动化更新的核心内容。
- `影响路径`：列出本次实际修改、生成、删除或清理的文件和目录。
