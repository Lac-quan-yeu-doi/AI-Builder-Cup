import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const projectFile = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8');

describe('Cloud Build infrastructure prerequisites', () => {
  const cloudBuild = projectFile('cloudbuild.yaml');

  it('checks existing tenant authorization before migrations and rechecks before rollout', () => {
    expect(cloudBuild).toContain('for phase in preflight migrate-bootstrap readiness; do');
    const preflight = projectFile('k8s/ci/core-preflight-job.yaml');
    expect(preflight).toContain('dist/bootstrap/authorization-readiness-main.js');
    expect(preflight).toContain('AUTHORIZATION_READINESS_PHASE');
    expect(preflight).toContain('value: pre-migration');
    expect(preflight).not.toContain('prisma migrate deploy');
  });

  it('checks the dedicated Core workload service accounts only', () => {
    expect(cloudBuild).toContain('"serviceaccount/celesnity-core-api"');
    expect(cloudBuild).toContain('"serviceaccount/celesnity-core-worker"');
    expect(cloudBuild).not.toContain('"serviceaccount/celesnity"');
  });

  it.each([
    ['k8s/base/workloads/api-deployment.yaml', 'celesnity-core-api'],
    ['k8s/base/workloads/worker-deployment.yaml', 'celesnity-core-worker'],
  ])('%s uses its dedicated service account', (manifestPath, serviceAccount) => {
    expect(projectFile(manifestPath)).toContain(`serviceAccountName: ${serviceAccount}`);
  });

  it('decodes the Spark execution image from ConfigMap YAML without depending on quotes', () => {
    expect(cloudBuild).toContain('kubectl create --dry-run=client --validate=false');
    expect(cloudBuild).toContain("-o jsonpath='{.data.SPARK_EXECUTION_IMAGE}'");
    expect(cloudBuild).not.toContain('SPARK_EXECUTION_IMAGE="$$(sed -n');

    for (const environment of ['dev', 'prod']) {
      expect(projectFile(`k8s/overlays/gcp/${environment}/config/core-config.yaml`)).toMatch(
        /^\s*SPARK_EXECUTION_IMAGE:\s*['"][^'"]+['"]$/mu,
      );
    }
  });
});
