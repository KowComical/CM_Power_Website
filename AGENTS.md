# AGENTS.md

## Project Summary

CM_Power_Website is a static dashboard for the Carbon Monitor power generation database. The published site is GitHub Pages at:

https://kowcomical.github.io/CM_Power_Website/

The app has no frontend build step. `index.html` loads checked-in CSS/JS and generated data files directly:

- `static_site/app.js` drives all dashboard interactions and ECharts rendering.
- `static_site/styles.css` contains the main layout and responsive styling.
- `tools/style.css` contains legacy Semantic UI card/KPI styles used by generated overview HTML.
- `static_site/vendor/semantic.min.css` and `static_site/vendor/echarts.min.js` are vendored browser dependencies.

## Important Paths

- `README.md`: short project/deploy description.
- `index.html`: static shell with sidebar controls and four panels: Overview, Daily Trends, Source Share, IEA Compare.
- `upload.py`: data generation plus automated commit/push/deploy workflow.
- `auto.sh`: daily runner for `upload.py`; sets cache/log paths and uses `flock` to avoid overlapping jobs.
- `requirements.txt`: currently only `pandas==2.1.1`.
- `data/data_description.csv`: country metadata used for overview cards.
- `data/data_for_scatter_plot.csv`: generated data consumed by the IEA comparison panel.
- `data/data_for_download.csv.gz`: generated compressed long-form download data.
- `tools/data_description/*.html`: generated overview card fragments by energy, continent, and details visibility.
- `tools/line_chart/*.json`: generated ECharts options for daily trend charts.
- `tools/stacked_area_chart/*.json`: generated ECharts options for source-share charts.
- `tools/eu_countries.txt`: EU country list used when preparing IEA comparison data.

## External Data Dependencies

`upload.py` depends on data outside this repository:

- `/data/xuanrenSong/CM_Power_Database/data/global/Global_PM_corT.csv`
- `/data/xuanrenSong/CM_Power_Database/data/other_database/iea/iea_cleaned.csv`

Do not assume `upload.py` can run in a clean clone without those files.

## Data Model

Primary energy types:

`total`, `coal`, `gas`, `oil`, `nuclear`, `hydro`, `wind`, `solar`, `other`, `fossil`, `renewables`

Continents/regions exposed in the UI:

`World`, `Africa`, `Asia`, `Europe`, `North America`, `Oceania`, `South America`

Stacked source-share categories:

- `Fossil`: `coal`, `gas`, `oil`
- `Nuclear`: `nuclear`
- `Renewables`: `solar`, `wind`, `other`, `hydro`

The generation script normalizes country names such as `EU27 & UK` to `EU27&UK`, `UK` to `United Kingdom`, and `US` to `United States`. It also drops accidental `country == "Generation"` rows.

## Local Development

Because `static_site/app.js` uses `fetch()`, open the site through a local web server rather than opening `index.html` directly:

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000/`.

If editing only the static frontend, no install/build step is required. Refresh the browser after changing `index.html`, `static_site/app.js`, or CSS files. Query-string cache busters in `index.html` may need to be bumped when deploying static asset changes.

## Regeneration And Deployment

Be careful with `upload.py`: running it as a script does more than generate files.

```bash
python upload.py
```

`main()` calls:

1. `process_data()`
2. `git_push(global_path)`

`git_push()` runs a fast-forward-only pull, stages generated outputs, commits them, pushes the current branch, then deploys to `gh-pages` via a temporary worktree at `/tmp/cm_power_website_gh_pages_auto`.

For local-only data regeneration, avoid invoking `main()` unless commit/push/deploy is intended. Use a small Python call to `process_data()` instead, or temporarily add a safe local entrypoint and remove it before committing.

Generated/deployed outputs are listed in `upload.py` as `GENERATED_OUTPUTS` and `REMOVED_OUTPUTS`. Keep that list in sync whenever adding or removing generated website assets.

## GitHub Upload Preference

For all user-requested changes in this repository, finish by uploading the completed work to GitHub after verification. Stage, commit, and push only the files changed for the user's request, and leave unrelated pre-existing working tree changes untouched unless the user explicitly asks to include them.

## Verification

Useful checks after changes:

```bash
python -m py_compile upload.py
python -m http.server 8000
```

Then manually verify the four tabs:

- Overview loads `tools/data_description/{energy}_{continent}_{none|visible}.html`.
- Daily Trends loads `tools/line_chart/{energy}.json` and filters by continent.
- Source Share loads `tools/stacked_area_chart/{Fossil|Nuclear|Renewables}.json`.
- IEA Compare loads `data/data_for_scatter_plot.csv`.

If a panel fails with a fetch error, confirm the site is being served over HTTP and the referenced generated file exists.

## Editing Guidance

- Preserve the no-build static architecture unless the user explicitly asks for a larger frontend migration.
- Prefer small, direct JS/CSS changes in `static_site/app.js` and `static_site/styles.css`.
- Treat `tools/data_description`, `tools/line_chart`, `tools/stacked_area_chart`, `data/data_for_scatter_plot.csv`, and `data/data_for_download.csv.gz` as generated artifacts.
- Do not hand-edit generated chart JSON or overview HTML for lasting fixes; change `upload.py` and regenerate.
- Keep vendored files in `static_site/vendor` unchanged unless intentionally upgrading dependencies.
- The repository intentionally ignores runtime logs/caches such as `log/`, `.cache/`, `.config/`, `wandb/`, and uncompressed `data/data_for_download.csv`.
- Avoid destructive git operations. The automated deploy path already manipulates a temporary worktree under `/tmp`.
