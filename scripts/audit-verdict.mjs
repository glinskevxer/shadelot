#!/usr/bin/env node
/**
 * The decision half of the dependency advisory gate.
 *
 * It reads an `npm audit --json` report on stdin and decides. It is separate
 * from the shell script that fetches the report for one reason: a gate nobody
 * can test is a gate nobody should trust, and the fetching half needs a network
 * while this half needs nothing. Feed it a canned report and it answers.
 *
 * Exit 0 means nothing blocking. Exit 1 means an advisory it actually saw.
 * Exit 2 means the input was not a report at all, which the caller must treat as
 * a reachability problem rather than a clean bill of health.
 */

const ORDER = ['critical', 'high', 'moderate', 'low', 'info'];

// `info` is reported but is never a level to block at: npm counts advisory notes
// there rather than vulnerabilities, so blocking on it blocks on everything. The
// shell half rejects it too, and the two halves have to agree or the gate means
// one thing under CI and another when somebody runs it by hand.
const LEVELS = ORDER.slice(0, 4);

export function blockingFor(level) {
  const at = LEVELS.indexOf(level);
  if (at === -1) {
    throw new RangeError(`unknown level "${level}", expected one of ${LEVELS.join(', ')}`);
  }
  return LEVELS.slice(0, at + 1);
}

export function isReport(value) {
  return Boolean(
    value && typeof value === 'object' && value.metadata && value.metadata.vulnerabilities
  );
}

export function verdict(report, level = 'high') {
  if (!isReport(report)) {
    return { usable: false, blocking: 0, counts: {}, findings: [] };
  }
  const blocking = blockingFor(level);
  const counts = report.metadata.vulnerabilities;
  const total = blocking.reduce((sum, severity) => sum + (counts[severity] || 0), 0);
  const findings = Object.entries(report.vulnerabilities || {})
    .filter(([, entry]) => blocking.includes(entry.severity))
    .map(([name, entry]) => ({
      name,
      severity: entry.severity,
      via: (entry.via || []).map((v) => (v && v.title) || v).filter(Boolean),
    }))
    .sort(
      (a, b) =>
        ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity) || a.name.localeCompare(b.name)
    );
  return { usable: true, blocking: total, counts, findings };
}

export function render(result, level) {
  const lines = [];
  if (!result.usable) {
    lines.push('audit: the input was not a usable report');
    return lines;
  }
  for (const severity of ORDER) {
    if (result.counts[severity]) lines.push(`  ${severity}: ${result.counts[severity]}`);
  }
  if (result.blocking === 0) {
    lines.push(`audit: no advisory in the production tree at or above ${level}`);
    return lines;
  }
  lines.push(`audit: ${result.blocking} blocking advisory/advisories in the production tree`);
  for (const finding of result.findings) {
    lines.push(`  ${finding.severity}  ${finding.name}  ${finding.via.join(', ')}`);
  }
  return lines;
}

async function readStdin() {
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

// Only run when invoked directly, so the test can import the functions.
if (process.argv[1] && process.argv[1].endsWith('audit-verdict.mjs')) {
  const level = process.argv[2] || 'high';
  const text = await readStdin();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  let result;
  try {
    result = verdict(parsed, level);
  } catch (error) {
    // A level nobody meant is a usage mistake, and it must never read as clean.
    process.stderr.write(`audit: ${error.message}\n`);
    process.exit(2);
  }
  const out = render(result, level);
  if (!result.usable) {
    for (const line of out) process.stderr.write(`${line}\n`);
    process.exit(2);
  }
  for (const line of out) process.stdout.write(`${line}\n`);
  process.exit(result.blocking > 0 ? 1 : 0);
}
