import { describe, expect, it } from 'vitest';
import {
  readAutoApprovalActions,
  writeAutoApprovalActions,
} from '@/app/(workspace)/administration/_components/agent-auto-approvals';

describe('agent auto-approval YAML helpers', () => {
  it('reads the governance auto-approval list', () => {
    expect(
      readAutoApprovalActions(`
governance:
  action_approvals: {}
  auto_approvals:
    - mcp.trino.list_catalogs
    - Write
  autonomy: manual
`),
    ).toEqual(['mcp.trino.list_catalogs', 'Write']);
  });

  it('writes a normalized list without disturbing the rest of the manifest', () => {
    const yaml = `name: chat-assistant
governance:
  action_approvals: {}
  autonomy: manual
tools:
  mode: all
`;

    expect(writeAutoApprovalActions(yaml, [' Write ', 'mcp.trino.list_catalogs', 'Write'])).toBe(
      `name: chat-assistant
governance:
  action_approvals: {}
  auto_approvals:
    - Write
    - mcp.trino.list_catalogs
  autonomy: manual
tools:
  mode: all
`,
    );
  });
});
