import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Production Agent migration network contract', () => {
  it('admits marked Core clients from the production Agent namespace, not only the serving Deployment', () => {
    const policy = readFileSync(resolve(process.cwd(), 'k8s/overlays/gcp/prod/networking/agent-api-network-policy.yaml'), 'utf8');
    expect(policy).toContain('kubernetes.io/metadata.name: minder-prod');
    expect(policy).toContain("celesnity.io/core-client: 'true'");
    expect(policy).not.toContain('app.kubernetes.io/name: minder-serve');
    expect(policy).toContain('port: 3001');
    expect(policy).toContain('app.kubernetes.io/component: api');
  });
});
