# 更新日志

每次代码、数据处理、文档或自动化相关更新都必须记录在这里，方便后续维护者追踪更新时间、更新内容和受影响路径。记录统一使用中文。

日期写在 `## YYYY-MM-DD` 标题中；同一天内有多条更新时，必须在日期标题下用 `### HH:MM - 更新标题` 分隔。条目正文不再重复日期和时间。

## 2026-08-29

### 06:35 - 以中国日期标示多数国家更新并隐藏台湾展示

- 更新内容：将 Overview 的日期说明由“latest date for all countries”改为“latest date for most countries”，日期统一取所选能源下 China 的最新月份；生成器按相同口径写入后续 Overview 产物，前端同时从趋势数据校准当前已发布页面。新增统一的网站展示隐藏名单，仅从 Overview 卡片、Daily Trends、Generation Mix、IEA Compare 散点和 Global Map 几何中隐藏 Taiwan；台湾原始数据、下载文件、生成配置、国家计数、地图合计和 IEA 拟合统计均不因展示隐藏而过滤，未改变数据与汇总口径。同步更新 JavaScript 缓存标识。
- 数据更新：在用户更新 Power 数据后，用新生成器完整重建全部发布产物。下载数据现有 2,150,956 个唯一 country-date-type 键、71 个实际国家和 `EU27&UK` 聚合，最新日期为 2026-08-29；完整保留自动更新提交 `b91d220` 的 2,115,722 个键并新增 35,234 个键，新增数据国家为 Nigeria 和 Philippines。China Total 截止日期保持 2026-07-31；Taiwan 保留 30,118 行、最新到 2026-06-30。IEA Compare 为 45,672 个唯一比较键，完整保留上一版键，比较最新月份维持 2026-03。
- 验证：`python -m py_compile upload.py`、`node --check static_site/app.js` 和 `git diff --check` 通过；下载数据无重复键、无 `Generation` 行，154 个 Overview HTML、11 个趋势 JSON 和 3 个 Generation Mix JSON 均通过数量与解析检查。无头浏览器确认 Overview 显示 `2026-Jul` 与新标签，69 个 key countries 的统计仍包含 Taiwan，但台湾卡片不可见；Global Map 的最完整覆盖口径为 71 国且包含 Taiwan 数据，地图几何不展示 Taiwan。其余面板的统一隐藏分支和数据保留分支通过配置检查。
- 影响路径：`upload.py`、`static_site/app.js`、`index.html`、`data/data_for_download.csv.gz`、`data/data_for_scatter_plot.csv`、`data/iea_compare_metadata.json`、`tools/data_description/`、`tools/line_chart/`、`tools/stacked_area_chart/`、`UPDATE_LOG.md`

## 2026-08-15

### 01:36 - 将网站日更与部署链路迁移到 gpu104

- 更新内容：从 GitHub `master` 恢复中断迁移缺失的 Git 元数据和 186 个静态/生成资产，保留本机尚未提交的巴拿马更新记录；将项目根改为脚本位置自动解析，将电力数据库根改为 `CM_POWER_DATABASE_ROOT` 可配置并默认接入 `/data3/dengz/CM_Power_Database`，同时兼容 cm47 旧路径并增加四类运行输入预检。重写 `auto.sh` 的解释器选择、项目内日志/缓存和 `flock` 退出码处理，不再覆盖 `HOME`，真实任务失败会保留非零状态且并发任务不会截断日志。建立项目专用 Python 3.10 环境，并为 `pandas==2.1.1` 增加 `numpy<2` 兼容约束。
- 数据连续性：本机 Global 输入最新到 2026-08-14，但相对公开站缺少 Canada、Kenya、Mauritius、Mongolia、Panama、Taiwan，且 China、South Africa 等存在部分 country-date-type 缺口。生成器现以当前上游为准，并从上一版下载数据中回填仍在国家元数据表登记、但当前上游缺失的基础能源键，再重新计算派生总量；同步规范化 `Bosnia And Herz.` 为 `Bosnia & Herz`。本机 IEA 源只到 2025-12，因此 IEA Compare 也从上一版产物回填当前输入缺失的 year-month-country-type 键并保留已发布的 2026-03 月份标记，避免迁移造成国家、能源类型或历史月份回退。
- Git 与调度：将 origin 切换为本机已认证的 GitHub SSH 地址，补齐浅克隆的全部 heads refspec 与 `origin/gh-pages` 最新引用；`auto.sh` 会在 Python 加载生成器前先取得全链路锁、拒绝已有 staged 内容并执行 fast-forward-only source 同步，再生成和发布，避免使用旧生成器产出。在用户 crontab 安装每日 03:30（Asia/Shanghai）任务，显式绑定本机数据根和项目 `.venv`；该时刻较 02:00 上游定时任务近期最晚完成时间留有约 43 分钟缓冲。
- 验证：项目专用环境为 Python 3.10.13、NumPy 1.26.4、Pandas 2.1.1，`pip check`、`bash -n auto.sh`、`py_compile`、`node --check static_site/app.js` 和 `git diff --check` 通过；故障演练确认 Python 依赖预检会记录阶段、主任务非零退出码会原样传递。`process_data()` 使用本机 1,301,335 行 Global 输入完整运行三次，最终下载数据为 2,078,208 行、70 个国家、11 类能源、无重复 date-country-type、无 `Generation` 行，最新日期 2026-08-14；2026-08-13 公开版的 2,044,220 个下载数据键和 42,801 个 IEA Compare 键全部保留，新增 33,988 个下载数据键，IEA/对比最新月份均保持 2026-03。154 个 Overview HTML、11 个趋势 JSON、3 个堆叠 JSON 均通过解析和数量检查。
- 影响路径：`.git/`、`.gitignore`、`.venv/`（忽略）、用户 crontab、`AGENTS.md`、`README.md`、`UPDATE_LOG.md`、`auto.sh`、`requirements.txt`、`upload.py`、`data/data_for_download.csv.gz`、`data/data_for_scatter_plot.csv`、`data/iea_compare_metadata.json`、`tools/data_description/`、`tools/line_chart/`、`tools/stacked_area_chart/`。

### 02:25 - 暂停本机网站日更定时任务

- 更新内容：按要求暂停 gpu104 上的 CM_Power_Website 每日自动更新，将原 03:30 crontab 调度行保留为注释，便于后续按指令恢复；其他项目的定时任务未改动。回读 crontab 确认网站已无活动调度行，同时确认当前没有 `auto.sh` 或 `upload.py` 进程在运行。
- 影响路径：用户 crontab、`UPDATE_LOG.md`。

## 2026-08-09

### 19:38 - 将 Global Map 重构为 D3 SVG 世界地图

- 更新内容：停止使用 ECharts Canvas 渲染 Global Map，改用 D3、TopoJSON 与 Equal Earth 投影生成单一响应式 SVG，从渲染机制上消除 hover 和拖动时脏矩形重绘造成的横竖白色空缺。地图改用蓝—青—绿—黄—橙—红的连续多色阶，缺失数据保持中性灰；采用轻量 110m 世界几何并为新加坡、毛里求斯补充小国标记，所有当前报告国家均可落图。重新组织标题、日期、覆盖国家和合计值为出版物式横向层级，让地图占据主体；色带和时间轴移至地图下方，Tooltip 压缩日期与数值间距，并保留滚轮缩放、缩放后拖动、能源切换和每日滑块。日期滑动使用逐帧合并更新，避免连续拖动堆积重绘；同步更新静态资源缓存标识。
- 验证：`node --check static_site/app.js` 与 `git diff --check` 通过；Chromium 在 1440×1000、736×1000 和 390×844 下验证桌面、平板和手机布局，无运行时错误。地图为 1 个 SVG、0 个 Canvas，连续扫过国家后仅当前国家保留 hover 描边，未出现横竖白色空缺；缩放后拖动产生正确坐标变换。当前日期的 67 个报告国家全部匹配到国家几何或小国标记，120 次连续时间轴输入合并完成约 31ms；Solar 能源切换、紧凑 Tooltip 以及 Daily Trends / IEA Compare 回归检查均通过。
- 影响路径：`index.html`、`static_site/app.js`、`static_site/styles.css`、`static_site/vendor/d3.min.js`、`static_site/vendor/topojson-client.min.js`、`static_site/vendor/world-countries-110m.mjs`、`UPDATE_LOG.md`

### 18:53 - 放大 IEA 标题图例并重设计 Global Map

- 更新内容：放大 IEA Compare 顶部主标题、月份说明、洲别图例文字和圆点，保持原有居中层级及窄屏换行。将 Global Map 从等权 KPI 卡片与彩虹色阶重构为数据出版物式界面：以居中的 Daily Electricity Atlas 标识、能源标题、内联日期/覆盖国家/总量摘要替代四块工具栏卡片，新增带起止日期和动态进度的细线时间轴。地图统一为暖白纸面与低饱和纸色—青绿—深蓝单向色阶，色标移至底部横向居中；移除南极洲以放大主要大陆，地图边界改为纸色细线，No-data 国家使用中性灰，hover 使用暖橙强调，Tooltip 统一为纸色黑边紧凑卡片。桌面和手机分别使用自适应高度与等比例地理布局，避免窄屏世界地图纵向拉伸；能源与日期变化会同步更新标题、摘要、时间轴进度和地图，并同步更新静态资源缓存标识。
- 验证：`node --check static_site/app.js` 与本次前端文件的 `git diff --check` 通过；Chromium 在 1440×1000 与 390×844 下验证放大后的 IEA 顶部三层信息均清晰且无重叠。Global Map 在桌面和手机端保持正确地理比例、单画布且无运行时错误；时间轴从默认日期切换至 2026-05-11 后日期和进度同步更新，能源切换为 Solar 后标题、62 个报告国家、7,537 GWh 总量和地图数据同步刷新，United States Tooltip 正常显示 905 GWh。
- 影响路径：`static_site/app.js`、`static_site/styles.css`、`index.html`、`UPDATE_LOG.md`

### 18:09 - 统一 IEA Compare 与 Daily Trends 视觉风格

- 更新内容：将 IEA Compare 重构为与 Daily Trends 一致的暖白纸面、18px 圆角外框、柔和投影、居中标题与紧凑说明；十一类能源子图统一使用轻量纸面底色、细边框、细轴线、虚线水平网格和低饱和 1:1 参考线，标题与坐标字号层级同步收敛。洲别颜色改为低饱和编辑型配色，散点缩小并减轻描边；图例保留与散点语义一致的圆点，选中状态使用洲别颜色，未选状态改为中灰小圆点和同字重灰文字。Tooltip 改为与 Trends 相同的纸色黑边紧凑卡片，轴标题明确标注 TWh；保留洲别筛选、R² 动态更新、分层渐显与重排动画。同时移除 Daily Trends 各国家子图的最高点数值与峰值圆点，减少视觉杂乱，并同步更新静态资源缓存标识。
- 验证：`node --check static_site/app.js` 与本次前端文件的 `git diff --check` 通过；Chromium 在 1440×1000、1440×1500 和 390×844 下检查 IEA 的三列/四列完整布局、底部子图和手机单列布局，无裁切或运行时错误。真实取消 Asia 后图例转为中灰状态，筛选重排约 1.49 秒完成且 R²、坐标范围同步更新；Tooltip、首次洲别渐显和 80 次连续 hover 均可用。回归检查 Daily Trends 保持单画布、图例切换和 hover 正常，所有峰值标注均已移除。
- 影响路径：`static_site/app.js`、`static_site/styles.css`、`index.html`、`UPDATE_LOG.md`

### 17:14 - 调整 Daily Trends 图例选中层级

- 更新内容：将未选年份由接近背景色的淡色改为清晰的中性灰文字和 1px 灰色细线；选中后年份文字保持相同字重，仅恢复对应年份颜色并将色标线加粗到 4px，消除未选色标视觉上反而更粗、年份难以辨认的问题。图例色标改由富文本片段绘制，以便分别控制选中与未选状态的线宽，并同步更新静态资源缓存标识。
- 验证：`node --check static_site/app.js` 与本次前端文件的 `git diff --check` 通过；Chromium 在 1440×1000 和 390×844 下确认未选年份为可读灰色细线、选中年份为彩色粗线，文字字重切换前后一致且窄屏换行正常。真实点击 2019 连续执行“选中—取消—再次选中”，原有 1.1 秒动画、最新年份前景覆盖、单画布和 Tooltip 均正常，无运行时错误。
- 影响路径：`static_site/app.js`、`index.html`、`UPDATE_LOG.md`

### 14:20 - 强化 Daily Trends 年份状态与子图层次

- 更新内容：重新拉开年份图例的选中与未选中状态，选中年份使用完整色彩和粗体，未选年份降为低饱和浅色；将最新年份固定为最高折线层级，并在历史年份的绘制与收回动画期间同步生成最新年份前景覆盖线，保证动画全过程仍位于最前。为每个国家子图增加轻微纸面底色、细边框和柔和下投影，强化子图边界但不改成厚重卡片；同步更新静态资源缓存标识。
- 验证：`node --check static_site/app.js` 与本次前端文件的 `git diff --check` 通过；Chromium 在 1440×1000 与 390×844 下检查图例、子图阴影、单画布和响应式布局均正常，无运行时错误。真实点击 2019 连续执行“选中—取消—再次选中”，三段 1.1 秒动画均生效；动画中最新年份前景副本保持红色最高层，普通折线层级为历史年份 `z=5`、最新年份 `z=20`。World / Total 下 80 次连续 hover 约 1.40 秒，未出现明显性能回退。
- 影响路径：`static_site/app.js`、`static_site/styles.css`、`index.html`、`UPDATE_LOG.md`

### 13:41 - 重构 Daily Trends 图例、重复动画与悬停性能

- 更新内容：将 Daily Trends 主标题和年份图例统一居中，移除年份标签的双层边框与胶囊背景，改为无边框细线色标；修复临时渲染层清理后第二次切换不再动画的问题。年份绘制改为只覆盖当前视口内的子图，并使用独立 DOM/SVG 遮罩执行 CSS 裁切动画，屏幕外子图直接进入最终状态，避免反复重绘超长 ECharts 画布。Tooltip 改为单帧合并更新的轻量 DOM 组件，主图恢复稳定全量画布，避免 hover 擦除和额外 hover canvas，同时保留日期与各年份数值。
- 验证：`node --check static_site/app.js` 与 `git diff --check` 通过；Chromium 真实点击 2019 连续执行“选中—取消—再次选中”，两次选中均从左向右绘制，取消反向收回，动画结束后保持单画布且无运行时错误。World / Total 下 80 次连续 hover 从上一实现约 5.6 秒降至约 1.34 秒；1440×1000 连续扫过无竖向空白，390×844 单列布局中后续国家折线完整显示。
- 影响路径：`static_site/app.js`、`static_site/styles.css`、`index.html`、`UPDATE_LOG.md`

### 12:16 - 完善 Daily Trends 年份配色、动画与悬停稳定性

- 更新内容：移除 Daily Trends 的说明副标题并将国家名居中；年份图例改为自适应分组渐变，当前历史年份按 2019–2022 绿色、2023–2025 蓝色由浅到深编码，最新年份 2026 使用醒目红色，未选年份仍保留可辨识的年份文字颜色。新增年份选中时从 1 月向年末逐段绘制、取消时反向收回的 1.1 秒缓动，并在结束后清理临时画布；压缩 Tooltip 日期与数值间距，关闭 Daily Trends 的脏矩形重绘以修复鼠标移动后出现竖向空白的问题，同时完善窄屏标题和多行图例间距。同步更新静态资源缓存标识。
- 验证：`node --check static_site/app.js` 与 `git diff --check` 通过；Chromium 以真实图例点击验证选中和取消动画，抽查 40ms、250ms、600ms 与完成状态，临时画布完成后恢复为单画布且无运行时错误。以 1440×1000 连续扫过折线区域检查 Tooltip 和 hover 重绘，以 390×844、320×760 检查窄屏布局，均未出现折线擦除、标题截断或图例与国家名重叠。
- 影响路径：`static_site/app.js`、`index.html`、`UPDATE_LOG.md`

### 10:48 - 重设计 Daily Trends 多色编辑型折线图

- 更新内容：借鉴 Lieflat Charts 的 Hairline Line 编辑视觉语法，重做 Daily Trends 的纸感背景、发丝网格、月度刻度、左对齐国家标题、紧凑数值轴、Tooltip 和峰值注记；使用低饱和分类色区分年份，默认最近四年采用芥末黄、青绿、蓝和红等多色编码，并仅为最新年份保留月度锚点，兼顾逐日曲线辨识度与多国家长图性能。同步更新 CSS 与 JavaScript 缓存标识。
- 验证：`node --check static_site/app.js` 通过；使用本地 HTTP 服务与 Chromium 分别以 1440×1000、480×1000 视口检查 Total / World，并以 1440×1000 检查 Solar / Europe，图表均正常加载，桌面多列与窄屏单列布局正常。图例切换状态、Tooltip 和峰值注记实测通过，浏览器未捕获运行时错误。
- 影响路径：`static_site/app.js`、`static_site/styles.css`、`index.html`、`UPDATE_LOG.md`

## 2026-07-20

### 12:19 - 新增台湾网站数据说明与图表数据

- 更新内容：在国家数据说明表中新增台湾，来源登记为 MOEA Energy Administration 官方开放数据，洲别为 Asia，网站标准输出为 Daily、官方更新频率为 Monthly、无区域级数据，已验证 simulated 起点为 2016-01-01；先重建数据库全局汇总纳入台湾，再重新生成网站下载数据、Overview 卡片、Daily Trends、Source Share 和 IEA 对比产物。
- 验证：`data_description.csv` 共 71 个唯一国家记录，字段、日期和洲别检查通过。数据库全局汇总包含台湾 2019-01-01–2026-05-31 共 2,708 天、8 个标准能源、21,664 行；网站下载长表包含同一日期范围的 11 个类型、29,788 行。Asia/World 的 Total Overview、Total 趋势 JSON 和 Fossil 结构 JSON 均包含台湾，相关生成文件可正常解析。
- 风险：网站当前全局发布口径从 2019-01-01 开始，因此图表和下载数据晚于元数据中 simulated 的真实起点 2016-01-01；台湾官方月度值目前到 2026-05，新增温度不会在官方 6 月月量发布前单独推进发电数据。
- 影响路径：`data/data_description.csv`、`data/data_for_download.csv.gz`、`data/data_for_scatter_plot.csv`、`data/iea_compare_metadata.json`、`tools/data_description/`、`tools/line_chart/`、`tools/stacked_area_chart/`、`UPDATE_LOG.md`

## 2026-07-19

### 19:56 - 新增肯尼亚、毛里求斯和危地马拉网站数据说明

- 更新内容：在网站国家数据说明表中新增肯尼亚、毛里求斯和危地马拉，分别记录 KNBS / Kenya Power、Statistics Mauritius / Central Electricity Board 和 AMM 官方来源；三国均以已验证 simulated 的实际可用起点登记为 Daily 分辨率、Monthly 更新、无区域级数据，起始日期依次为 2016-01-01、2016-01-01 和 2017-01-01。台湾尚未生成人口加权日温度和 simulated，本次不加入。
- 验证：CSV 字段、国家唯一性、日期格式和洲别通过检查；三国 simulated daily/monthly 产物以及数据库 `Global_PM_corT.csv` 中的数据均已存在，网站生成链路可据此纳入对应卡片与图表。
- 影响路径：`data/data_description.csv`、`UPDATE_LOG.md`

### 15:53 - 重构 IEA 散点进场与筛选过渡

- 更新内容：修复 IEA Compare 进场渐显被 ECharts 后续绘制覆盖的问题，改为等待完整渲染结束后再按洲使用慢起缓动逐层淡入。针对 42,801 个散点筛选时的主线程重绘阻塞，新增两阶段临时画布快照：先平滑切换目标洲别可见性，再在后台更新坐标范围、参考线与 R²，最后将旧坐标散点层与正确的新图交叉淡化；坐标层同步淡出淡入以隐藏跳变。预计算各洲统计摘要以减少重复扫描，仅更新发生变化的洲别交互状态，并限制长图快照像素比、在过渡结束后立即释放画布；同步更新 CSS 与 JavaScript 缓存标识。
- 影响路径：`index.html`、`static_site/app.js`、`static_site/styles.css`、`UPDATE_LOG.md`

### 14:46 - 优化 IEA 散点尺寸与筛选动画时序

- 更新内容：适度缩小 IEA Compare 的散点和自定义图例圆点；将洲别画布层淡入改为每次进入 IEA Compare 时触发，并等待 ECharts 图层就绪后再按洲渐显。图例筛选改为点击后立即重算坐标范围、参考线与 R²，再并行执行对应洲别图层的短时淡出或淡入，消除动画结束后图表才更新的停顿，并允许不同洲别动画独立完成；同步更新 CSS 与 JavaScript 缓存标识。
- 影响路径：`index.html`、`static_site/app.js`、`static_site/styles.css`、`UPDATE_LOG.md`

### 14:31 - 重排 IEA 对比图并新增洲别图层筛选

- 更新内容：将 IEA Compare 的十一类能源按 Total、Fossil、Renewables 首行三图及其余能源两行四图重排，宽度不足时自动回退为两列或单列；将图表总标题和洲别图例移出 ECharts 画布，增大散点并更新洲别配色。自定义图例使用独立洲别画布层执行渐隐渐显，筛选后同步重算坐标范围与 R²，并保留键盘焦点、减少动态效果和 Tooltip 状态适配；同步更新 CSS 与 JavaScript 缓存标识。
- 影响路径：`index.html`、`static_site/app.js`、`static_site/styles.css`、`UPDATE_LOG.md`

### 07:45 - 放大 IEA 散点图并优化淡入性能

- 更新内容：放大 IEA Compare 的标题、图例、坐标文字、提示框和散点；将 Total 绘图区横向跨满两列，使其左右边缘与下方两列方形散点图对齐。移除高开销的逐点延迟动画，改为由浏览器合成层执行一次性透明度淡入，并适配减少动态效果的系统偏好；同步更新 CSS 与 JavaScript 缓存标识。
- 影响路径：`static_site/app.js`、`static_site/styles.css`、`index.html`、`UPDATE_LOG.md`

### 07:21 - 重设计 IEA 对比散点图布局与样式

- 更新内容：将 IEA Compare 调整为 Total 居中独占首行、其余十类能源按五行两列排列，并让所有绘图区保持等宽正方形；窄屏自动回退为单列。移除图内网格线，坐标刻度改为向内，仅保留左侧和底部轴线；更新洲别配色，为散点及图例圆点增加黑色描边。新增首次进入 IEA Compare 时的一次性渐显动画，后续图例筛选和窗口缩放不重复播放，并更新静态脚本缓存标识。
- 影响路径：`static_site/app.js`、`index.html`、`UPDATE_LOG.md`

### 00:17 - 优化图表切换与升级 ECharts

- 更新内容：修复 IEA Compare 初始化时重复调用 `setOption()`、页面切换重复销毁图表、隐藏图表参与 resize、图例更新重复传输完整数据，以及地图能源切换沿用旧日期下标等问题；为 Daily Trends、IEA Compare、Generation Mix 和 Global Map 增加按状态复用，IEA 依赖改为并行加载并恢复浏览器缓存，洲别筛选更新改为合并延后执行，地图能源切换后按该能源最新完整覆盖日期重新定位；将 vendored ECharts 从 5.6.0 升级至 6.1.0，并更新静态资源 cache buster。完整保留现有图表、国家、能源类型、数据点、图例、Tooltip 和筛选功能。
- 影响路径：`static_site/app.js`、`static_site/vendor/echarts.min.js`、`index.html`、`UPDATE_LOG.md`

## 2026-07-18

### 21:39 - 新增尼加拉瓜国家数据说明

- 更新内容：在网站国家数据说明表中新增尼加拉瓜记录，标注官方来源为 CNDC / MEM、洲别为 North America、网站数据时间分辨率为 Hourly、更新频率为 Daily、具有代理/GGD 机组级源数据，起始日期为 2012-01-01。
- 影响路径：`data/data_description.csv`、`UPDATE_LOG.md`

## 2026-07-17

### 16:53 - 新增巴拿马国家数据说明

- 更新内容：在网站国家数据说明表中新增巴拿马记录，标注数据源为 CND、洲别为 North America、网站数据时间分辨率为 Hourly、更新频率为 Daily、具有电厂级数据、起始日期为 2019-01-01。官方 Posdespacho 原始数据为 15 分钟分辨率；具体覆盖缺口、处理流程和风险记录在 CM_Power_Database 项目的 `data_description.md` 与 `UPDATE_LOG.md` 中。
- 影响路径：`data/data_description.csv`、`UPDATE_LOG.md`

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
