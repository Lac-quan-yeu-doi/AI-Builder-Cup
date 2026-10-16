import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { afterEach, describe, expect, it } from 'vitest';

import nextConfig from '@/next.config';

const temporaryRoots: string[] = [];
const assetScript = join(process.cwd(), 'scripts/prepare-standalone-assets.mjs');

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe('portable standalone output', () => {
  it('anchors tracing and Turbopack to the project cwd', () => {
    expect(nextConfig.output).toBe('standalone');
    expect(nextConfig.outputFileTracingRoot).toBe(process.cwd());
    expect(nextConfig.turbopack?.root).toBe(process.cwd());
  });

  it('copies generated static assets and public files beside the standalone server', () => {
    const projectRoot = temporaryProject();
    writeFixture(join(projectRoot, '.next/static/chunks/app.js'), 'static asset');
    writeFixture(join(projectRoot, 'public/robots.txt'), 'public asset');
    writeFixture(join(projectRoot, '.next/standalone/.next/static/stale.js'), 'stale');

    const result = runAssetPreparation(projectRoot);

    expect(result.status, result.stderr).toBe(0);
    expect(
      readFileSync(join(projectRoot, '.next/standalone/.next/static/chunks/app.js'), 'utf8'),
    ).toBe('static asset');
    expect(readFileSync(join(projectRoot, '.next/standalone/public/robots.txt'), 'utf8')).toBe(
      'public asset',
    );
    expect(existsSync(join(projectRoot, '.next/standalone/.next/static/stale.js'))).toBe(false);
  });

  it('allows projects without a public directory', () => {
    const projectRoot = temporaryProject();
    writeFixture(join(projectRoot, '.next/static/chunks/app.js'), 'static asset');

    const result = runAssetPreparation(projectRoot);

    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(join(projectRoot, '.next/standalone/public'))).toBe(false);
  });
});

function temporaryProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'celesnity-standalone-'));
  temporaryRoots.push(root);
  mkdirSync(join(root, '.next/standalone'), { recursive: true });
  return root;
}

function writeFixture(path: string, content: string): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

function runAssetPreparation(projectRoot: string) {
  return spawnSync(process.execPath, [assetScript, projectRoot], {
    encoding: 'utf8',
  });
}
