#!/bin/bash
# 最初に1回だけ：必要なパッケージを入れる
set -e
cd "$(dirname "$0")"
npm install
echo "準備ができました。./run.sh で起動します。"
