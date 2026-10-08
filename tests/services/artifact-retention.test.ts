import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'fog-artifact-test-'));
  roots.push(root);
  const runner = path.join(root, 'fixture.ps1');
  writeFileSync(runner, "param([string]$Library,[string]$Directory,[string]$Keep)\n$ErrorActionPreference='Stop'\n. $Library\nRemove-ObsoleteApkArtifacts -ArtifactDirectory $Directory -KeepApk $Keep | ConvertTo-Json -Compress\n");
  return { root, run: (keep: string) => spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', runner,
    '-Library', path.resolve('scripts/artifact-retention.ps1'), '-Directory', root, '-Keep', keep], { encoding: 'utf8' }) };
}
function release(root: string, version: string) {
  const apk = path.join(root, `Fog-TRPG-${version}.apk`);
  const bytes = Buffer.from(`Release fixture ${version}`);
  writeFileSync(apk, bytes);
  writeFileSync(`${apk}.sha256`, `${createHash('sha256').update(bytes).digest('hex')}  ${path.basename(apk)}\n`);
  writeFileSync(`${apk}.idsig`, 'incremental-install scratch');
  return apk;
}
afterEach(() => {
  for (const root of roots.splice(0)) {
    if (path.dirname(path.resolve(root)) !== path.resolve(tmpdir()) || !path.basename(root).startsWith('fog-artifact-test-')) throw new Error('Unsafe fixture cleanup');
    rmSync(root, { recursive: true, force: true });
  }
});

describe.skipIf(process.platform !== 'win32')('verified APK retention', () => {
  it('keeps two newest semantic versions and checksums, removing only named scratch and stale delivery files', () => {
    const { root, run } = fixture();
    for (const version of ['0.4.8', '0.4.9', '0.4.10', '0.4.11', '0.4.12']) release(root, version);
    writeFileSync(path.join(root, 'aligned-unsigned.apk'), 'scratch');
    writeFileSync(path.join(root, 'Fog-TRPG-qa-tests.apk'), 'test runner');
    writeFileSync(path.join(root, 'unrelated-demo.apk'), 'keep this');
    mkdirSync(path.join(root, 'nested'));
    writeFileSync(path.join(root, 'nested/Fog-TRPG-0.1.0.apk'), 'keep nested files');
    const result = run(path.join(root, 'Fog-TRPG-0.4.12.apk'));
    expect(result.status, result.stderr).toBe(0);
    expect(readdirSync(root).filter((name) => /^Fog-TRPG-/.test(name)).sort()).toEqual([
      'Fog-TRPG-0.4.11.apk', 'Fog-TRPG-0.4.11.apk.sha256', 'Fog-TRPG-0.4.12.apk', 'Fog-TRPG-0.4.12.apk.sha256'
    ]);
    expect(readFileSync(path.join(root, 'unrelated-demo.apk'), 'utf8')).toBe('keep this');
    expect(existsSync(path.join(root, 'nested/Fog-TRPG-0.1.0.apk'))).toBe(true);
    expect(JSON.parse(result.stdout).RemovedFiles).toBe(13);
  });
  it('does not delete previous releases if the new checksum is wrong', () => {
    const { root, run } = fixture();
    const old = release(root, '0.4.10'); release(root, '0.4.11'); const current = release(root, '0.4.12');
    writeFileSync(`${current}.sha256`, `${'0'.repeat(64)}  bad.apk\n`);
    const result = run(current); expect(result.status).not.toBe(0); expect(result.stderr).toContain('checksum must match');
    expect(existsSync(old)).toBe(true); expect(existsSync(`${old}.idsig`)).toBe(true);
  });
  it('rejects an outside keep target and leaves artifacts untouched', () => {
    const { root, run } = fixture(); const current = release(root, '0.4.12');
    mkdirSync(path.join(root, 'another directory'));
    const outside = release(path.join(root, 'another directory'), '0.4.13');
    const result = run(outside); expect(result.status).not.toBe(0); expect(result.stderr).toContain('inside the artifact directory'); expect(existsSync(current)).toBe(true);
    expect(existsSync(`${current}.idsig`)).toBe(true); expect(existsSync(outside)).toBe(true);
  });
  it('preserves newer releases when deliberately rebuilding an older version', () => {
    const { root, run } = fixture(); const old = release(root, '0.4.9');
    release(root, '0.4.10'); release(root, '0.4.11'); release(root, '0.4.12');
    const result = run(old); expect(result.status, result.stderr).toBe(0);
    expect(readdirSync(root).filter((name) => name.endsWith('.apk')).sort()).toEqual(['Fog-TRPG-0.4.11.apk', 'Fog-TRPG-0.4.12.apk', 'Fog-TRPG-0.4.9.apk']);
  });
});
