import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const repositoryRoot = process.cwd();
const appRoot = join(repositoryRoot, 'app');

const featureRoots = [
  '(workspace)/plant-model/[siteId]/repairs/_components/repair-guides-feature.tsx',
  '(workspace)/plant-model/walkthrough/_components/plant-walkthrough-feature.tsx',
  '(workspace)/catalog/_components/catalog-explorer-feature.tsx',
  '(workspace)/metadata-crawler/_components/metadata-crawler-feature.tsx',
  '(workspace)/automations/_components/automation-workflow-feature.tsx',
  '(workspace)/automations/[workflowId]/_components/automation-workflow-detail-feature.tsx',
  '(workspace)/databases/[database]/sources/[sourceId]/_components/source-feature.tsx',
  '(workspace)/sql/_components/query-workbench-feature.tsx',
  '(workspace)/scripts/_components/script-workbench-feature.tsx',
  '(workspace)/databases/[database]/_components/database-feature.tsx',
  '(workspace)/databases/[database]/pipelines/[pipelineId]/_components/pipeline-canvas-feature.tsx',
  '_components/device/device-management-feature.tsx',
  '(workspace)/streaming/[adapterId]/_components/adapter-feature.tsx',
] as const;

const appWideComponentRoots = [
  '_components/ui',
  '_components/shared',
  '_components/layout',
  '_components/database-service',
  '_components/catalog',
  '_components/pipeline',
  '_components/execution',
  '_components/metadata-crawler',
  '_components/documents',
  '_components/automation-workflow',
  '_components/device',
  '_components/assistant',
  '_components/tutorials',
] as const;

const routeSegmentsWithLocalComponents = [
  '(workspace)/plant-model/[siteId]/repairs',
  '(workspace)/plant-model/walkthrough',
  '(workspace)/catalog',
  '(workspace)/metadata-crawler',
  '(workspace)/automations',
  '(workspace)/automations/[workflowId]',
  '(workspace)/scripts',
  '(workspace)/sql',
  '(workspace)/databases/[database]',
  '(workspace)/databases/[database]/pipelines/[pipelineId]',
  '(workspace)/databases/[database]/sources/[sourceId]',
  '(workspace)/documents',
  // Served as `/_internal` through a rewrite in next.config.ts.
  'internal',
] as const;

function sourceFiles(directory: string): readonly string[] {
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : /\.(?:ts|tsx)$/.test(path)
        ? [path]
        : [];
  });
}

describe('frameworks and drivers layer', () => {
  it('owns the App Router and every injected feature root at repository root', () => {
    expect(existsSync(join(appRoot, 'layout.tsx'))).toBe(true);
    expect(existsSync(join(repositoryRoot, 'src/app'))).toBe(false);

    expect(existsSync(join(appRoot, '(workspace)/administration/agents/page.tsx'))).toBe(false);

    for (const featureRoot of featureRoots) {
      expect(existsSync(join(appRoot, featureRoot)), featureRoot).toBe(true);
    }
  });

  it('separates app-wide components from components owned by a single route', () => {
    for (const root of appWideComponentRoots) {
      expect(existsSync(join(appRoot, root)), root).toBe(true);
    }

    for (const segment of routeSegmentsWithLocalComponents) {
      expect(existsSync(join(appRoot, segment, '_components')), segment).toBe(true);
    }
  });

  it('keeps route-local components private to their own route segment', () => {
    const localImport = /from ['"]@\/app\/\((?<group>[^)]+)\)\/(?<segment>[^/]+)\/_components\//gu;

    for (const file of sourceFiles(appRoot)) {
      const relativePath = relative(appRoot, file).replaceAll('\\', '/');
      for (const match of readFileSync(file, 'utf8').matchAll(localImport)) {
        const owner = `(${match.groups?.group})/${match.groups?.segment}/`;
        expect(relativePath.startsWith(owner), `${relativePath} imports ${match[0]}`).toBe(true);
      }
    }
  });

  it('confines the design-system engine to the shared primitives', () => {
    // Radix, cva and the class mergers are implementation details of
    // `_components/ui`. A screen reaching for them directly is how a second,
    // divergent design system starts. `lucide-react` is deliberately absent
    // from this list: icons are content, and screens pick their own.
    // `thinking-orbs` is on it: the wrapper pins the theme and the sizes.
    const engineImport =
      /from ['"](?:radix-ui|@radix-ui\/|class-variance-authority|clsx|tailwind-merge|cmdk|vaul|thinking-orbs)/;

    for (const file of sourceFiles(appRoot)) {
      const relativePath = relative(appRoot, file).replaceAll('\\', '/');
      if (relativePath.startsWith('_components/ui/')) {
        continue;
      }
      expect(readFileSync(file, 'utf8'), relativePath).not.toMatch(engineImport);
    }
  });

  it('has no Mantine left anywhere in the app layer', () => {
    for (const file of sourceFiles(appRoot)) {
      expect(readFileSync(file, 'utf8'), relative(appRoot, file)).not.toMatch(/@mantine\//);
    }
  });

  it('does not depend on infrastructure or legacy composition aliases', () => {
    const forbiddenImport = /from ['"](?:@\/src\/infrastructure|@\/contexts|@\/platform)/;

    for (const file of sourceFiles(appRoot)) {
      expect(readFileSync(file, 'utf8'), relative(repositoryRoot, file)).not.toMatch(
        forbiddenImport,
      );
    }
  });

  it('keeps transport timing out of React and releases monitors during cleanup', () => {
    const executionHook = readFileSync(
      join(appRoot, '_components/execution/use-execution-live-progress.ts'),
      'utf8',
    );
    const queryScreen = readFileSync(
      join(appRoot, '(workspace)/sql/_components/query-workbench-screen.tsx'),
      'utf8',
    );

    expect(executionHook).not.toMatch(/setInterval|EventSource|subscribeToProgress/);
    expect(executionHook).toContain('releaseMonitor(liveMonitor)');
    expect(queryScreen).toContain('monitorRef.current = releaseMonitor(monitorRef.current)');
  });
});
