#!/bin/bash

# Define variables for the command options and directory paths
python_cmd="/home/xuanrenSong/miniconda3/bin/python"
script_file="/data/xuanrenSong/CM_Power_Website/upload.py"
log_dir="/data/xuanrenSong/CM_Power_Database/log/daily_process"
email_log_dir="/data/xuanrenSong/CM_Power_Database/log/sending_email"
year_dir="$(date '+%Y')"
month_dir="$(date '+%m')"
log_file="nohup-$(date '+%Y-%m-%d').out"
email_script="/data/xuanrenSong/CM_Power_Database/code/global_code/sending_email.py"
email_log_file="email-$(date '+%Y-%m-%d').out"

# Create the year-based and month-based directories if they don't exist
mkdir -p "$log_dir/$year_dir/$month_dir"
mkdir -p "$email_log_dir/$year_dir/$month_dir"

# Run your command with nohup and redirect output to the file
nohup "$python_cmd" "$script_file" > "$log_dir/$year_dir/$month_dir/$log_file" 2>&1 &

# Wait for the command to finish before sending the email
wait

# Call the sending_email.py script after the log file is created, passing the log file path as an argument
nohup "$python_cmd" "$email_script" "$log_dir/$year_dir/$month_dir/$log_file" > "$email_log_dir/$year_dir/$month_dir/$email_log_file" 2>&1 &
