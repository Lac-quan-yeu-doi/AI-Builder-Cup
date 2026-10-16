import { describe, expect, it } from 'vitest';

import { agentInfoArtifact } from '@/app/(workspace)/chat/_components/stage/document-pane';
import { createTranslator } from '@/app/_i18n/translate';

const t = createTranslator('en');

describe('agentInfoArtifact', () => {
  it('is a stable singleton artifact', () => {
    expect(agentInfoArtifact(t)).toEqual({
      id: 'document:agent-info',
      kind: 'document',
      title: 'Agent info',
      meta: 'Agent info',
    });
  });

  it('keeps its id when the locale changes', () => {
    expect(agentInfoArtifact(createTranslator('vi')).id).toBe(agentInfoArtifact(t).id);
  });
});
