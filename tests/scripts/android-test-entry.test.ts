// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = process.cwd();

describe.skipIf(process.platform !== 'win32')('native regression entry validation', () => {
  function attempt(args: string[]) {
    const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/build-android.ps1', ...args], {
      cwd: projectRoot, encoding: 'utf8', timeout: 15_000,
      env: { ...process.env, ANDROID_SERIAL: '', TABLETOP_ANDROID_TOOLS: join(projectRoot, 'output', 'early-validation-no-tools') }
    });
    expect(result.error).toBeUndefined();
    expect(result.status).not.toBe(0);
    return `${result.stdout}\n${result.stderr}`;
  }

  it.each([{ args: [] }, { args: ['-Device', '   '] }])('requires an explicit test device before touching the build tools: $args', ({ args }) => {
    const output = attempt(['-NativeTests', ...args]);
    expect(output).toContain('dedicated test emulator');
    expect(output).not.toContain('Missing Android tool');
    expect(output).not.toContain('build:android:web');
  });

  it('rejects conflicting release-regression and debug flags before building', () => {
    const output = attempt(['-NativeTests', '-DebugBuild', '-Device', 'qa-only']);
    expect(output).toContain('NativeTests cannot be combined with DebugBuild');
    expect(output).not.toContain('Missing Android tool');
  });
});
