#!/usr/bin/env bash
# A smoke test that runs the shipped entry point rather than importing anything.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$here"

fail() {
  echo "smoke: $1" >&2
  exit 1
}

node bin/shadelot.js --version >/dev/null || fail "the version flag did not run"
node bin/shadelot.js commands >/dev/null || fail "the command listing did not run"
node bin/shadelot.js commands --format json | node -e '
  let text = "";
  process.stdin.on("data", (chunk) => (text += chunk));
  process.stdin.on("end", () => {
    const rows = JSON.parse(text);
    if (!Array.isArray(rows) || rows.length === 0) {
      console.error("the listing came back empty");
      process.exit(1);
    }
  });
' || fail "the json listing was not usable"

if node bin/shadelot.js nonsense >/dev/null 2>&1; then
  fail "an unknown command should not succeed"
fi

echo "smoke: ok"
