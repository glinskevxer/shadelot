/**
 * The dependency advisory gate.
 *
 * This gate went red on the first push, and not because anything was wrong with
 * the tree: npm's advisory endpoint returned 503 and `npm audit` reports "I
 * could not reach the registry" with the same exit code it uses for "this tree
 * has a known vulnerability". A gate that cannot tell those apart is noise, and
 * it teaches everybody to ignore a red tick.
 *
 * So the decision half is separate from the fetching half, and these are the
 * cases it has to get right. The one that matters most is the last: an
 * unreadable answer must never read as a clean bill of health.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { blockingFor, isReport, render, verdict } from '../scripts/audit-verdict.mjs';

const root = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const verdictScript = join(root, 'scripts', 'audit-verdict.mjs');

const report = (counts, vulnerabilities = {}) => ({
  metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, ...counts } },
  vulnerabilities,
});

function runVerdict(input, level = 'high') {
  try {
    const stdout = execFileSync('node', [verdictScript, level], { input, encoding: 'utf8' });
    return { code: 0, stdout };
  } catch (error) {
    return { code: error.status, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
  }
}

describe('which severities block, at each level', () => {
  it('blocks only critical at critical', () => {
    expect(blockingFor('critical')).toEqual(['critical']);
  });

  it('blocks critical and high at high, which is what CI runs', () => {
    expect(blockingFor('high')).toEqual(['critical', 'high']);
  });

  it('widens as the level drops', () => {
    expect(blockingFor('moderate')).toEqual(['critical', 'high', 'moderate']);
    expect(blockingFor('low')).toEqual(['critical', 'high', 'moderate', 'low']);
  });

  it('refuses a level nobody meant rather than defaulting to something lenient', () => {
    expect(() => blockingFor('none')).toThrow(/unknown level "none"/);
    expect(() => blockingFor('info')).toThrow(/unknown level/);
  });
});

describe('recognising a report', () => {
  it('takes a real one', () => {
    expect(isReport(report({}))).toBe(true);
  });

  it('rejects everything that is not one', () => {
    for (const value of [
      null,
      undefined,
      '',
      42,
      [],
      {},
      { metadata: {} },
      { error: { code: 'E503' } },
    ]) {
      expect(isReport(value), JSON.stringify(value)).toBe(false);
    }
  });
});

describe('the verdict', () => {
  it('passes a clean tree', () => {
    const result = verdict(report({}), 'high');
    expect(result.usable).toBe(true);
    expect(result.blocking).toBe(0);
  });

  it('blocks on a critical', () => {
    const result = verdict(
      report({ critical: 1 }, { nasty: { severity: 'critical', via: [{ title: 'rce' }] } }),
      'high'
    );
    expect(result.blocking).toBe(1);
    expect(result.findings[0].name).toBe('nasty');
    expect(result.findings[0].via).toEqual(['rce']);
  });

  it('counts every blocking severity, not just the worst', () => {
    expect(verdict(report({ critical: 1, high: 2, low: 5 }), 'high').blocking).toBe(3);
  });

  it('lets a low through at high and stops it at low', () => {
    const only = report({ low: 3 }, { x: { severity: 'low', via: ['minor'] } });
    expect(verdict(only, 'high').blocking).toBe(0);
    expect(verdict(only, 'low').blocking).toBe(3);
  });

  it('orders the findings worst first', () => {
    const many = report(
      { critical: 1, high: 1 },
      { b: { severity: 'high', via: [] }, a: { severity: 'critical', via: [] } }
    );
    expect(verdict(many, 'high').findings.map((f) => f.severity)).toEqual(['critical', 'high']);
  });

  it('marks an unreadable answer unusable rather than clean', () => {
    for (const value of [null, { error: 'E503' }, 'not json at all']) {
      const result = verdict(value, 'high');
      expect(result.usable, JSON.stringify(value)).toBe(false);
      expect(result.blocking).toBe(0);
    }
  });
});

describe('what it prints', () => {
  it('names every severity present', () => {
    const lines = render(verdict(report({ critical: 1, low: 2 }), 'high'), 'high').join('\n');
    expect(lines).toMatch(/critical: 1/);
    expect(lines).toMatch(/low: 2/);
  });

  it('says plainly when nothing blocks', () => {
    expect(render(verdict(report({}), 'high'), 'high').join('\n')).toMatch(
      /no advisory .* at or above high/
    );
  });

  it('names each blocking package and what it is', () => {
    const result = verdict(
      report(
        { high: 1 },
        { lodash: { severity: 'high', via: [{ title: 'prototype pollution' }] } }
      ),
      'high'
    );
    expect(render(result, 'high').join('\n')).toMatch(/high {2}lodash {2}prototype pollution/);
  });
});

describe('the exit codes, which are what CI reads', () => {
  it('exits 0 on a clean report', () => {
    expect(runVerdict(JSON.stringify(report({}))).code).toBe(0);
  });

  it('exits 1 on a blocking advisory', () => {
    const input = JSON.stringify(report({ critical: 1 }, { x: { severity: 'critical', via: [] } }));
    expect(runVerdict(input).code).toBe(1);
  });

  it('exits 2 on anything it cannot read, which the caller must not treat as clean', () => {
    expect(runVerdict('npm error audit endpoint returned an error').code).toBe(2);
    expect(runVerdict('').code).toBe(2);
    expect(runVerdict('{"error":{"code":"E503"}}').code).toBe(2);
  });

  it('exits 2 with a message, not a stack trace, on a level nobody meant', () => {
    const result = runVerdict(JSON.stringify(report({})), 'nonsense');
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/unknown level "nonsense"/);
    expect(result.stderr).not.toMatch(/at Object|Node\.js v/);
  });
});

describe('the fetching half', () => {
  const script = readFileSync(join(root, 'scripts', 'audit-check.sh'), 'utf8');

  it('is executable', () => {
    expect(statSync(join(root, 'scripts', 'audit-check.sh')).mode & 0o111).toBeGreaterThan(0);
  });

  it('puts a deadline on the registry call, so a hang cannot hold a runner open', () => {
    expect(script).toMatch(/timeout "\$DEADLINE" npm audit/);
  });

  it('audits the production tree only', () => {
    expect(script).toMatch(/npm audit --omit=dev/);
  });

  it('retries rather than failing on the first unreadable answer', () => {
    expect(script).toMatch(/for attempt in \$\(seq 1 "\$ATTEMPTS"\)/);
  });

  it('says the tree was not checked when it could not be, rather than staying quiet', () => {
    expect(script).toMatch(/The tree was NOT checked/);
  });

  it('prints what the production tree actually is when it cannot check it', () => {
    expect(script).toMatch(/npm ls --omit=dev/);
  });
});

describe('the workflow calls it', () => {
  const workflow = readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8');

  it('runs the gate rather than npm audit directly', () => {
    expect(workflow).toMatch(/npm run audit/);
    expect(workflow).not.toMatch(/npm audit --omit=dev --audit-level/);
  });

  it('is wired as a script the manifest carries', () => {
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    expect(manifest.scripts.audit).toMatch(/audit-check\.sh/);
  });
});
