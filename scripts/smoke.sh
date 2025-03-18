#!/usr/bin/env bash
# A smoke test that runs the shipped entry point rather than importing anything.
# It exists because every other check in this repo imports the source directly,
# so a broken bin script or a broken export map would pass all of them.
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$here"

failures=0

check() {
  local name="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    echo "  ok    $name"
  else
    echo "  FAIL  $name" >&2
    failures=$((failures + 1))
  fi
}

expect_code() {
  local name="$1"
  local want="$2"
  shift 2
  "$@" >/dev/null 2>&1
  local got=$?
  if [ "$got" -eq "$want" ]; then
    echo "  ok    $name (exit $got)"
  else
    echo "  FAIL  $name wanted exit $want, got $got" >&2
    failures=$((failures + 1))
  fi
}

echo "smoke: the entry point"
check "version" node bin/shadelot.js --version
check "help" node bin/shadelot.js --help
check "command listing" node bin/shadelot.js commands

echo "smoke: the shipped examples"
check "card" node bin/shadelot.js card -w examples/works.json -r examples/recipe-olive.json -l 200
check "plan" node bin/shadelot.js plan -w examples/works.json -r examples/recipe-olive.json -g examples/lots.json -m JET-4
check "run sheet" node bin/shadelot.js run-sheet -p examples/profile-reactive-60.json
check "stock" node bin/shadelot.js stock -s examples/stock.json --reorder examples/reorder-points.json
check "substitute" node bin/shadelot.js substitute -w examples/works.json -c RB-19-ACME
check "effluent" node bin/shadelot.js effluent -w examples/works.json -d examples/day-batches.json
check "cost" node bin/shadelot.js cost -w examples/works.json -r examples/recipe-olive.json -m JET-4 -l 200
check "works" node bin/shadelot.js works -w examples/works.json
check "sequence" node bin/shadelot.js sequence -d examples/day-sequence.json
check "dip" node bin/shadelot.js dip -s examples/dip-series.json
check "order" node bin/shadelot.js order -o examples/order.json
check "quality" node bin/shadelot.js quality -r examples/roll-faults.json
check "analyse" node bin/shadelot.js analyse -m examples/month-batches.json --hours 480
check "metamerism" node bin/shadelot.js metamerism -s examples/standard-set.json -b examples/batch-set.json
check "correct" node bin/shadelot.js correct -s examples/standard-olive.json -b examples/batch-olive.json --strength 0.94

echo "smoke: the exit codes are the interface"
expect_code "unknown command is a usage error" 2 node bin/shadelot.js nonsense
expect_code "a missing file is not found" 3 node bin/shadelot.js card -w /nope.json -r examples/recipe-olive.json -l 200
expect_code "a bad load is invalid data" 4 node bin/shadelot.js card -w examples/works.json -r examples/recipe-olive.json -l 0

echo "smoke: every command in the listing runs its own help"
for name in $(node bin/shadelot.js commands --format json | node -e '
  let text = "";
  process.stdin.on("data", (chunk) => (text += chunk));
  process.stdin.on("end", () => {
    for (const row of JSON.parse(text)) console.log(row.command);
  });
'); do
  check "help for $name" node bin/shadelot.js "$name" --help
done

echo "smoke: the listing is machine readable"
if ! node bin/shadelot.js commands --format json | node -e '
  let text = "";
  process.stdin.on("data", (chunk) => (text += chunk));
  process.stdin.on("end", () => {
    const rows = JSON.parse(text);
    if (!Array.isArray(rows) || rows.length === 0) process.exit(1);
    if (rows.some((row) => !row.description || row.description.length < 6)) process.exit(1);
  });
'; then
  echo "  FAIL  the json listing was not usable" >&2
  failures=$((failures + 1))
else
  echo "  ok    json listing"
fi

if [ "$failures" -ne 0 ]; then
  echo "smoke: $failures check(s) failed" >&2
  exit 1
fi
echo "smoke: ok"
