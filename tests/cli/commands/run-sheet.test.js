import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createOutput } from '../../../src/cli/io.js';
import { run } from '../../../src/cli/program.js';

const works = fileURLToPath(new URL('../../../examples/works.json', import.meta.url));
const profile = fileURLToPath(
  new URL('../../../examples/profile-reactive-60.json', import.meta.url)
);
const capture = () => ({ out: createOutput(), err: createOutput() });

describe('the run sheet command', () => {
  it('prints every step with the clock down the side', async () => {
    const io = capture();
    expect(await run(['run-sheet', '-p', profile], io)).toBe(0);
    const text = io.out.text();
    expect(text).toMatch(/raise to sixty/);
    expect(text).toMatch(/soap off/);
    expect(text).toMatch(/^\s*clock\s+kind/m);
  });

  it('works the total out of the ramp rates rather than reading it', async () => {
    const io = capture();
    await run(['run-sheet', '-p', profile, '--format', 'json'], io);
    const { steps } = JSON.parse(io.out.text());
    const ramp = steps.find((step) => step.label === 'raise to sixty');
    expect(ramp.minutes).toBeCloseTo(20, 6);
    expect(steps.at(-1).elapsed).toBeCloseTo(
      steps.reduce((sum, step) => sum + step.minutes, 0),
      6
    );
  });

  it('reports the peak and how long it is held', async () => {
    const io = capture();
    await run(['run-sheet', '-p', profile], io);
    expect(io.out.text()).toMatch(/peak\s+95C/);
    expect(io.out.text()).toMatch(/held at peak\s+15m/);
  });

  it('checks the machine can reach the profile', async () => {
    const io = capture();
    expect(await run(['run-sheet', '-p', profile, '-w', works, '-m', 'JET-4'], io)).toBe(0);
    expect(io.out.text()).toMatch(/machine\s+JET-4 \(jet\)/);
  });

  it('refuses a machine that cannot reach the peak', async () => {
    const io = capture();
    expect(await run(['run-sheet', '-p', profile, '-w', works, '-m', 'PAD-1'], io)).toBe(4);
    expect(io.err.text()).toMatch(/PAD-1 cannot run this profile: peaks at 95/);
  });

  it('needs the works file to name a machine at all', async () => {
    const io = capture();
    expect(await run(['run-sheet', '-p', profile, '-m', 'JET-4'], io)).toBe(4);
    expect(io.err.text()).toMatch(/needs the works file/);
  });

  it('works the energy out when it has a machine and a load', async () => {
    const io = capture();
    await run(
      ['run-sheet', '-p', profile, '-w', works, '-m', 'JET-4', '-l', '200', '--format', 'json'],
      io
    );
    const { energy } = JSON.parse(io.out.text());
    expect(energy.totalKwh).toBeGreaterThan(0);
    expect(energy.motorKwh).toBeGreaterThan(0);
  });

  it('leaves the energy out when it has no load', async () => {
    const io = capture();
    await run(['run-sheet', '-p', profile, '-w', works, '-m', 'JET-4', '--format', 'json'], io);
    expect(JSON.parse(io.out.text()).energy).toBeNull();
  });

  it('refuses a profile file that is not there', async () => {
    const io = capture();
    expect(await run(['run-sheet', '-p', '/nope/profile.json'], io)).toBe(3);
  });
});
