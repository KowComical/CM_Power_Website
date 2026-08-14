#!/bin/bash

set -uo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$script_dir"
script_file="$project_dir/upload.py"
runtime_dir="${CM_POWER_WEBSITE_RUNTIME_DIR:-$project_dir}"
log_dir="$runtime_dir/log/daily_process"
year_dir="$(date '+%Y')"
month_dir="$(date '+%m')"
log_file="nohup-$(date '+%Y-%m-%d').out"
log_path="$log_dir/$year_dir/$month_dir/$log_file"
lock_file="/tmp/cm_power_website_upload.lock"

python_cmd="${CM_POWER_WEBSITE_PYTHON:-}"
if [[ -z "$python_cmd" ]]; then
    python_candidates=(
        "$project_dir/.venv/bin/python"
        "/home/dxinyu/anaconda3/envs/city_env/bin/python"
        "/data3/dengz/miniconda3/envs/cm_geo_env/bin/python"
        "/opt/miniconda3/bin/python"
    )
    for candidate in "${python_candidates[@]}"; do
        if [[ -x "$candidate" ]]; then
            python_cmd="$candidate"
            break
        fi
    done
fi

if [[ -z "$python_cmd" ]] && command -v python3 >/dev/null 2>&1; then
    python_cmd="$(command -v python3)"
fi

# Keep runtime cache/config/log files inside the project unless explicitly overridden.
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-$runtime_dir/.cache}"
export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$runtime_dir/.config}"
export MPLCONFIGDIR="$XDG_CACHE_HOME/matplotlib"
mkdir -p "$MPLCONFIGDIR"

# Create the year-based and month-based directories if they don't exist
mkdir -p "$log_dir/$year_dir/$month_dir"

# Make sure relative paths in Python work correctly.
cd "$project_dir" || exit 1

# Hold one lock across source synchronization, generation, commit, and deployment.
exec 9>"$lock_file"
flock -n -E 75 9
flock_status=$?
if (( flock_status == 75 )); then
    echo "[$(date --iso-8601=seconds)] Another website update is already running." >> "$log_path"
    exit 0
fi
if (( flock_status != 0 )); then
    echo "[$(date --iso-8601=seconds)] CM Power website update FAILED (phase=lock status=$flock_status)" >> "$log_path"
    exit "$flock_status"
fi

echo "[$(date --iso-8601=seconds)] CM Power website update START (python=$python_cmd)" >> "$log_path"

if [[ -z "$python_cmd" || ! -x "$python_cmd" ]]; then
    echo "No usable Python interpreter found. Set CM_POWER_WEBSITE_PYTHON." >&2
    echo "[$(date --iso-8601=seconds)] CM Power website update FAILED (phase=python-select)" >> "$log_path"
    exit 1
fi

# Pull before Python imports upload.py, so this run always uses the synchronized generator.
git diff --cached --quiet --
git_index_status=$?
if (( git_index_status == 1 )); then
    echo "[$(date --iso-8601=seconds)] CM Power website update FAILED (phase=git-index reason=staged-changes)" >> "$log_path"
    exit 1
fi
if (( git_index_status != 0 )); then
    echo "[$(date --iso-8601=seconds)] CM Power website update FAILED (phase=git-index status=$git_index_status)" >> "$log_path"
    exit "$git_index_status"
fi

git pull --ff-only >> "$log_path" 2>&1
pull_status=$?
if (( pull_status != 0 )); then
    echo "[$(date --iso-8601=seconds)] CM Power website update FAILED (phase=git-pull status=$pull_status)" >> "$log_path"
    exit "$pull_status"
fi

if ! "$python_cmd" -c 'import numpy, pandas' >/dev/null 2>&1; then
    echo "Python interpreter cannot import numpy and pandas: $python_cmd" >&2
    echo "[$(date --iso-8601=seconds)] CM Power website update FAILED (phase=python-preflight)" >> "$log_path"
    exit 1
fi

"$python_cmd" "$script_file" >> "$log_path" 2>&1
python_status=$?
if (( python_status != 0 )); then
    echo "[$(date --iso-8601=seconds)] CM Power website update FAILED (phase=python status=$python_status)" >> "$log_path"
    exit "$python_status"
fi

echo "[$(date --iso-8601=seconds)] CM Power website update END (status=0)" >> "$log_path"
