#!/bin/bash

# Define variables for the command options and directory paths
python_cmd="/opt/miniconda3/bin/python"
project_dir="/data/xuanrenSong/CM_Power_Website"
script_file="$project_dir/upload.py"
log_dir="$project_dir/log/daily_process"
year_dir="$(date '+%Y')"
month_dir="$(date '+%m')"
log_file="nohup-$(date '+%Y-%m-%d').out"
lock_file="/tmp/cm_power_website_upload.lock"

# Keep runtime cache/config files out of /data/xuanrenSong.
export HOME="/home/xuanrenSong"
export XDG_CACHE_HOME="$HOME/.cache"
export XDG_CONFIG_HOME="$HOME/.config"
export MPLCONFIGDIR="$XDG_CACHE_HOME/matplotlib"
export WANDB_CACHE_DIR="$XDG_CACHE_HOME/wandb"
export WANDB_CONFIG_DIR="$XDG_CONFIG_HOME/wandb"
export WANDB_DIR="$project_dir/wandb"
mkdir -p "$MPLCONFIGDIR" "$WANDB_CACHE_DIR" "$WANDB_CONFIG_DIR" "$WANDB_DIR"

# Create the year-based and month-based directories if they don't exist
mkdir -p "$log_dir/$year_dir/$month_dir"

# Make sure relative paths in Python work correctly.
cd "$project_dir" || exit 1

# Prevent overlapping update jobs from corrupting generated files or git state.
if ! flock -n "$lock_file" "$python_cmd" "$script_file" > "$log_dir/$year_dir/$month_dir/$log_file" 2>&1; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') Another website update is already running." >> "$log_dir/$year_dir/$month_dir/$log_file"
    exit 0
fi
