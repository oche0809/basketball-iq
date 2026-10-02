#!/bin/bash
# 開発用に起動（教材データ data/ を public/data/ にコピーしてから起動）。終了は Ctrl+C
set -e
cd "$(dirname "$0")"
[ -d node_modules ] || npm install
npm run dev -- --open
