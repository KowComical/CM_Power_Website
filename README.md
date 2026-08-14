# CM_Power_Website

Carbon Monitor power generation static dashboard.

Default site:

https://kowcomical.github.io/CM_Power_Website/

The daily data workflow regenerates the static files in this repository and deploys them to the `gh-pages` branch for GitHub Pages.

## Runtime

`auto.sh` discovers the repository from its own location, selects an available Python interpreter, writes ignored runtime files under the project, and holds one `flock` lock while it fast-forward syncs source, generates data, commits, and deploys.

On gpu104, the generator reads the upstream database from `/data3/dengz/CM_Power_Database`. Set `CM_POWER_DATABASE_ROOT` to use a different database checkout and `CM_POWER_WEBSITE_PYTHON` to select a specific interpreter.
