#!/bin/bash

# Define variables for the command options and directory paths
python_cmd="/opt/miniconda3/bin/python"
script_file="/data/xuanrenSong/CM_Power_Website/upload.py"
log_dir="/data/xuanrenSong/CM_Power_Website/log/daily_process"
year_dir="$(date '+%Y')"
month_dir="$(date '+%m')"
log_file="nohup-$(date '+%Y-%m-%d').out"

# Create the year-based and month-based directories if they don't exist
mkdir -p "$log_dir/$year_dir/$month_dir"

# Run your command with nohup and redirect output to the file
nohup "$python_cmd" "$script_file" > "$log_dir/$year_dir/$month_dir/$log_file" 2>&1 &