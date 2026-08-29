# CM_Power_Website

Carbon Monitor power generation static dashboard.

Default site:

https://kowcomical.github.io/CM_Power_Website/

Website data is generated only by the authoritative CM Power Database and then deployed to the `gh-pages` branch for GitHub Pages.

## Runtime

Direct data generation from this repository is disabled. Run the publication command from `/data3/kow/CM_Power_Database`:

```bash
.envs/power_env/bin/python main.py publish
```

That command builds the website artifacts from the current CM Power Database, passes them to this repository, commits the generated files, and deploys GitHub Pages. `auto.sh` and direct `python upload.py` execution intentionally fail to prevent an alternate database source from being selected.
