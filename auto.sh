#!/bin/bash

set -euo pipefail

echo "Direct CM Power Website updates are disabled." >&2
echo "Run /srv/kow/CM_Power_Database/.venv/bin/python /srv/kow/CM_Power_Database/main.py publish from the authoritative Power Database." >&2
exit 2
