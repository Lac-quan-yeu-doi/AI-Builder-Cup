import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repositoryRoot = resolve(__dirname, '../../../..');

describe('runtime assertion secret deployment contract', () => {
  it('declares the assertion key in both production manifests and injects it during deploy', () => {
    const devSecret = readRepositoryFile(
      'k8s/overlays/gcp/dev/secrets/core-runtime-secret.template.yaml',
    );
    const prodSecret = readRepositoryFile(
      'k8s/overlays/gcp/prod/secrets/core-runtime-secret.template.yaml',
    );
    const cloudBuild = readRepositoryFile('cloudbuild.yaml');

    expect(devSecret).toContain('MINDER_ASSERTION_PRIVATE_KEY_PEM:');
    expect(prodSecret).toContain('MINDER_ASSERTION_PRIVATE_KEY_PEM:');
    expect(cloudBuild).toContain('MINDER_ASSERTION_PRIVATE_KEY_PEM|minder-assertion-private-key');
  });

  it('declares stable assertion metadata in both production ConfigMaps', () => {
    const devConfig = readRepositoryFile('k8s/overlays/gcp/dev/config/core-config.yaml');
    const prodConfig = readRepositoryFile('k8s/overlays/gcp/prod/config/core-config.yaml');

    expect(devConfig).toMatch(/MINDER_ASSERTION_KEY_ID:\s*"[^"]+"/);
    expect(devConfig).toMatch(/MINDER_ASSERTION_TTL_SECONDS:\s*"\d+"/);
    expect(prodConfig).toMatch(/MINDER_ASSERTION_KEY_ID:\s*"[^"]+"/);
    expect(prodConfig).toMatch(/MINDER_ASSERTION_TTL_SECONDS:\s*"\d+"/);
  });
});

function readRepositoryFile(relativePath: string): string {
  return readFileSync(resolve(repositoryRoot, relativePath), 'utf8');
}
