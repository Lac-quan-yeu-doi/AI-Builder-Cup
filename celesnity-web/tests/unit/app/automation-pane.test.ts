import { describe, expect, it } from 'vitest';

import { automationsArtifact } from '@/app/(workspace)/chat/_components/stage/automation-pane';
import { createTranslator } from '@/app/_i18n/translate';

const t = createTranslator('en');

describe('automationsArtifact', () => {
  it('is a stable singleton artifact', () => {
    expect(automationsArtifact(t)).toEqual({
      id: 'automation:list',
      kind: 'automation',
      title: 'Automations',
      meta: 'Automation',
    });
  });

  it('keeps its id when the locale changes', () => {
    expect(automationsArtifact(createTranslator('vi')).id).toBe(automationsArtifact(t).id);
  });
});
