#!/bin/bash
# Studio 없이 플러그인 로직을 확인한다. luau 가 필요하다: https://github.com/luau-lang/luau/releases
# 사용법: plugin/test/run.sh            → 수집 결과 확인
#         plugin/test/run.sh --post     → 결과를 실제 자료 서버(localhost:8000)에도 보낸다
set -e
cd "$(dirname "$0")"
tmp=$(mktemp -d)
cat mock_roblox.luau ../SendToBoard.lua collect_test.luau > "$tmp/all.luau"
body=$(luau "$tmp/all.luau")
echo "플러그인 로직 OK"
if [ "$1" = "--post" ]; then
  curl -sS -X POST localhost:8000/studio/collect -H 'Content-Type: application/json' -d "$body"
  echo
fi
