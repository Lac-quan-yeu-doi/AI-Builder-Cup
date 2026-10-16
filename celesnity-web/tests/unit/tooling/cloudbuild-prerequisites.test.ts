import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const projectFile = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8');

describe('Cloud Build infrastructure prerequisites', () => {
  it('checks the dedicated Web workload service account only', () => {
    const cloudBuild = projectFile('cloudbuild.yaml');

    expect(cloudBuild).toContain('"serviceaccount/celesnity-web"');
    expect(cloudBuild).not.toContain('"serviceaccount/celesnity"');
    expect(projectFile('k8s/base/workloads/web-deployment.yaml')).toContain(
      'serviceAccountName: celesnity-web',
    );
  });

  it('accepts the explicitly enforced Identity Platform setting used by the overlays', () => {
    const cloudBuild = projectFile('cloudbuild.yaml');
    const devConfig = projectFile('k8s/overlays/gcp/dev/config/web-config.yaml');

    expect(cloudBuild).toContain(
      'grep -Eq "CELESNITY_AUTH_MODE:[[:space:]]*[\'\\"]identity-platform[\'\\"]"',
    );
    expect(devConfig).toMatch(/CELESNITY_AUTH_MODE:\s*[\'"]identity-platform[\'"]/);
  });
});
