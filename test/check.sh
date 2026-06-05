#!/usr/bin/env bash
# Full pre-ship check for Abyssal Vessel.
#   1. Extract the inline <script> from index.html
#   2. node --check it (catches brace/syntax breakage from edits)
#   3. Run the headless smoke test (crashes, caps, sanitizer, flow)
#
# Golden rule from the handoff: never ship a change without this passing.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "[1/3] extracting inline script..."
python3 -c "import re; h=open('index.html').read(); open('game.js','w').write(re.search(r'<script>(.*?)</script>', h, re.DOTALL).group(1))"

echo "[2/3] node --check..."
node --check game.js
echo "      syntax OK"

echo "[3/3] headless smoke test..."
node test/smoke.mjs

echo "ALL CHECKS PASSED"
