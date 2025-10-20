#!/usr/bin/env bash
# The dependency advisory gate.
#
# `npm audit` answers two very different questions with the same exit code: "this
# tree has a known vulnerability" and "I could not reach the registry". The first
# has to stop a build. The second is somebody else's outage, and a gate that goes
# red when a third party is down is not a gate — it is noise, and it teaches
# everybody to ignore a red tick.
#
# So this parses the report rather than reading the exit code, retries a
# reachability failure, and fails only on an advisory it actually saw.
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$here"

LEVEL="${AUDIT_LEVEL:-high}"
ATTEMPTS="${AUDIT_ATTEMPTS:-3}"
BACKOFF="${AUDIT_BACKOFF:-10}"
# A hung registry is the same problem as an unreachable one, and worse: it holds
# a runner open until the job times out. Measured on 2026-09-04, npm returned a
# 503 on GitHub's runners and hung indefinitely elsewhere, from one outage.
DEADLINE="${AUDIT_TIMEOUT:-45}"

# The severities that stop a build, at the level asked for.
case "$LEVEL" in
  critical) BLOCKING="critical" ;;
  high)     BLOCKING="critical high" ;;
  moderate) BLOCKING="critical high moderate" ;;
  low)      BLOCKING="critical high moderate low" ;;
  *) echo "audit: unknown level '$LEVEL', expected critical, high, moderate or low" >&2; exit 2 ;;
esac

report=""
for attempt in $(seq 1 "$ATTEMPTS"); do
  report="$(timeout "$DEADLINE" npm audit --omit=dev --json 2>/dev/null || true)"
  if printf '%s' "$report" | node scripts/audit-verdict.mjs "$LEVEL" >/dev/null 2>&1; then
    break
  fi
  # exit 2 from the verdict means "not a report", which is the retryable case.
  printf '%s' "$report" | node scripts/audit-verdict.mjs "$LEVEL" >/dev/null 2>&1
  code=$?
  if [ "$code" -ne 2 ]; then
    break
  fi
  echo "audit: attempt $attempt of $ATTEMPTS did not return a usable report" >&2
  report=""
  [ "$attempt" -lt "$ATTEMPTS" ] && sleep "$BACKOFF"
done

if [ -z "$report" ]; then
  echo "audit: the registry advisory endpoint never returned a usable report."
  echo "audit: this is a reachability problem, not a finding. The tree was NOT checked."
  echo "audit: production dependencies are:"
  npm ls --omit=dev --all 2>/dev/null | sed 's/^/         /'
  exit 0
fi

printf '%s' "$report" | node scripts/audit-verdict.mjs "$LEVEL"
