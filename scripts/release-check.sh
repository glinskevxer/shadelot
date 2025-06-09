#!/usr/bin/env bash
# What has to be true before a version goes out.
#
# It is a separate script from the smoke test because these are the checks that
# only matter at a release: that the version is a version, that the files the
# manifest ships are the files that exist, that nothing in the tree references a
# path it will not carry, and that the workflow runs the scripts it claims to.
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$here"

failures=0
fail() {
  echo "  FAIL  $1" >&2
  failures=$((failures + 1))
}
pass() {
  echo "  ok    $1"
}

version="$(node -e "process.stdout.write(require('./package.json').version)")"
if [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  pass "version is $version"
else
  fail "version $version is not a release version"
fi

if [ "$(node bin/shadelot.js --version)" = "$version" ]; then
  pass "the program prints the version the manifest carries"
else
  fail "the program and the manifest disagree about the version"
fi

for directory in $(node -e "process.stdout.write(require('./package.json').files.join(' '))"); do
  if [ -d "$directory" ]; then
    pass "ships $directory"
  else
    fail "the manifest ships $directory, which is not there"
  fi
done

bin="$(node -e "process.stdout.write(require('./package.json').bin.shadelot)")"
if [ -x "$bin" ]; then
  pass "the entry point is executable"
else
  fail "$bin is not executable"
fi

if head -1 "$bin" | grep -q '^#!/usr/bin/env node'; then
  pass "the entry point has a shebang"
else
  fail "the entry point has no shebang"
fi

for script in test lint format:check smoke coverage; do
  if node -e "process.exit(require('./package.json').scripts['$script'] ? 0 : 1)"; then
    pass "npm run $script exists"
  else
    fail "npm run $script is missing"
  fi
done

if grep -q 'examples/' .dockerignore; then
  fail "the image would not carry the examples the smoke test runs"
else
  pass "the image carries the examples"
fi

if grep -rn "console\.log" src/ >/dev/null 2>&1; then
  fail "src still writes straight to the console somewhere"
else
  pass "nothing in src writes straight to the console"
fi

if grep -rn "process\.exit" src/ >/dev/null 2>&1; then
  fail "src calls process.exit, which the exit code contract forbids"
else
  pass "src leaves the exit to the entry point"
fi

if [ "$failures" -ne 0 ]; then
  echo "release-check: $failures check(s) failed" >&2
  exit 1
fi
echo "release-check: ok for $version"
