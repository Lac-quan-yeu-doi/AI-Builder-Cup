import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadActionPolicyOverrides } from '@application/actions/action-policy';

function withTempYaml(contents: string, run: (path: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'agent-actions-'));
  const path = join(dir, 'agent-actions.yaml');
  writeFileSync(path, contents, 'utf8');
  try {
    run(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('loadActionPolicyOverrides', () => {
  it('parses a valid overrides file', () => {
    withTempYaml(
      'chart.delete: { mcpEnabled: true, approvalRequired: true, auditRequired: true }\n' +
        'automation.testFire: { mcpEnabled: false }\n',
      (path) => {
        expect(loadActionPolicyOverrides(path)).toEqual({
          'chart.delete': { mcpEnabled: true, approvalRequired: true, auditRequired: true },
          'automation.testFire': { mcpEnabled: false },
        });
      },
    );
  });

  it('throws when the file does not exist', () => {
    expect(() => loadActionPolicyOverrides('/nonexistent/agent-actions.yaml')).toThrow();
  });

  it('throws when the top-level YAML is not an object', () => {
    withTempYaml('- not\n- an\n- object\n', (path) => {
      expect(() => loadActionPolicyOverrides(path)).toThrow(
        'agent-actions.yaml must be an object keyed by action name',
      );
    });
  });

  it('throws when an entry is not an object', () => {
    withTempYaml('chart.delete: true\n', (path) => {
      expect(() => loadActionPolicyOverrides(path)).toThrow(
        'agent-actions.yaml entry "chart.delete" must be an object',
      );
    });
  });

  it('throws when an entry has an unknown key', () => {
    withTempYaml('chart.delete: { mcpEnabled: true, bogus: true }\n', (path) => {
      expect(() => loadActionPolicyOverrides(path)).toThrow(
        'agent-actions.yaml entry "chart.delete" has an unknown key: bogus',
      );
    });
  });

  it('throws when an entry value is not a boolean', () => {
    withTempYaml('chart.delete: { mcpEnabled: "yes" }\n', (path) => {
      expect(() => loadActionPolicyOverrides(path)).toThrow(
        'agent-actions.yaml entry "chart.delete.mcpEnabled" must be a boolean',
      );
    });
  });
});
