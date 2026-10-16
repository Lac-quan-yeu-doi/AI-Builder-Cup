import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repositoryRoot = resolve(__dirname, '../../../..');

describe('runtime secret rendering', () => {
  it('base64-encodes Secret Manager output without removing PEM line breaks', () => {
    const cloudBuild = readFileSync(resolve(repositoryRoot, 'cloudbuild.yaml'), 'utf8');

    expect(cloudBuild).toContain(
      'encoded=$$(gcloud secrets versions access latest --secret="$$secret" 2>/dev/null | base64 -w 0)',
    );
    expect(cloudBuild).not.toContain("tr -d '\\r\\n' | base64 -w 0");
  });
});
